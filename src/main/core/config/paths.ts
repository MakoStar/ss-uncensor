const fs = require('fs');
const path = require('path');
const { resolvePlatform, REGIONS, genManiName, versionFileName } = require('./index');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');

const HOME = process.env.SS_UNCENSOR_HOME ? path.resolve(process.env.SS_UNCENSOR_HOME) : null;

let outputRoot = HOME ? path.join(HOME, 'output') : path.resolve(process.cwd(), 'output');

const BIN_ROOT = ROOT.includes('app.asar') ? ROOT.replace('app.asar', 'app.asar.unpacked') : ROOT;

const APP_DIR = process.env.SS_APP_DIR
  ? path.resolve(process.env.SS_APP_DIR)
  : BIN_ROOT === ROOT
    ? ROOT
    : path.dirname(BIN_ROOT);

const FETCHER_DIRS = ['ResourceTool', path.join('tool', 'fetcher')];

const FETCHER_CANDIDATES = FETCHER_DIRS.flatMap((dir) => [
  path.join(APP_DIR, dir, 'ResourceFetcher'),
  path.join(APP_DIR, dir, 'ResourceFetcher.exe'),
  path.join(BIN_ROOT, dir, 'ResourceFetcher'),
  path.join(BIN_ROOT, dir, 'ResourceFetcher.exe'),
  path.join(process.cwd(), dir, 'ResourceFetcher'),
  path.join(process.cwd(), dir, 'ResourceFetcher.exe')
]);

let current = resolvePlatform(process.env.SS_PLATFORM);
let fetcherPath = null;

const DIRS = {
  root: ROOT,
  appDir: APP_DIR,

  home: HOME || APP_DIR,
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
  tests: path.join(ROOT, 'tests')
};

/** 重算各输出目录路径 */
function rebuild(): typeof DIRS {
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

/** 切换平台并刷新目录 */
function applyPlatform(platform: unknown): typeof DIRS {
  current = resolvePlatform(platform);
  DIRS.platform = current;
  return DIRS;
}

/** 设置输出根目录并重算 */
function applyOutputRoot(root: unknown): typeof DIRS {
  const raw = String(root || '').trim();
  outputRoot = raw ? path.resolve(process.cwd(), raw) : path.resolve(process.cwd(), 'output');
  return rebuild();
}

/** 设置抓取器路径并探测 */
function applyFetcher(explicit: unknown): string | null {
  const raw = String(explicit || '').trim();
  fetcherPath = raw ? path.resolve(process.cwd(), raw) : null;
  return fetcher();
}

/** 设置当前平台名 */
const setPlatform = (platform: unknown): typeof DIRS => applyPlatform(platform);

/** 读取当前平台名 */
const platform = (): string => current;

/** 拼出清单缓存目录 */
const manifestDir = (region: string): string => path.join(DIRS.manifest, region);

/** 拼出元数据缓存目录 */
const metadataDir = (region: string): string => path.join(DIRS.metadata, region);

/** 拼出补丁缓存目录 */
const patchDir = (region: string): string => path.join(metadataDir(region), current);

/** 拼出版本信息文件路径 */
const versionFile = (): string => path.join(DIRS.manifest, versionFileName(current));

/** 读取资源目录路径 */
const resourceDir = (): string => {
  const env = process.env.SS_UNCENSOR_DIR;
  return env ? path.resolve(process.cwd(), env) : DIRS.resource;
};

/** 拼出区域资源目录 */
const resourcePath = (region: string): string => path.join(resourceDir(), region, current);

/** 在候选位置查找抓取器 */
function resolveFetcher(explicit?: string): string | null {
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

/** 返回当前可用的抓取器 */
const fetcher = (): string | null =>
  fetcherPath ? (fs.existsSync(fetcherPath) ? fetcherPath : null) : resolveFetcher();

/** 拼出生成清单路径 */
const genPath = (region: string): string => path.join(DIRS.generatedMani, genManiName(region, current));

/** 拼出参考清单路径 */
const refPath = (region: string): string => path.join(DIRS.tests, `${String(region).toLowerCase()}_ss_${current}.mani`);

/** 转成相对工作目录的路径 */
const local = (filePath: string): string => {
  const rel = path.relative(process.cwd(), filePath);
  return rel.length > 0 ? rel.split(path.sep).join('/') : '.';
};

/** 转成相对仓库根目录路径 */
const relative = (filePath: string): string => {
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
  relative
};
