const fs = require('fs');
const path = require('path');
const { DIRS, relative, resourcePath, platform } = require('../config/paths');
const { TARGET_REGION, missingName } = require('../config');
const log = require('../log/log');
const { resolveList } = require('./download');

/** 拼出缺失清单文件路径 */
const missingList = (region?: string): string =>
  path.join(DIRS.generatedDiff, missingName(region || TARGET_REGION, platform()));

/** 读取下载清单内容 */
function readList(listPath: string): { region: string | undefined; files: string[] } {
  const meta = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  return {
    region: typeof meta.region === 'string' ? meta.region : undefined,
    files: Array.isArray(meta.files) ? meta.files.filter((name) => typeof name === 'string') : []
  };
}

/** 列出已下载的文件名 */
function downloadedNames(region: string): Set<string> {
  const dir = resourcePath(region);
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir));
}

/** 写出缺失文件清单 */
function writeMissing(region: string, files: string[]): string {
  const target = missingList(region);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ region, files }, null, 2)}\n`);
  return target;
}

/** 核对清单与已下载文件 */
function auditMissing(options: any = {}): {
  ok: boolean;
  region: string;
  list: string;
  dir: string;
  total: number;
  present: number;
  missing: string[];
  report: string;
} {
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
  log.info(`dir ${relative(dir)}`);
  log.info(`${String(files.length).padStart(4)} wanted ${String(have.size).padStart(4)} on disk`);
  if (missing.length === 0) {
    log.succ('nothing missing');
  } else {
    log.warn(`${missing.length} missing`);
    log.debu(missing.slice(0, 8).join(' '));
    if (missing.length > 8) log.debu(`... ${missing.length - 8} more`);
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
    report
  };
}

module.exports = {
  missingList,
  readList,
  downloadedNames,
  writeMissing,
  auditMissing
};
