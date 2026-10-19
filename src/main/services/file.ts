'use strict';

const fs = require('fs');
const path = require('path');
const { DIRS } = require('../../core/config/paths');
const { versionFileName } = require('../../core/config');

/* 启动日志跟着程序走：开发时在仓库根，装完后在安装目录 */
const STARTUP_LOG = path.join(DIRS.appDir, 'uncensor.log');

/* 输出当前时间用于日志时间戳 */
const stamp = () => new Date().toLocaleTimeString('sv-SE');

/* 把绝对路径转成相对工作目录的斜杠路径 */
const relToCwd = (target) => path.relative(process.cwd(), target).replace(/\\/g, '/') || target;

const BSD_TAR = path.join(process.env.SystemRoot || 'C:////Windows', 'System32', 'tar.exe');
/* 打包时优先用系统自带 BSD tar 否则退回 tar */
const tarCommand = () => (process.platform === 'win32' && fs.existsSync(BSD_TAR) ? BSD_TAR : 'tar');

/* 递归统计目录里的文件数量与总字节 */
function measure(target) {
  let files = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        try { bytes += fs.statSync(full).size; } catch (err) {  }
      }
    }
  };
  walk(target);
  return { files, bytes };
}

/* 读取版本登记文件返回按区域分键的对象 */
function readVersion(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return {};
  }
}

/* 把版本登记文件的新增区域合并回去并写盘 */
function mergeVersionFile(file, before) {
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

/* 汇总某区域当前平台已下载的清单缓存与版本登记 */
function describeRegion(region, plat) {
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
    paths: { manifest: manifestPath, cache: cachePath, version: versionPath },
  };
}

/* 把一行诊断写进 uncensor.log 并同步打印 */
function trace(line) {
  try {
    fs.appendFileSync(STARTUP_LOG, `${new Date().toISOString()}  ${line}\n`, 'utf8');
  } catch (err) {

  }
}

try {
  if (fs.existsSync(STARTUP_LOG) && fs.statSync(STARTUP_LOG).size > 256 * 1024) fs.rmSync(STARTUP_LOG);
} catch (err) {

}

module.exports = {
  STARTUP_LOG, stamp, relToCwd, tarCommand, measure, readVersion, mergeVersionFile, describeRegion, trace,
};
