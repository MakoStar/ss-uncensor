'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { drain } = require('../log/drain');
const { spawnSync } = require('child_process');
const { FETCHER, DIRS, patchDir, relative, platform } = require('../config/paths');
const { KEYS, MANI_ONLY_PATTERN, platformOf, SERVER_REGIONS } = require('../config');

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
  overwrite: false,
};

/* 拼装抓取器命令行参数 */
function buildArgs(options: any ={}) {
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

/* 同步执行抓取器并捕获输出 */
function runFetcher(options: any ={}) {
  const exe = options.exe || FETCHER;
  if (!exe || !fs.existsSync(exe)) {
    throw new Error(`fetcher not found: ${exe || '(none)'}，放到 ResourceTool/ 或在设置里指定路径`);
  }

  const args = buildArgs(options);
  const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg}"` : arg);
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
      maxBuffer: 64 * 1024 * 1024,
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

/* 返回当前平台已抓到清单的区域 */
function fetchedRegions(platformName = platform()) {
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

/* 一次调用抓取全部区域 */
function fetchAll(options: any ={}) {
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
  log.succ(`${regions.length} region(s) in ${result.seconds}s  ${relative(DIRS.manifest)}`);
  return { ...result, region: 'ALL', regions };
}

/* 抓取单个区域 */
function fetchRegion(region, options: any ={}) {
  log.head(`FETCH MANIFEST ${region}`);
  const result = runFetcher({ ...options, region });
  if (options.dryRun) return { ...result, region };

  const dir = patchDir(region);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const base = platformOf(options.platform || platform()).base;
  if (!files.includes(base)) log.warn(`${region} base manifest missing: ${relative(path.join(dir, base))}`);
  if (result.ok) log.succ(`${region.padEnd(4)} ${result.seconds}s  ${String(files.length).padStart(2)} entries  ${relative(dir)}`);
  else log.fail(`${region} fetch exited with ${result.code}`);
  return { ...result, region, files: files.length };
}

/* 按顺序抓取指定区域列表 */
function fetchRegions(regions, options = {}) {
  if (!regions || regions.length === 0) return [fetchAll(options)];

  const results = [];
  for (const region of regions) {
    const done = fetchRegion(region, options);
    results.push(done);
    if (!done.ok) break;
  }
  return results;
}

module.exports = { DEFAULTS, buildArgs, fetchAll, fetchRegion, fetchRegions, fetchedRegions };
