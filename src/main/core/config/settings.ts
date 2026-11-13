const fs = require('fs');
const path = require('path');
const { DIRS } = require('./paths');

const FILE = 'config.json';

const DEFAULTS = {
  platform: 'win',
  regions: [],
  background: true,
  fetcher: '',
  fetcherChannel: 'stable',

  fetcherMirror: 'official',
  autoDownloadFetcher: true,
  skippedFetcher: '',
  outputRoot: '',
  gameDir: '',
  backupDir: '',
  backups: [],
  replaces: [],
  timeout: 900,
  retries: 3,
  autoRetry: 1,
  logLevel: 'info',
  useResourceRegex: true,
  resPatterns: '[\\.mani$]',
  filterOutdated: true,
  mergePatch: false,
  overwrite: false,
  uncensor: {
    region: 'JP',
    list: '',
    timeout: 900,
    retries: 3,
    dir: ''
  }
};

let fileOverride = null;

/** 返回配置文件路径 */
const filePath = (): string => fileOverride || path.join(DIRS.home, FILE);

/** 指定自定义配置文件 */
function useFile(p?: string): void {
  fileOverride = p ? path.resolve(p) : null;
}

/** 读取并规范化配置 */
function load(): typeof DEFAULTS {
  let raw = {};
  try {
    if (fs.existsSync(filePath())) raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch (err) {
    raw = {};
  }
  return normalize(raw);
}

/** 用默认值补全配置 */
function normalize(input: Record<string, any>): typeof DEFAULTS {
  const merged = { ...DEFAULTS };
  for (const [key, value] of Object.entries(input || {})) {
    if (!(key in DEFAULTS)) continue;
    if (key === 'uncensor') {
      merged.uncensor = { ...DEFAULTS.uncensor, ...(value && typeof value === 'object' ? value : {}) };
    } else if (typeof value === typeof DEFAULTS[key] || (Array.isArray(DEFAULTS[key]) && Array.isArray(value))) {
      merged[key] = value;
    }
  }
  return merged;
}

/** 写入配置文件 */
function save(settings: Record<string, any>): typeof DEFAULTS {
  const next = normalize(settings);
  fs.writeFileSync(filePath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

module.exports = { FILE, DEFAULTS, load, save, normalize, filePath, useFile };
