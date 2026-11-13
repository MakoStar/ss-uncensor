const fs = require('fs');
const path = require('path');
const { DIRS } = require('../core/config/paths');
const { versionFileName } = require('../core/config');

const LOG_DIR = path.join(DIRS.home, 'log');

/** 把数字补成两位文本 */
const pad2 = (value: number): string => String(value).padStart(2, '0');

/** 生成当前日期时间戳文本 */
const nowStamp = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
};

const STARTUP_LOG = path.join(LOG_DIR, 'app.log');
const PREV_LOG = path.join(LOG_DIR, 'app-prev.log');

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (fs.existsSync(STARTUP_LOG)) {
    try {
      fs.rmSync(PREV_LOG, { force: true });
      fs.renameSync(STARTUP_LOG, PREV_LOG);
    } catch (err) {}
  }
  if (!fs.existsSync(STARTUP_LOG)) fs.writeFileSync(STARTUP_LOG, '', 'utf8');

  for (const name of fs.readdirSync(LOG_DIR)) {
    if (!/^app-\d{8}-\d{6}\.log$/.test(name)) continue;
    try {
      fs.rmSync(path.join(LOG_DIR, name));
    } catch (err) {}
  }
} catch (err) {}

/** 生成当前时分秒文本 */
const stamp = (): string => new Date().toLocaleTimeString('sv-SE');

/** 把绝对路径转成工作目录相对路径 */
const relToCwd = (target: string): string => path.relative(process.cwd(), target).replace(/\\/g, '/') || target;

const BSD_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

/** 选出本机可用的压缩命令 */
const tarCommand = (): string => (process.platform === 'win32' && fs.existsSync(BSD_TAR) ? BSD_TAR : 'tar');

/** 统计目录的文件数与总字节 */
function measure(target: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch (err) {}
      }
    }
  };
  walk(target);
  return { files, bytes };
}

/** 读取版本清单并兜底空对象 */
function readVersion(file: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return {};
  }
}

/** 把旧版本条目合并写回文件 */
function mergeVersionFile(file: string, before: Record<string, any>): boolean {
  let after;
  try {
    after = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return false;
  }
  const merged = { ...before, ...after };
  if (JSON.stringify(merged) === JSON.stringify(after)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return true;
}

/** 汇总某区服的清单与缓存信息 */
function describeRegion(
  region: string,
  plat: string
): {
  region: string;
  platform: string;
  manifests: Array<{ name: string; bytes: number }>;
  cache: { path: string; files: number; bytes: number } | null;
  versionEntry: boolean;
  removable: boolean;
  paths: { manifest: string; cache: string; version: string };
} {
  const code = String(region || '').toUpperCase();
  const manifestPath = path.join(DIRS.manifest, code);
  const cachePath = path.join(DIRS.metadata, code, plat);
  const versionPath = path.join(DIRS.manifest, versionFileName(plat));

  const manifests = [];
  if (fs.existsSync(manifestPath)) {
    for (const entry of fs.readdirSync(manifestPath, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.startsWith(`${plat}_`) || !entry.name.endsWith('.json')) continue;
      const full = path.join(manifestPath, entry.name);
      manifests.push({ name: entry.name, bytes: fs.statSync(full).size });
    }
  }

  const cache = fs.existsSync(cachePath) ? { path: cachePath, ...measure(cachePath) } : null;

  let versionEntry = false;
  try {
    const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    versionEntry = Boolean(data && data[code]);
  } catch (err) {
    versionEntry = false;
  }

  return {
    region: code,
    platform: plat,
    manifests,
    cache,
    versionEntry,
    removable: manifests.length > 0 || Boolean(cache) || versionEntry,
    paths: { manifest: manifestPath, cache: cachePath, version: versionPath }
  };
}

const ANSI = /\x1b\[[0-9;]*m/g;

const STAMPED = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] - /;

const FOREIGN = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\](\[[^\]\n]+\])? - /;

/** 把文本追加写入启动日志 */
function append(lines: string): void {
  try {
    fs.appendFileSync(STARTUP_LOG, lines, 'utf8');
  } catch (err) {}
}

/** 按时间戳格式化并写入日志行 */
function traceLines(entries: Array<{ line: string; tag: string }>): void {
  const at = nowStamp();
  const body = entries
    .map(({ line, tag }) => {
      const clean = String(line ?? '').replace(ANSI, '');
      return clean
        .split('\n')
        .map((row) => {
          if (STAMPED.test(row)) return `${row}\n`;
          return `[${at}] - ${row.replace(FOREIGN, '')}\n`;
        })
        .join('');
    })
    .join('');
  if (body) append(body);
}

/** 写入一条主进程日志 */
function trace(line: string, tag: string = 'MAIN'): void {
  traceLines([{ line, tag }]);
}

module.exports = {
  STARTUP_LOG,
  stamp,
  relToCwd,
  tarCommand,
  measure,
  readVersion,
  mergeVersionFile,
  describeRegion,
  trace,
  traceLines
};
