const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { platformOf } = require('../config');
const { mergeVersions, mergeBundles } = require('./merge');
const { DIRS, patchDir, genPath, relative, platform } = require('../config/paths');
const {
  KEY,
  HEADER_ORDER,
  parseManifest,
  serializeManifest,
  getMeta,
  metaValues,
  bundleSize,
  bundleName
} = require('./parse');

/** 返回当前平台清单文件名 */
function namesOf(): { base: string; add: string; pattern: RegExp } {
  const spec = platformOf(platform());
  return {
    base: spec.base,
    add: `${spec.base.replace(/\.mani$/, '')}_add.mani`,
    pattern: new RegExp(`^p_(\\d+)_[a-z]+\\.${spec.base.replace(/\./g, '\\.')}$`, 'i')
  };
}

/** 收集基础补丁与增量清单 */
function discoverSources(
  dir: string,
  options: any = {}
): {
  base: { index: number; path: string; mani: { meta: { key: string; value: string }[]; bundles: string[] } };
  patches: { index: number; path: string; mani: { meta: { key: string; value: string }[]; bundles: string[] } }[];
  add: { index: number; path: string; mani: { meta: { key: string; value: string }[]; bundles: string[] } } | null;
} {
  const names = namesOf();
  const baseName = options.baseName || names.base;
  const pattern = options.patchPattern || names.pattern;

  let basePath = options.base ? path.resolve(options.base) : null;
  const patches = [];

  if (options.patches && options.patches.length > 0) {
    options.patches.forEach((file, i) => {
      const match = pattern.exec(path.basename(file));
      patches.push({ index: match ? Number(match[1]) : i + 1, path: path.resolve(file) });
    });
  } else {
    if (!fs.existsSync(dir)) throw new Error(`patch dir not found: ${dir}`);
    const hits = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = pattern.exec(entry.name);
      if (match) hits.push({ index: Number(match[1]), name: entry.name, path: path.join(dir, entry.name) });
      else if (!basePath && entry.name === baseName) basePath = path.join(dir, entry.name);
    }

    const byIndex = new Map();
    for (const hit of hits.sort((a, b) => a.name.localeCompare(b.name))) {
      byIndex.set(hit.index, hit.path);
    }
    for (const [index, file] of [...byIndex].sort((a, b) => a[0] - b[0])) {
      patches.push({ index, path: file });
    }
  }

  if (!basePath) throw new Error(`base manifest not found: ${path.join(dir, baseName)}`);

  const load = (file: string, index: number) => ({
    index,
    path: file,
    mani: parseManifest(fs.readFileSync(file))
  });

  const addPath = options.add ? path.resolve(options.add) : path.join(dir, names.add);
  const add = fs.existsSync(addPath) ? load(addPath, -1) : null;
  return { base: load(basePath, 0), patches: patches.map((p) => load(p.path, p.index)), add };
}

/** 用增量清单覆盖资源行 */
function applyAdd(bundles: string[], addLines: string[]): string[] {
  const list = bundles.slice();
  const index = new Map();
  list.forEach((line, i) => index.set(bundleName(line), i));
  for (const line of addLines) {
    const name = bundleName(line);
    if (index.has(name)) list[index.get(name)] = line;
    else {
      index.set(name, list.length);
      list.push(line);
    }
  }
  return list;
}

/** 合并补丁生成清单行 */
function buildManifest({
  base,
  patches,
  add = null,
  mode = 'snapshot'
}: {
  base: { index: number; path: string; mani: { meta: { key: string; value: string }[]; bundles: string[] } };
  patches: { index: number; path: string; mani: { meta: { key: string; value: string }[]; bundles: string[] } }[];
  add?: { index: number; path: string; mani: { meta: { key: string; value: string }[]; bundles: string[] } } | null;
  mode?: string;
}): string[] {
  const versions = new Map();
  for (const item of base.mani.meta) {
    if (!versions.has(item.key)) versions.set(item.key, item.value);
  }
  for (const patch of patches) mergeVersions(versions, patch.mani);
  if (add) mergeVersions(versions, add.mani);

  let bundles = mergeBundles(base.mani.bundles, patches, mode);
  if (add) bundles = applyAdd(bundles, add.mani.bundles);

  const latest = patches.length > 0 ? patches[patches.length - 1] : base;
  const patchFiles = metaValues(latest.mani, KEY.patchFile).map((v) => `${KEY.patchFile}:${v}`);

  let infos;
  if (patches.length > 0) {
    infos = patches.map((patch) => {
      const files = metaValues(patch.mani, KEY.patchFile);
      const size = files.reduce((sum, f) => sum + bundleSize(f), 0);
      return `${KEY.patchInfo}:${patch.index}|${getMeta(patch.mani, KEY.resVer, '')}|${files.length}|${size}`;
    });
  } else {
    infos = metaValues(base.mani, KEY.patchInfo).map((v) => `${KEY.patchInfo}:${v}`);
  }

  const ver = getMeta(base.mani, KEY.patchVer, '') || (patches.length > 0 ? String(patches.length) : '');

  const emitted = new Set();
  const lines = [];
  for (const key of HEADER_ORDER) {
    if (!versions.has(key)) continue;
    lines.push(`${key}:${versions.get(key)}`);
    emitted.add(key);
  }
  for (const item of base.mani.meta) {
    if (emitted.has(item.key) || item.key.startsWith('$BIN_DIFF')) continue;
    lines.push(`${item.key}:${item.value}`);
    emitted.add(item.key);
  }

  lines.push(...patchFiles);
  lines.push(...infos);
  if (ver) lines.push(`${KEY.patchVer}:${ver}`);
  lines.push(...bundles);
  return lines;
}

/** 推导区域的最新版本号 */
function regionVersion(region: string): {
  client_ver: string;
  game_ver: string;
  patch_num: string;
  version_str: string;
} {
  const sources = discoverSources(patchDir(region));
  const latest = sources.patches.length > 0 ? sources.patches[sources.patches.length - 1] : sources.base;
  const pick = (key: string): string => getMeta(sources.base.mani, key, '') || getMeta(latest.mani, key, '');
  const client = pick(KEY.clientVer);
  const game = pick(KEY.gameVer);
  const num = pick(KEY.patchVer) || String(sources.patches.length);
  return {
    client_ver: client,
    game_ver: game,
    patch_num: num,
    version_str: `[c${client}_g${game}_p${num}]`
  };
}

/** 生成并写出区域清单 */
function buildRegion(
  region: string,
  options: any = {}
): { region: string; lines: string[]; text: string; out: string } {
  const sources = discoverSources(patchDir(region), options);
  const mode = options.mode || 'snapshot';
  const lines = buildManifest({ ...sources, mode });
  const text = serializeManifest(lines);

  const out = path.resolve(options.output || genPath(region));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, 'utf8');

  const bundles = lines.filter((l) => !l.startsWith('$')).length;
  if (mode !== 'snapshot') log.debu(`${region} mode ${mode}`);
  log.succ(
    `${region.padEnd(4)} ${String(sources.patches.length).padStart(2)} patches  ${bundles} resources  -> ${relative(out)}`
  );
  return { region, lines, text, out };
}

/** 列出已有清单的区域 */
function knownRegions(): string[] {
  if (!fs.existsSync(DIRS.manifest)) return [];
  return fs
    .readdirSync(DIRS.manifest, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

module.exports = {
  namesOf,
  discoverSources,
  buildManifest,
  buildRegion,
  knownRegions,
  regionVersion
};
