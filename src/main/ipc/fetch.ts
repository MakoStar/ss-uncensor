'use strict';

const fs = require('fs');
const path = require('path');
const { DIRS, fetcher, relative, platform, setPlatform, applyFetcher } = require('../../core/config/paths');
const settings = require('../../core/config/settings');
const { versionFileName, SERVER_REGIONS } = require('../../core/config');
const { buildArgs, fetchedRegions } = require('../../core/network/fetcher');
const log = require('../../core/log/log');
const fetcherInstall = require('../services/install');
const ping = require('../services/ping');
const runner = require('../services/runner');
const appConfig = require('../services/config');
const { stamp, readVersion, mergeVersionFile } = require('../services/file');

const handlers = {
  /* 下载并安装抓取器 */
  'install-fetcher'(event: any, payload: any = {}) {
    const send = (line) => event.sender.send('run:log', { line, stream: 'out', at: stamp() });
    return (async () => {
      runner.setBusy(true);
      try {
        const result = await fetcherInstall.install({
          update: Boolean(payload.update),
          onLog: (tag, message) => send(log.format(tag, message)),
          onProgress: (got, total, phase) => event.sender.send('run:progress', { got, total, phase }),
        });
        if (result.ok) {
          applyFetcher(result.path);
          const current = settings.load();
          current.fetcher = path.resolve(result.path);
          settings.save(current);
          send(log.format('SUCC', `抓取器已就绪：${relative(result.path)}`));
          return { ...result, meta: require('./meta').meta() };
        }
        return result;
      } finally {
        runner.setBusy(false);
      }
    })();
  },

  /* 读取抓取器本地与远端版本 */
  async 'fetcher-version'() {
    return fetcherInstall.versionInfo();
  },

  /* 中断当前抓取或下载 */
  abort() {
    return runner.abortRun();
  },

  /* 测试各区域连通性并逐条回报 */
  ping(event: any, payload: any = {}) {
    const send = (line) => event.sender.send('run:log', { line, stream: 'out', at: stamp() });
    const progress = (data) => event.sender.send('ping:progress', data);

    return (async () => {
      const plat = payload.platform || platform();
      const urls = ping.serverUrls();
      const regions = (payload.regions && payload.regions.length ? payload.regions : SERVER_REGIONS)
        .filter((region) => urls[region]);

      send(log.format('INFO', `── 连通性测试 · ${plat} · ${regions.join(' ')} ──`));

      progress({ phase: 'plan', regions: regions.map((region) => ({ region, url: urls[region] })) });

      runner.setBusy(true);
      try {
        const results = [];
        for (const region of regions) {
          progress({ phase: 'running', region, url: urls[region] });

          const result = await ping.probeRegion(region, urls[region], plat);
          results.push(result);
          progress({ phase: 'done', region, result });
        }

        const total = results.length;
        const ok = results.filter((item) => item.ok).length;
        send(log.format(ok === total ? 'SUCC' : 'WARN', `${ok}/${total} 个区域可达`));
        return { ok: ok === total, total, reachable: ok, results };
      } finally {
        runner.setBusy(false);
      }
    })();
  },

  /* 返回将要执行的抓取命令行 */
  'fetch-command'(_event: any, payload: any = {}) {
    const merged = { ...appConfig.current(), ...payload };
    const runs = merged.regions && merged.regions.length > 0
      ? merged.regions.map((region) => buildArgs({ ...merged, region }))
      : [buildArgs({ ...merged, region: null })];
    return { commands: runs.map((args) => `${path.basename(fetcher() || 'ResourceFetcher')} ${args.join(' ')}`) };
  },

  /* 按配置执行抓取并支持自动重试 */
  fetch(event: any, payload: any = {}) {
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
    const runs = regions.length > 0
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
            event.sender.send('run:log', { line: log.format('TIPS', `第 ${attempt} 次自动重试…`), stream: 'out', label, at: stamp() });

            await new Promise((resolve) => setTimeout(resolve, 1500));
          }

          outcome = await runner.streamCommand(event, exe, run.args, label);
          if (outcome.code === 0) break;
        }

        if (runner.wasCancelled()) break;

        const { code, lastRegion, seen } = outcome;
        if (code !== 0) {

          const missing = SERVER_REGIONS.find((name) => !seen.includes(name));
          const region = run.region === 'ALL' ? (missing || lastRegion || 'ALL') : run.region;
          failed = { region, code };
          break;
        }
      }
      runner.setBusy(false);
      if (mergeVersionFile(versionPath, versionBefore)) {
        event.sender.send('run:log', {
          line: log.format('INFO', `版本登记已合并：${Object.keys(readVersion(versionPath)).join(', ')}`),
          stream: 'out',
          at: stamp(),
        });
      }

      if (runner.wasCancelled()) return { ok: false, aborted: true, regions: fetchedRegions(platform()) };
      return { ok: !failed, failed, regions: fetchedRegions(platform()) };
    })();
  },

};

module.exports = handlers;
