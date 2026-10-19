'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { drain } = require('../log/drain');
const { spawnSync } = require('child_process');
const { KEYS, NETWORK, DIFF_BASE, DIFF_TARGET, diffListName, platformArgs } = require('../config');
const {
  FETCHER,
  DIRS,
  resourceDir,
  resourcePath,
  relative,
  local,
  platform,
} = require('../config/paths');

/* 返回默认反和谐下载名单路径 */
const defaultList = () => path.join(DIRS.generatedDiff, diffListName(DIFF_BASE, DIFF_TARGET, platform()));

/* 返回反和谐资源输出目录 */
const resolveOutputDir = () => resourceDir();

/* 解析名单来源返回区域与路径 */
function resolveList(raw, baseRegion, targetRegion) {
  if (raw) {
    const target = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    return fs.existsSync(target) ? target : defaultList();
  }
  if (baseRegion || targetRegion) {
    return path.join(DIRS.generatedDiff, diffListName(baseRegion || DIFF_BASE, targetRegion || DIFF_TARGET, platform()));
  }
  return defaultList();
}

/* 读取名单里的目标区域 */
function listRegion(listPath) {
  try {
    const meta = JSON.parse(fs.readFileSync(listPath, 'utf8'));
    return typeof meta.region === 'string' && meta.region.length > 0 ? meta.region : null;
  } catch (err) {
    return null;
  }
}

/* 读取名单里的文件列表 */
function listFiles(listPath) {
  try {
    const meta = JSON.parse(fs.readFileSync(listPath, 'utf8'));
    return Array.isArray(meta.files) ? meta.files.length : 0;
  } catch (err) {
    return 0;
  }
}

/* 按选项环境变量默认值的顺序取整型参数 */
function intOption(options, name, env, fallback) {
  const raw = options[name] !== undefined ? options[name] : process.env[env];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/* 拼装反和谐下载的命令行参数 */
function buildArgs(options: any ={}) {
  if (options.default) {
    const official = ['uncensor', '-d'];
    official.push(...platformArgs(options.platform || platform()));

    if (options.defaultDir) {
      const root = local(path.resolve(process.cwd(), options.defaultDir));
      official.push('-s', `${KEYS.uncensorSourceRegion}=`);
      official.push('-s', `${KEYS.uncensorManifest}=${root}/Metadata`);
      official.push('-s', `${KEYS.uncensorMetadata}=${root}/Metadata`);
      official.push('-s', `${KEYS.uncensorResource}=${root}/Resource`);
    }

    official.push(
      '-s', `${KEYS.timeout}=${intOption(options, 'timeout', 'SS_HTTP_TIMEOUT_SECS', NETWORK.timeout)}`,
      '-s', `${KEYS.retries}=${intOption(options, 'httpRetries', 'SS_HTTP_RETRIES', NETWORK.retries)}`,
    );
    return official;
  }

  const list = resolveList(options.path, options.baseRegion, options.targetRegion);
  const region = options.region || options.targetRegion || listRegion(list);
  const args = ['uncensor', '--custom', `--path=${list}`];
  if (region) args.push(`--region=${region}`);
  args.push(...platformArgs(options.platform || platform()));

  const override = options.dir || process.env.SS_UNCENSOR_DIR;
  if (override) args.push('-s', `${KEYS.uncensorResource}=${local(path.resolve(process.cwd(), override))}`);

  args.push(
    '-s', `${KEYS.timeout}=${intOption(options, 'timeout', 'SS_HTTP_TIMEOUT_SECS', NETWORK.timeout)}`,
    '-s', `${KEYS.retries}=${intOption(options, 'httpRetries', 'SS_HTTP_RETRIES', NETWORK.retries)}`,
  );
  return args;
}

/* 同步等待指定毫秒数 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/* 执行反和谐资源包下载 */
function uncensorPack(options: any ={}) {
  const exe = options.exe || FETCHER;
  if (!exe || !fs.existsSync(exe)) {
    throw new Error(`fetcher not found: ${exe || '(none)'}, place it in ResourceTool/ or set RESOURCE_FETCHER`);
  }

  const listPath = resolveList(options.path, options.baseRegion, options.targetRegion);
  if (!fs.existsSync(listPath)) throw new Error(`file list not found: ${listPath}`);

  const region = options.targetRegion || options.region || listRegion(listPath) || DIFF_TARGET;
  const args = buildArgs({ ...options, path: listPath });
  const shown = args.map((arg) => (arg.startsWith('--path=') ? `--path=${relative(listPath)}` : arg));
  const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg}"` : arg);
  const command = `${relative(exe)} ${shown.map(quote).join(' ')}`;

  log.debu(`cwd ${relative(process.cwd())}`);
  log.debu(`${listFiles(listPath)} files in list`);
  if (options.dryRun) log.tips(command);
  else log.debu(command);

  if (options.dryRun) {
    log.tips('dry-run, nothing executed');
    return { ok: true, skipped: true, region, command, path: listPath, dir: resourcePath(region) };
  }

  const attempts = 1 + intOption(options, 'retries', 'SS_UNCENSOR_RETRIES', NETWORK.attempts);
  const capture = options.quiet === true && !options.verbose;
  let result;
  let seconds;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      log.info(`retry ${attempt - 1}/${attempts - 1}, waiting ${NETWORK.waitSeconds}s for kept files to stay on disk`);
      sleepSync(NETWORK.waitSeconds * 1000);
    }
    const started = Date.now();
    result = capture
      ? spawnSync(exe, args, {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      })
      : spawnSync(exe, args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
    seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (capture) {
      if (result.stdout) process.stdout.write(`${drain(result.stdout, capture)}\n`);
      if (result.stderr) process.stderr.write(`${drain(result.stderr, capture)}\n`);
    }

    if (!result.error && result.status === 0) break;
    if (attempt < attempts) log.fail(`uncensor exited with ${result.status} after ${seconds}s`);
  }

  if (result.error) throw new Error(`uncensor launch failed: ${result.error.message}`);
  if (result.status !== 0) {
    log.fail(`uncensor failed after ${attempts} attempt(s), exit ${result.status}`);
    return { ok: false, code: result.status, seconds, region, command, path: listPath, dir: resourcePath(region) };
  }

  const dir = resourcePath(region);
  const count = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
  log.succ(`${region.padEnd(4)} ${seconds}s  ${String(count).padStart(4)} entries  ${relative(dir)}`);
  return { ok: true, code: 0, seconds, region, files: count, command, path: listPath, dir };
}

module.exports = {
  defaultList,
  resolveOutputDir,
  resolveList,
  buildArgs,
  resourcePath,
  listRegion,
  listFiles,
  uncensorPack,
};
