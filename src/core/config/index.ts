'use strict';

const PLATFORMS = {
  win: { base: 'ss_win.mani' },
  and: { base: 'ss_and.mani' },
  ios: { base: 'ss_ios.mani' },
};

const DEFAULT_PLATFORM = 'win';
const PLATFORM_NAMES = Object.keys(PLATFORMS);

const SERVER_REGIONS = ['CN', 'EN', 'JP', 'KR', 'TW'];

const REGIONS = ['CN', 'TW'];
const TARGET_REGION = REGIONS[REGIONS.length - 1];
const DIFF_BASE = REGIONS[0];
const DIFF_TARGET = REGIONS[REGIONS.length - 1];

/* 把平台写法归一成标准值 */
function resolvePlatform(raw) {
  const name = String(raw || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLATFORMS, name) ? name : DEFAULT_PLATFORM;
}

/* 判断平台字符串属于哪个平台 */
function platformOf(raw) {
  const name = resolvePlatform(raw);
  return { name, ...PLATFORMS[name] };
}

const KEYS = {
  platform: 'DEFAULT_PLATFORM',
  region: 'DEFAULT_REGION',
  useDefaultRegion: 'TASK.CLIENT.FLAGS.OP.USE_DEFAULT_REGION',
  useResourceRegex: 'TASK.CLIENT.FLAGS.OP.USE_RESOURCE_REGEX',
  resPatterns: 'TASK.CLIENT.REGISTRY.RES_PATTERNS',
  mergePatch: 'TASK.CLIENT.FLAGS.OP.MERGE_PATCH',
  timeout: 'NETWORK.TIMEOUT_SECS',
  retries: 'NETWORK.TOTAL_RETRIES',
  uncensorResource: 'TASK.UNCENSOR.FILEPATH.RESOURCE',
  uncensorSourceRegion: 'TASK.UNCENSOR.SOURCE_REGION',
  uncensorManifest: 'TASK.UNCENSOR.FILEPATH.MANIFEST',
  uncensorMetadata: 'TASK.UNCENSOR.FILEPATH.METADATA',
};

const MANI_ONLY_PATTERN = '[\\.mani$]';

const NETWORK = {

  timeout: 900,
  retries: 3,
  attempts: 1,
  waitSeconds: 10,
};

/* 返回平台对应的抓取参数片段 */
function platformArgs(raw) {
  return ['-s', `${KEYS.platform}=${resolvePlatform(raw)}`];
}

/* 拼出版本登记文件名 */
const versionFileName = (raw) => `${resolvePlatform(raw)}_version.json`;

/* 拼出合成清单文件名 */
const genManiName = (region, platform) => `${region}_gen_ss_${resolvePlatform(platform)}.mani`;
/* 拼出缺失清单文件名 */
const missingName = (region, platform) => `${region}_gen_${resolvePlatform(platform)}_uncensor_missing.json`;
/* 拼出反和谐下载名单文件名 */
const diffListName = (baseRegion, targetRegion, platform) =>
  `${baseRegion}2${targetRegion}_gen_${resolvePlatform(platform)}_diff_files.json`;
const unity3dDiffName = (baseRegion, targetRegion, platform) =>
  `${baseRegion}2${targetRegion}_gen_${resolvePlatform(platform)}_unity3d_diff.json`;

const DIFF = {
  ext: '.unity3d',
  hash: 'hash',
  size: 'size',
  missing: 'missing_in_base',
};

module.exports = {
  PLATFORMS,
  DEFAULT_PLATFORM,
  PLATFORM_NAMES,
  resolvePlatform,
  platformOf,
  platformArgs,
  versionFileName,
  KEYS,
  MANI_ONLY_PATTERN,
  NETWORK,
  SERVER_REGIONS,
  REGIONS,
  TARGET_REGION,
  DIFF_BASE,
  DIFF_TARGET,
  genManiName,
  diffListName,
  unity3dDiffName,
  missingName,
  DIFF,
};
