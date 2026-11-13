const fs = require('fs');
const path = require('path');
const { DIRS, fetcher, relative, platform, setPlatform, applyFetcher } = require('../core/config/paths');
const settings = require('../core/config/settings');
const { versionFileName, SERVER_REGIONS } = require('../core/config');
const { buildArgs, fetchedRegions } = require('../core/network/fetcher');
const log = require('../core/log/log');
const fetcherInstall = require('../services/install');
const ping = require('../services/ping');
const runner = require('../services/runner');
const runlog = require('../services/runlog');
const appConfig = require('../services/config');
const { stamp, readVersion, mergeVersionFile } = require('../services/file');

/** 下载安装资源抓取器 */
function installFetcher(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const send = (line: string): void => runlog.push(event, { line, stream: 'out', scope: 'fetch', at: stamp() });
  event.sender.send('run:progress', { got: 0, total: 0, phase: 'prepare', scope: 'fetcher' });
  return (async () => {
    runner.setBusy(true);
    try {
      const result = await fetcherInstall.install({
        update: Boolean(payload.update),
        tag: payload.tag || null,
        channel: payload.channel || null,
        onLog: (tag, message) => send(log.format(tag, message)),
        onProgress: (got, total, phase) => event.sender.send('run:progress', { got, total, phase, scope: 'fetcher' })
      });
      if (result.ok) {
        applyFetcher(result.path);
        const current = settings.load();
        current.fetcher = path.resolve(result.path);
        settings.save(current);
        send(log.format('SUCC', `抓取器已就绪: ${relative(result.path)}`));
        return { ...result, meta: require('./meta').meta() };
      }
      return result;
    } finally {
      runner.setBusy(false);
    }
  })();
}

/** 拉取抓取器的发布列表 */
async function fetcherReleases(): Promise<Record<string, any>> {
  try {
    return { ok: true, releases: await fetcherInstall.recentReleases(12) };
  } catch (err) {
    if (Array.isArray(err.releases) && err.releases.length) {
      return { ok: true, cached: true, error: err.message, releases: err.releases.slice(0, 12) };
    }
    return { ok: false, error: err.message };
  }
}

/** 读取抓取器版本信息 */
async function fetcherVersion(): Promise<Record<string, any>> {
  return fetcherInstall.versionInfo();
}

/** 中断当前正在跑的任务 */
function abort(): Record<string, any> {
  return runner.abortRun();
}

/** 取消抓取器安装过程 */
function cancelFetcher(): Record<string, any> {
  return fetcherInstall.cancel();
}

/** 测试各区域的连通性 */
function pingHandler(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const send = (line: string): void => runlog.push(event, { line, stream: 'out', scope: 'fetch', at: stamp() });

  const progress = (data: Record<string, any>): void => event.sender.send('ping:progress', data);

  return (async () => {
    const plat = payload.platform || platform();
    const urls = ping.serverUrls();
    const regions = (payload.regions && payload.regions.length ? payload.regions : SERVER_REGIONS).filter(
      (region) => urls[region]
    );

    send(log.format('INFO', `连通性测试 ${plat} ${regions.join(' ')}`));

    progress({ phase: 'plan', regions: regions.map((region) => ({ region, url: urls[region] })) });

    runner.resetCancelled();
    runner.setBusy(true);
    try {
      const results = [];
      let aborted = false;
      for (const region of regions) {
        if (runner.wasCancelled()) {
          aborted = true;
          break;
        }
        progress({ phase: 'running', region, url: urls[region] });

        const result = await ping.probeRegion(region, urls[region], plat, () => runner.wasCancelled());
        if (!result) {
          aborted = true;
          break;
        }
        results.push(result);
        progress({ phase: 'done', region, result });
      }

      if (aborted) {
        send(log.format('WARN', `连通性测试已中断(已完成 ${results.length}/${regions.length})`));
        progress({ phase: 'abort', done: results.length, total: regions.length });
        return {
          ok: false,
          aborted: true,
          total: regions.length,
          reachable: results.filter((item) => item.ok).length,
          results
        };
      }

      const total = results.length;
      const ok = results.filter((item) => item.ok).length;
      send(log.format(ok === total ? 'SUCC' : 'WARN', `${ok}/${total} 个区域可达`));
      return { ok: ok === total, total, reachable: ok, results };
    } finally {
      runner.setBusy(false);
    }
  })();
}

/** 把抓取参数拼成命令文本 */
function fetchCommand(_event: Electron.IpcMainInvokeEvent, payload: any = {}): { commands: string[] } {
  const merged = { ...appConfig.current(), ...payload };
  const runs =
    merged.regions && merged.regions.length > 0
      ? merged.regions.map((region) => buildArgs({ ...merged, region }))
      : [buildArgs({ ...merged, region: null })];
  return { commands: runs.map((args) => `${path.basename(fetcher() || 'ResourceFetcher')} ${args.join(' ')}`) };
}

/** 调用抓取器下载清单 */
function fetch(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const exe = fetcher();
  if (!exe) {
    return Promise.resolve({ ok: false, needFetcher: true, error: '未找到 ResourceFetcher' });
  }

  const merged = { ...appConfig.current(), ...payload };
  const plat = merged.platform || platform();
  setPlatform(plat);

  const versionPath = path.join(DIRS.manifest, versionFileName(plat));
  const versionBefore = readVersion(versionPath);

  const regions = merged.regions || [];
  const runs =
    regions.length > 0
      ? regions.map((region) => ({ region, args: buildArgs({ ...merged, region }) }))
      : [{ region: 'ALL', args: buildArgs({ ...merged, region: null }) }];

  return (async () => {
    runner.resetCancelled();
    runner.setBusy(true);
    let failed = null;
    for (const run of runs) {
      if (runner.wasCancelled()) break;
      const label = run.region === 'ALL' ? 'fetch 全部区域' : `fetch ${run.region}`;
      const attempts = Math.max(0, Number(appConfig.current().autoRetry) || 0);

      let outcome = null;
      for (let attempt = 0; attempt <= attempts; attempt += 1) {
        if (runner.wasCancelled()) break;
        if (attempt > 0) {
          runlog.push(event, {
            line: log.format('TIPS', `第 ${attempt} 次自动重试..`),
            stream: 'out',
            label,
            scope: 'fetch',
            at: stamp()
          });
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        outcome = await runner.streamCommand(event, exe, run.args, label, 'fetch');
        if (outcome.code === 0) break;
      }

      if (runner.wasCancelled()) break;

      const { code, lastRegion, seen } = outcome;
      if (code !== 0) {
        const missing = SERVER_REGIONS.find((name) => !seen.includes(name));
        const region = run.region === 'ALL' ? missing || lastRegion || 'ALL' : run.region;
        failed = { region, code };
        break;
      }
    }
    runner.setBusy(false);
    if (mergeVersionFile(versionPath, versionBefore)) {
      runlog.push(event, {
        line: log.format('INFO', `版本登记已合并: ${Object.keys(readVersion(versionPath)).join(', ')}`),
        stream: 'out',
        scope: 'fetch',
        at: stamp()
      });
    }
    if (runner.wasCancelled()) return { ok: false, aborted: true, regions: fetchedRegions(platform()) };
    return { ok: !failed, failed, regions: fetchedRegions(platform()) };
  })();
}

/** 注册抓取相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('install-fetcher', installFetcher);
  handle('fetcher-releases', fetcherReleases);
  handle('fetcher-version', fetcherVersion);
  handle('cancel-fetcher', cancelFetcher);
  handle('abort', abort);
  handle('ping', pingHandler);
  handle('fetch-command', fetchCommand);
  handle('fetch', fetch);
}

module.exports = { register };
