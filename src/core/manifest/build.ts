'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { platformOf } = require('../config');
const { mergeVersions, mergeBundles } = require('./merge');
const { DIRS, patchDir, genPath, relative, platform } = require('../config/paths');
const { KEY, HEADER_ORDER, parseManifest, serializeManifest, getMeta, metaValues, bundleSize} = require('./parse');

/* 返回参与构建的文件名常量 */
function namesOf() {
  const spec = platformOf(platform());
  return {
    base: spec.base,
    pattern: new RegExp(`^p_(\\d+)_m\\.${spec.base.replace(/\./g, '\\.')}$`, 'i'),
  };
}

/* 扫描目录找出可用的清单来源 */
function discoverSources(dir, options: any ={}) {
  const names = namesOf();
  const baseName = options.baseName || names.base;
  const pattern = options.patchPattern || names.pattern;

  let basePath = options.base ? path.resolve(options.base) : null;
  const patches = [];

  if (options.patches && options.patches.length > 0) {
    options.patches.forEach((file, i) => {
      const m = pattern.exec(path.basename(file));
      patches.push({ index: m ? Number(m[1]) : i + 1, path: path.resolve(file) });
    });
  } else {
    if (!fs.existsSync(dir)) throw new Error(`patch dir not found: ${dir}`);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const m = pattern.exec(entry.name);
      if (m) patches.push({ index: Number(m[1]), path: path.join(dir, entry.name) });
      else if (!basePath && entry.name === baseName) basePath = path.join(dir, entry.name);
    }
    patches.sort((a, b) => a.index - b.index);
  }

  if (!basePath) throw new Error(`base manifest not found: ${path.join(dir, baseName)}`);

  const load = (file, index) => ({
    index,
    path: file,
    mani: parseManifest(fs.readFileSync(file)),
  });

  return { base: load(basePath, 0), patches: patches.map((p) => load(p.path, p.index)) };
}

/* 用基准清单与补丁链合成区域清单 */
function buildManifest({ base, patches, mode = 'snapshot' }) {
  const versions = new Map();
  for (const item of base.mani.meta) {
    if (!versions.has(item.key)) versions.set(item.key, item.value);
  }
  for (const patch of patches) mergeVersions(versions, patch.mani);

  const bundles = mergeBundles(base.mani.bundles, patches, mode);

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

/* 构建单个区域的清单 */
function buildRegion(region, options: any ={}) {
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

/* 列出已有合成产物的区域 */
function knownRegions() {
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
};
