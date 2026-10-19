'use strict';

const fs = require('fs');
const path = require('path');
const { resolvePlatform, REGIONS, genManiName, versionFileName } = require('./index');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');

const HOME = process.env.SS_UNCENSOR_HOME ? path.resolve(process.env.SS_UNCENSOR_HOME) : null;

let outputRoot = HOME ? path.join(HOME, 'output') : path.resolve(process.cwd(), 'output');

const BIN_ROOT = ROOT.includes('app.asar') ? ROOT.replace('app.asar', 'app.asar.unpacked') : ROOT;

const APP_DIR = process.env.SS_APP_DIR ? path.resolve(process.env.SS_APP_DIR) : (BIN_ROOT === ROOT ? ROOT : path.dirname(BIN_ROOT));

/* 抓取器统一放安装目录的 ResourceTool */
const FETCHER_DIRS = ['ResourceTool', path.join('tool', 'fetcher')];

const FETCHER_CANDIDATES = FETCHER_DIRS.flatMap((dir) => [
  path.join(APP_DIR, dir, 'ResourceFetcher'),
  path.join(APP_DIR, dir, 'ResourceFetcher.exe'),
  path.join(BIN_ROOT, dir, 'ResourceFetcher'),
  path.join(BIN_ROOT, dir, 'ResourceFetcher.exe'),
  path.join(process.cwd(), dir, 'ResourceFetcher'),
  path.join(process.cwd(), dir, 'ResourceFetcher.exe'),
]);

let current = resolvePlatform(process.env.SS_PLATFORM);
let fetcherPath = null;

const DIRS = {
  root: ROOT,
  appDir: APP_DIR,
  output: outputRoot,
  platform: current,
  manifest: path.join(outputRoot, 'Manifest'),
  metadata: path.join(outputRoot, 'Metadata'),
  uncensor: path.join(outputRoot, 'Uncensor'),
  resource: path.join(outputRoot, 'Uncensor', 'Resource'),
  customList: path.join(outputRoot, 'Generated', 'custom'),
  package: path.join(outputRoot, 'Uncensor', 'Resource', 'package'),
  uncensorDefault: path.join(outputRoot, 'Uncensor', 'Default'),
  generated: path.join(outputRoot, 'Generated'),
  generatedMani: path.join(outputRoot, 'Generated', 'mani'),
  generatedDiff: path.join(outputRoot, 'Generated', 'diff'),
  tests: path.join(ROOT, 'tests'),
};

/* 按当前平台重建全部输出目录路径 */
function rebuild() {
  DIRS.output = outputRoot;
  DIRS.manifest = path.join(outputRoot, 'Manifest');
  DIRS.metadata = path.join(outputRoot, 'Metadata');
  DIRS.uncensor = path.join(outputRoot, 'Uncensor');
  DIRS.resource = path.join(outputRoot, 'Uncensor', 'Resource');
  DIRS.generated = path.join(outputRoot, 'Generated');
  DIRS.generatedMani = path.join(outputRoot, 'Generated', 'mani');
  DIRS.generatedDiff = path.join(outputRoot, 'Generated', 'diff');
  DIRS.customList = path.join(outputRoot, 'Generated', 'custom');
  DIRS.package = path.join(outputRoot, 'Uncensor', 'Resource', 'package');
  DIRS.uncensorDefault = path.join(outputRoot, 'Uncensor', 'Default');
  return DIRS;
}

/* 切换当前平台并重建路径 */
function applyPlatform(platform) {
  current = resolvePlatform(platform);
  DIRS.platform = current;
  return DIRS;
}

/* 切换输出根目录并重建路径 */
function applyOutputRoot(root) {
  const raw = String(root || '').trim();
  outputRoot = raw ? path.resolve(process.cwd(), raw) : path.resolve(process.cwd(), 'output');
  return rebuild();
}

/* 设置抓取器路径为空则回到自动探测 */
function applyFetcher(explicit) {
  const raw = String(explicit || '').trim();
  fetcherPath = raw ? path.resolve(process.cwd(), raw) : null;
  return fetcher();
}

/* 切换当前平台 */
const setPlatform = (platform) => applyPlatform(platform);
/* 返回当前平台 */
const platform = () => current;

/* 返回某区域的清单目录 */
const manifestDir = (region) => path.join(DIRS.manifest, region);
/* 返回某区域的元数据目录 */
const metadataDir = (region) => path.join(DIRS.metadata, region);
/* 返回某区域的补丁缓存目录 */
const patchDir = (region) => path.join(metadataDir(region), current);

/* 返回当前平台的版本登记文件 */
const versionFile = () => path.join(DIRS.manifest, versionFileName(current));

/* 返回当前平台反和谐资源目录 */
const resourceDir = () => {
  const env = process.env.SS_UNCENSOR_DIR;
  return env ? path.resolve(process.cwd(), env) : DIRS.resource;
};
/* 返回某区域反和谐资源目录 */
const resourcePath = (region) => path.join(resourceDir(), region, current);

/* 按候选位置定位抓取器可执行文件 */
function resolveFetcher(explicit?: string) {
  const env = process.env.RESOURCE_FETCHER;
  const candidates = [explicit, env].filter((p) => typeof p === 'string' && p.length > 0);
  for (const candidate of candidates) {
    const target = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(target)) return target;
  }
  for (const fallback of FETCHER_CANDIDATES) {
    if (fs.existsSync(fallback)) return fallback;
  }
  return null;
}

/* 返回当前可用的抓取器路径 */
const fetcher = () => (fetcherPath ? (fs.existsSync(fetcherPath) ? fetcherPath : null) : resolveFetcher());

/* 返回某区域合成清单路径 */
const genPath = (region) => path.join(DIRS.generatedMani, genManiName(region, current));
/* 返回某区域参考清单路径 */
const refPath = (region) => path.join(DIRS.tests, `${String(region).toLowerCase()}_ss_${current}.mani`);

/* 把绝对路径转成工作目录相对路径 */
const local = (filePath) => {
  const rel = path.relative(process.cwd(), filePath);
  return rel.length > 0 ? rel.split(path.sep).join('/') : '.';
};

/* 把绝对路径转成项目根目录相对路径 */
const relative = (filePath) => {
  const rel = path.relative(ROOT, filePath);
  if (rel.length === 0) return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return filePath;
  return rel.split(path.sep).join('/');
};

module.exports = {
  HERE,
  ROOT,
  APP_DIR,
  OUTPUT: outputRoot,
  REGIONS,
  DIRS,
  FETCHER_CANDIDATES,
  FETCHER: resolveFetcher(),
  resolveFetcher,
  fetcher,
  setPlatform,
  applyOutputRoot,
  applyFetcher,
  platform,
  manifestDir,
  metadataDir,
  patchDir,
  versionFile,
  resourceDir,
  resourcePath,
  genPath,
  refPath,
  local,
  relative,
};
