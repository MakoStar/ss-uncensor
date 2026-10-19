'use strict';

const fs = require('fs');
const path = require('path');
const { DIRS, relative, resourcePath, platform } = require('../config/paths');
const { TARGET_REGION, missingName } = require('../config');
const log = require('../log/log');
const { resolveList } = require('./download');

/* 返回某区域缺失清单路径 */
const missingList = (region) => path.join(DIRS.generatedDiff, missingName(region || TARGET_REGION, platform()));

/* 读取名单文件返回文件集合 */
function readList(listPath) {
  const meta = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  return {
    region: typeof meta.region === 'string' ? meta.region : undefined,
    files: Array.isArray(meta.files)
      ? meta.files.filter((name) => typeof name === 'string')
      : [],
  };
}

/* 列出某区域已下载的资源文件名 */
function downloadedNames(region) {
  const dir = resourcePath(region);
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir));
}

/* 把缺失文件写进缺失清单 */
function writeMissing(region, files) {
  const target = missingList(region);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ region, files }, null, 2)}\n`);
  return target;
}

/* 核对名单与已下载文件找出缺失项 */
function auditMissing(options: any ={}) {
  const listPath = resolveList(options.path);
  if (!fs.existsSync(listPath)) throw new Error(`file list not found: ${listPath}`);

  const { region: listRegion, files } = readList(listPath);
  const region = options.region || listRegion;
  if (!region) throw new Error(`region unknown, pass --region or set it in ${listPath}`);

  const have = downloadedNames(region);
  const missing = files.filter((name) => !have.has(name));

  const report = writeMissing(region, missing);
  const dir = resourcePath(region);

  log.info(`list ${relative(listPath)}`);
  log.info(`dir  ${relative(dir)}`);
  log.info(`${String(files.length).padStart(4)} wanted  ${String(have.size).padStart(4)} on disk`);
  if (missing.length === 0) {
    log.succ('nothing missing');
  } else {
    log.warn(`${missing.length} missing`);
    log.debu(missing.slice(0, 8).join(' '));
    if (missing.length > 8) log.debu(`… ${missing.length - 8} more`);
  }
  log.succ(`missing list -> ${relative(report)}`);

  return {
    ok: true,
    region,
    list: listPath,
    dir,
    total: files.length,
    present: have.size,
    missing,
    report,
  };
}

module.exports = {
  missingList,
  readList,
  downloadedNames,
  writeMissing,
  auditMissing,
};
