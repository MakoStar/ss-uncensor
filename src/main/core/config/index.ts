const PLATFORMS = {
  win: { base: 'ss_win.mani' },
  and: { base: 'ss_and.mani' },
  ios: { base: 'ss_ios.mani' }
};

const DEFAULT_PLATFORM = 'win';
const PLATFORM_NAMES = Object.keys(PLATFORMS);

const SERVER_REGIONS = ['CN', 'EN', 'JP', 'KR', 'TW'];

const REGIONS = ['CN', 'JP'];
const TARGET_REGION = REGIONS[REGIONS.length - 1];
const DIFF_BASE = REGIONS[0];
const DIFF_TARGET = REGIONS[REGIONS.length - 1];

/** 归一化平台名并回退默认值 */
function resolvePlatform(raw: unknown): string {
  const name = String(raw || '')
    .trim()
    .toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLATFORMS, name) ? name : DEFAULT_PLATFORM;
}

/** 返回平台名与文件配置 */
function platformOf(raw: unknown): { name: string; base: string } {
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
  uncensorDefault: 'TASK.UNCENSOR.FILEPATH.DEFAULT',
  uncensorSourceRegion: 'TASK.UNCENSOR.SOURCE_REGION',
  uncensorManifest: 'TASK.UNCENSOR.FILEPATH.MANIFEST',
  uncensorMetadata: 'TASK.UNCENSOR.FILEPATH.METADATA'
};

const MANI_ONLY_PATTERN = '[\\.mani$]';

const NETWORK = {
  timeout: 900,
  retries: 3,
  attempts: 1,
  waitSeconds: 10
};

/** 生成平台参数对 */
function platformArgs(raw: unknown): string[] {
  return ['-s', `${KEYS.platform}=${resolvePlatform(raw)}`];
}

/** 拼出版本文件名 */
const versionFileName = (raw: unknown): string => `${resolvePlatform(raw)}_version.json`;

/** 拼出生成清单文件名 */
const genManiName = (region: string, platform: unknown): string => `${region}_gen_ss_${resolvePlatform(platform)}.mani`;

/** 拼出缺失清单文件名 */
const missingName = (region: string, platform: unknown): string =>
  `${region}_gen_${resolvePlatform(platform)}_uncensor_missing.json`;

/** 拼出差异清单文件名 */
const diffListName = (baseRegion: string, targetRegion: string, platform: unknown): string =>
  `${baseRegion}2${targetRegion}_gen_${resolvePlatform(platform)}_diff_files.json`;

/** 拼出资源差异文件名 */
const unity3dDiffName = (baseRegion: string, targetRegion: string, platform: unknown): string =>
  `${baseRegion}2${targetRegion}_gen_${resolvePlatform(platform)}_unity3d_diff.json`;

const DIFF = {
  ext: '.unity3d',
  hash: 'hash',
  size: 'size',
  missing: 'missing_in_base'
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
  DIFF
};
