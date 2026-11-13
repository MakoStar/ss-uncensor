const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { drain } = require('../log/drain');
const { spawnSync } = require('child_process');
const { FETCHER, DIRS, patchDir, relative, platform } = require('../config/paths');
const { KEYS, MANI_ONLY_PATTERN, platformOf, SERVER_REGIONS } = require('../config');
const { regionVersion } = require('../manifest/build');

const DEFAULTS = {
  platform: null,
  region: null,
  timeout: 900,
  retries: 3,
  logLevel: 'info',
  useResourceRegex: true,
  resPatterns: MANI_ONLY_PATTERN,
  filterOutdated: true,
  mergePatch: false,
  overwrite: false
};

/** 把选项拼成抓取器参数 */
function buildArgs(options: any = {}): string[] {
  const cfg = { ...DEFAULTS, ...options };

  if (!cfg.platform) cfg.platform = platform();
  const args = [];

  if (cfg.region) args.push('-s', `${KEYS.region}=${cfg.region}`);
  else args.push('-s', `${KEYS.useDefaultRegion}=false`);

  args.push('-s', `${KEYS.platform}=${cfg.platform}`);

  if (cfg.resPatterns) args.push('-s', `${KEYS.resPatterns}=${cfg.resPatterns}`);
  if (cfg.useResourceRegex) args.push('-s', `${KEYS.useResourceRegex}=true`);

  if (!cfg.filterOutdated) args.push('-s', 'TASK.CLIENT.FLAGS.OP.FILTER_OUTDATED_PATCH=false');
  if (!cfg.mergePatch) args.push('-s', `${KEYS.mergePatch}=false`);
  if (cfg.overwrite) args.push('-s', 'TASK.CLIENT.FLAGS.OP.OVERWRITE_RESOURCE=true');
  if (Number(cfg.timeout) > 0) args.push('-s', `NETWORK.TIMEOUT_SECS=${Math.floor(Number(cfg.timeout))}`);
  if (Number(cfg.retries) >= 0) args.push('-s', `NETWORK.TOTAL_RETRIES=${Math.floor(Number(cfg.retries))}`);
  if (cfg.logLevel && cfg.logLevel !== 'info') args.push('--log_level', String(cfg.logLevel));
  args.push('client');
  return args;
}

/** 调用抓取器拉取清单 */
function runFetcher(options: any = {}): {
  ok: boolean;
  command: string;
  skipped?: boolean;
  code?: number;
  seconds?: string;
} {
  const exe = options.exe || FETCHER;
  if (!exe || !fs.existsSync(exe)) {
    throw new Error(`fetcher not found: ${exe || '(none)'}，放到 ResourceTool/ 或在设置里指定路径`);
  }

  const args = buildArgs(options);
  const quote = (arg: string): string => (/[\s"]/.test(arg) ? `"${arg}"` : arg);
  const command = `${relative(exe)} ${args.map(quote).join(' ')}`;

  log.debu(`cwd ${relative(process.cwd())}`);
  if (options.dryRun) log.tips(command);
  else log.debu(command);

  if (options.dryRun) {
    log.tips('dry-run, nothing executed');
    return { ok: true, skipped: true, command };
  }

  const started = Date.now();
  const capture = options.quiet === true && !options.verbose;
  const result = capture
    ? spawnSync(exe, args, {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024
      })
    : spawnSync(exe, args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (capture) {
    if (result.stdout) process.stdout.write(`${drain(result.stdout, capture)}\n`);
    if (result.stderr) process.stderr.write(`${drain(result.stderr, capture)}\n`);
  }

  if (result.error) throw new Error(`fetcher launch failed: ${result.error.message}`);
  return { ok: result.status === 0, code: result.status, seconds, command };
}

/** 列出已抓到清单的区域 */
function fetchedRegions(platformName: string = platform()): string[] {
  if (!fs.existsSync(DIRS.manifest)) return [];
  const file = `${platformName}_patch_manifest.json`;

  return fs
    .readdirSync(DIRS.manifest, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => SERVER_REGIONS.includes(String(entry.name).toUpperCase()))
    .filter((entry) => fs.existsSync(path.join(DIRS.manifest, entry.name, file)))
    .map((entry) => entry.name)
    .sort();
}

/** 读取版本缓存文件 */
function readVersions(platformName: string): Record<string, any> {
  const file = path.join(DIRS.manifest, `${platformName}_version.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return {};
  }
}

/** 写入版本缓存文件 */
function writeVersions(platformName: string, data: Record<string, any>): void {
  const file = path.join(DIRS.manifest, `${platformName}_version.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
}

/** 保留已有版本并写回 */
function keepVersions(platformName: string, snapshot: Record<string, any>): void {
  const latest = readVersions(platformName);
  const merged = { ...snapshot, ...latest };
  if (Object.keys(merged).length === 0) return;
  writeVersions(platformName, merged);
}

/** 补齐缺失的区域版本 */
function reconcileVersions(platformName: string = platform()): Record<string, any> {
  const regions = fetchedRegions(platformName);
  if (regions.length === 0) return {};
  const data = readVersions(platformName);
  let patched = false;
  for (const region of regions) {
    if (data[region]) continue;
    try {
      data[region] = regionVersion(region);
      patched = true;
    } catch (err) {
      log.warn(`${region} version derive failed: ${err.message}`);
    }
  }
  if (patched) writeVersions(platformName, data);
  return data;
}

/** 一次抓取全部区域 */
function fetchAll(options: any = {}): {
  ok: boolean;
  command: string;
  skipped?: boolean;
  code?: number;
  seconds?: string;
  region: string;
  regions: string[];
} {
  log.head('FETCH ALL REGIONS');
  const result = runFetcher(options);

  if (options.dryRun) return { ...result, region: 'ALL', regions: [] };
  if (!result.ok) {
    log.fail(`fetch exited with ${result.code} after ${result.seconds}s`);
    return { ...result, region: 'ALL', regions: fetchedRegions() };
  }

  const base = platformOf(options.platform || platform()).base;
  const regions = fetchedRegions();
  for (const region of regions) {
    const dir = patchDir(region);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const mark = files.includes(base) ? 'succ' : 'warn';
    log[mark](`${region.padEnd(4)} ${String(files.length).padStart(2)} entries  ${relative(dir)}`);
  }
  log.succ(`${regions.length} region(s) in ${result.seconds}s ${relative(DIRS.manifest)}`);
  return { ...result, region: 'ALL', regions };
}

/** 抓取单个区域的清单 */
function fetchRegion(
  region: string,
  options: any = {}
): {
  ok: boolean;
  command: string;
  skipped?: boolean;
  code?: number;
  seconds?: string;
  region: string;
  files?: number;
} {
  log.head(`FETCH MANIFEST ${region}`);
  const platformName = options.platform || platform();
  const before = options.dryRun ? {} : readVersions(platformName);
  const result = runFetcher({ ...options, region });
  if (options.dryRun) return { ...result, region };

  if (result.ok) {
    keepVersions(platformName, before);
    reconcileVersions(platformName);
  }

  const dir = patchDir(region);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const base = platformOf(options.platform || platform()).base;
  if (!files.includes(base)) log.warn(`${region} base manifest missing: ${relative(path.join(dir, base))}`);
  if (result.ok)
    log.succ(`${region.padEnd(4)} ${result.seconds}s ${String(files.length).padStart(2)} entries ${relative(dir)}`);
  else log.fail(`${region} fetch exited with ${result.code}`);
  return { ...result, region, files: files.length };
}

/** 按区域逐个抓取清单 */
function fetchRegions(
  regions: string[] | null,
  options: any = {}
): {
  ok: boolean;
  command: string;
  skipped?: boolean;
  code?: number;
  seconds?: string;
  region: string;
  files?: number;
  regions?: string[];
}[] {
  if (!regions || regions.length === 0) return [fetchAll(options)];

  const results = [];
  for (const region of regions) {
    const done = fetchRegion(region, options);
    results.push(done);
    if (!done.ok) break;
  }
  return results;
}
module.exports = { DEFAULTS, buildArgs, fetchAll, fetchRegion, fetchRegions, fetchedRegions, reconcileVersions };
