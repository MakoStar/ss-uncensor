'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { ManiReader } = require('./reader');
const { DIRS, genPath, relative, platform } = require('../config/paths');
const { REGIONS, DIFF, diffListName, unity3dDiffName } = require('../config');

/* 确定名单来源区域 */
function resolveListRegion(region, targetRegion) {
  if (region === true || region === undefined || region === null) return targetRegion;
  if (Array.isArray(region)) return region.length > 0 ? region[region.length - 1] : targetRegion;
  return String(region);
}

const DIFF_HASH = DIFF.hash;
const DIFF_SIZE = DIFF.size;
const DIFF_MISSING = DIFF.missing;

const ALIAS = { b: 'base', t: 'target', e: 'ext', o: 'out', n: 'name', r: 'region', l: 'listName' };

/* 解析命令行参数 */
function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-')) continue;
    let raw = token;
    let value;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      raw = token.slice(0, eq);
      value = token.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
      value = argv[++i];
    } else {
      value = true;
    }
    opts[ALIAS[raw.replace(/^-+/, '')] || raw.replace(/^-+/, '')] = value;
  }
  return opts;
}

/* 按扩展名收集清单里的条目 */
function collectByExt(reader, ext) {
  const map = new Map();
  for (const res of reader.resources()) {
    if (!res.file.toLowerCase().endsWith(ext)) continue;
    map.set(res.file, res);
  }
  return map;
}

/* 把清单解析结果转成可对比的快照 */
function snapshot(res) {
  return res ? { hash: res.hash, size: res.size, fileType: res.fileType } : null;
}

/* 对比两份清单并按类型统计差异 */
function diffManifests({ basePath, targetPath, ext }) {
  const baseReader = new ManiReader(basePath);
  const targetReader = new ManiReader(targetPath);
  const baseMap = collectByExt(baseReader, ext);

  const items = [];

  const sameItems = [];
  let matched = 0;
  let same = 0;
  let hashDiff = 0;
  let sizeDiff = 0;
  let onlyInTarget = 0;

  for (const res of targetReader.resources()) {
    if (!res.file.toLowerCase().endsWith(ext)) continue;
    const other = baseMap.get(res.file);

    if (!other) {
      onlyInTarget += 1;
      items.push({ file: res.file, diff: [DIFF_MISSING], target: snapshot(res), base: null });
      continue;
    }

    matched += 1;

    const kinds = [];
    if (res.hash !== other.hash) kinds.push(DIFF_HASH);
    if (res.size !== other.size) kinds.push(DIFF_SIZE);

    if (kinds.length === 0) {
      same += 1;
      sameItems.push({ file: res.file, diff: [], target: snapshot(res), base: snapshot(other) });
      continue;
    }
    if (kinds.includes(DIFF_HASH)) hashDiff += 1;
    if (kinds.includes(DIFF_SIZE)) sizeDiff += 1;
    items.push({ file: res.file, diff: kinds, target: snapshot(res), base: snapshot(other) });
  }

  const configKeys = ['RES_VER', 'CLIENT_VER', 'GAME_VER'];
  const configOf = (reader) => {
    const out : any ={};
    for (const key of configKeys) out[key] = reader.getConfigValueByKey(key);
    return out;
  };

  return {
    sameItems,
    generatedAt: new Date().toISOString(),
    base: {
      path: relative(basePath),
      resources: baseReader.resourceData.size,
      matchedExt: baseMap.size,
      config: configOf(baseReader),
    },
    target: {
      path: relative(targetPath),
      resources: targetReader.resourceData.size,
      matchedExt: items.length + same,
      config: configOf(targetReader),
    },
    filter: { extension: ext },
    summary: {
      targetCount: items.length + same,
      baseCount: baseMap.size,
      same,
      matched,
      onlyInTarget,
      onlyInBase: baseMap.size - matched,
      hashDiff,
      sizeDiff,
      diffTotal: items.length,
    },
    items,
  };
}

/* 从差异结果生成待下载文件清单 */
function buildFileList(report, region) {

  return { region, platform: platform(), files: report.items.map((item) => item.file) };
}

/* 执行差异计算并输出结果与名单 */
function runDiff(options: any ={}) {
  const baseRegion = options.baseRegion || REGIONS[0];
  const targetRegion = options.targetRegion || REGIONS[REGIONS.length - 1];
  const ext = String(options.ext || DIFF.ext).toLowerCase();
  const basePath = path.resolve(options.base || genPath(baseRegion));
  const targetPath = path.resolve(options.target || genPath(targetRegion));
  const outDir = path.resolve(options.out || DIRS.generatedDiff);
  const fileName = options.name || unity3dDiffName(baseRegion, targetRegion, platform());

  for (const file of [basePath, targetPath]) {
    if (!fs.existsSync(file)) throw new Error(`manifest not found: ${file}`);
  }

  const full = diffManifests({ basePath, targetPath, ext });

  const { sameItems, ...rest } = full;
  const report = { ...rest, sameItems };

  const preview = Boolean(options.preview);
  const outFile = path.join(outDir, fileName);
  if (!preview) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify({ ...rest, sameItems: undefined }, null, 2)}\n`, 'utf8');
  }

  const s = report.summary;
  log.head(`DIFF BASE ${baseRegion} -> TARGET ${targetRegion}`);
  log.succ(`${s.targetCount} vs ${s.baseCount}  same ${s.same}  diff ${s.diffTotal}`);
  if (preview) log.tips(`preview only, nothing written`);
  else log.succ(`saved diff: ${relative(outFile)}`);
  log.debu(`${ext}  ${report.base.path} vs ${report.target.path}`);
  log.debu(
    `hash ${s.hashDiff}  size ${s.sizeDiff}  only-in-target ${s.onlyInTarget}  only-in-base ${s.onlyInBase}`
  );

  let listFile = null;
  if (options.region !== false) {
    const region = resolveListRegion(options.region, targetRegion);
    const listName = options.listName || diffListName(baseRegion, targetRegion, platform());
    listFile = path.join(outDir, listName);
    if (!preview) {
      const list = buildFileList(report, region);
      fs.writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
      log.succ(`saved list: ${relative(listFile)}`);
    }
  }

  return { report, outFile, listFile, preview };
}

/* 命令行入口 */
function main(argv) {
  runDiff(parseArgs(argv));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    log.erro(`diff failed: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { diffManifests, collectByExt, buildFileList, resolveListRegion, runDiff };
