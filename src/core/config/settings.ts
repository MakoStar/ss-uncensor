'use strict';

const fs = require('fs');
const path = require('path');
const { DIRS } = require('./paths');

const FILE = '.ss-uncensor-gui.json';

const DEFAULTS = {
  platform: 'win',
  regions: [],
  fetcher: '',
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
    region: 'TW',
    list: '',
    timeout: 900,
    retries: 3,
    dir: '',
  },
};

let fileOverride = null;

/* 返回配置文件位置：跟随程序目录 */
const filePath = () => fileOverride || path.join(DIRS.appDir, FILE);

/* 把配置读写切换到指定文件 */
function useFile(p) {
  fileOverride = p ? path.resolve(p) : null;
}

/* 把旧版本留在 userData 或 cwd 的配置搬到程序目录，只搬一次 */
function migrate() {
  const target = filePath();
  if (fs.existsSync(target) || fileOverride) return;
  const appData = process.env.APPDATA || '';
  const legacy = [
    appData ? path.join(appData, '星塔反和谐工具', FILE) : '',
    appData ? path.join(appData, 'ssuncensor', FILE) : '',
    appData ? path.join(appData, '星塔旅人反和谐资源包下载替换器', FILE) : '',
    path.resolve(process.cwd(), FILE),
  ].find((item) => item && item !== target && fs.existsSync(item));
  if (!legacy) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(legacy, target);
  } catch (err) {
    /* 搬不动就按默认值来 */
  }
}

/* 读取并归一化配置 */
function load() {
  let raw = {};
  migrate();
  try {
    if (fs.existsSync(filePath())) raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch (err) {
    raw = {};
  }
  return normalize(raw);
}

/* 按默认值补全并校正配置字段 */
function normalize(input) {
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

/* 写回配置并返回归一化结果 */
function save(settings) {
  const next = normalize(settings);
  fs.writeFileSync(filePath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

module.exports = { FILE, DEFAULTS, load, save, normalize, filePath, useFile };
