import { guard } from '../app/api'
import { $, esc, fillSelect } from '../utils/dom'
import { fmtSize, say, shortPath } from '../utils/format'
import { state } from '../app/state'
import { toastConfig } from '../utils/toast'
import { openBrowse, refreshBrowse } from './browse'
import { closeVersionDialog, reinstallFetcher, skipFetcherVersion } from './settings'
import { toSlash } from '@shared/utils'

/* 渲染区域多选 chips */
export function renderRegionChips(meta) {
  const box = $('fetch-regions');
  box.innerHTML = '';

  const all = document.createElement('button');
  all.className = 'chip all';
  all.dataset.region = '*';
  all.textContent = '全部区域';
  all.title = '等价于 USE_DEFAULT_REGION=false：一次调用抓完所有区域';
  all.classList.toggle('on', isAllPicked());
  all.addEventListener('click', () => {
    state.picked.clear();
    renderRegionChips(state.meta);
    renderConfigLine();
    toastConfig();
    refreshFetchCommand();
  });
  box.appendChild(all);

  for (const region of meta.regions) {
    const has = meta.fetched.includes(region);
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.dataset.region = region;
    chip.textContent = region;
    if (has) chip.classList.add('fetched');
    chip.title = has ? `${region}：本地已有清单` : `${region}：尚未抓取`;
    chip.classList.toggle('on', state.picked.has(region));

    chip.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openClear(region);
    });
    chip.addEventListener('click', () => {
      if (state.picked.has(region)) state.picked.delete(region);
      else state.picked.add(region);
      renderRegionChips(state.meta);
      renderConfigLine();
      toastConfig();

      refreshFetchCommand();
    });
    box.appendChild(chip);
  }
}

/* 返回实际生效的区域列表全选时为空 */
export const effectiveRegions = () => (isAllPicked() ? [] : pickedRegions());

/* 渲染抓取命令行摘要 */
export function renderConfigLine() {
  const cfg = state.settings;

  const parts = [
    $('fetch-platform').value,
    isAllPicked() ? '全部区域' : pickedRegions().join(' '),
    `${cfg.timeout}s`,
    `重试 ${cfg.retries}`,
  ];
  if (cfg.mergePatch) parts.push('合并补丁');
  if (!cfg.useResourceRegex) parts.push('正则关');
  if (!cfg.filterOutdated) parts.push('保留过时');
  state.configText = parts.join(' · ');
}

$('btn-ver-cancel').addEventListener('click', closeVersionDialog);
$('btn-ver-install').addEventListener('click', reinstallFetcher);
$('btn-ver-skip').addEventListener('click', skipFetcherVersion);

/* 按下载字节更新进度条 */
export function applyDownloadProgress(got, total) {
  const pct = total ? Math.min(100, Math.round((got / total) * 100)) : 0;
  const text = `${pct}%  ·  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)}MB`;
  $('fetcher-bar').style.width = `${pct}%`;
  $('fetcher-progress-text').textContent = text;
  $('ver-bar').style.width = `${pct}%`;
  $('ver-progress-text').textContent = text;
}

export let pendingClear = null;

/* 打开区域清理确认弹窗 */
export async function openClear(region) {
  const platform = $('fetch-platform').value;
  const info = await guard(() => window.api.regionInfo({ region, platform }));
  if (!info) return;

  pendingClear = { region: info.region, platform };
  const fileCount = info.manifests.length + (info.cache ? info.cache.files : 0);

  $('clear-title').textContent = `清除 ${info.region} 的清单`;
  $('clear-sub').textContent = `平台 ${platform} · 共 ${fileCount} 个文件`;

  const rows = info.manifests.map((item) => (
    `<li><span>${esc(`${shortPath(info.paths.manifest)}/${item.name}`)}</span><b>${fmtSize(item.bytes)}</b></li>`
  ));
  if (info.cache) {
    rows.push(`<li><span>${esc(shortPath(info.cache.path))}（补丁缓存）</span><b>${info.cache.files} 个 · ${fmtSize(info.cache.bytes)}</b></li>`);
  }
  if (info.versionEntry) {
    rows.push(`<li><span>版本登记里的 ${esc(info.region)} 一项</span><b>—</b></li>`);
  }
  $('clear-list').innerHTML = rows.length ? rows.join('') : '<li class="empty">没有找到该区域已下载的清单</li>';

  $('clear-error').hidden = true;
  $('btn-clear-confirm').disabled = !info.removable;
  $('clear-modal').hidden = false;
}

/* 关闭区域清理弹窗 */
export function closeClear() {
  $('clear-modal').hidden = true;
  pendingClear = null;
}

/* 执行区域清理 */
export async function confirmClear() {
  if (!pendingClear) return;
  const button = $('btn-clear-confirm');
  const { region, platform } = pendingClear;

  button.disabled = true;
  const result = await guard(() => window.api.clearRegion({ region, platform }));
  button.disabled = false;
  if (!result) return;

  closeClear();
  say('SUCC', `已清除 ${region} 的清单（${result.removed} 个文件）`);
  await refreshFetched(platform);
  if ($('panel-browse').classList.contains('active')) await refreshBrowse();
}

$('btn-clear-cancel').addEventListener('click', closeClear);
$('btn-clear-confirm').addEventListener('click', confirmClear);
$('clear-modal').addEventListener('click', (event) => {
  if (event.target === $('clear-modal')) closeClear();
});

export const pingRows = new Map();

/* 把日志容器滚动到底部 */
export const scrollLog = () => {
  const box = $('run-log');
  box.scrollTop = box.scrollHeight;
};

/* 渲染一行连通性测试结果 */
export function pingRow(region) {
  const exists = pingRows.get(region);
  if (exists) return exists;

  const row = document.createElement('div');
  row.className = 'l-out ping-line';
  $('run-log').appendChild(row);
  pingRows.set(region, row);
  scrollLog();
  return row;
}

/* 把探测结果渲染成 HTML */
export function pingHtml(result) {
  const http = result.http || {};
  const status = http.status
    ? `HTTP ${http.status}${http.note ? `（${http.note}）` : ''}`
    : (http.error || '失败');
  const parts = [
    `<span class="region">${esc(result.region)}</span>`,
    `<span class="dim">${esc(result.url)}</span>`,
    `<span class="${result.ok ? 'ok' : http.status ? 'warn' : 'bad'}">${esc(status)}</span>`,
    `ping ${result.icmp == null ? '-' : `${result.icmp}ms`}`,
    `dns ${result.dns == null ? '-' : `${result.dns}ms`}`,
    `ttfb ${http.ttfb == null ? '-' : `${http.ttfb}ms`}`,
  ];
  if (http.size) parts.push(`${(http.size / 1048576).toFixed(1)}MB`);
  return parts.join(' · ');
}

window.api.onPingProgress(({ phase, regions, region, url, result }) => {
  if (phase === 'plan') {
    pingRows.clear();
    for (const item of regions) {
      const row = pingRow(item.region);
      row.innerHTML = `<span class="dot-idle"></span><span class="dim">${esc(item.region)} · ${esc(item.url)} · 等待中…</span>`;
    }
    scrollLog();
    return;
  }

  if (phase === 'running') {
    const row = pingRow(region);
    row.innerHTML = `<span class="spin"></span><span class="region">${esc(region)}</span> · <span class="dim">${esc(url)}</span> · 测试中…`;
    scrollLog();
    return;
  }

  if (phase === 'done') {
    const row = pingRow(region);
    row.innerHTML = pingHtml(result);
    scrollLog();
  }
});

export let fetcherPrompted = false;

/* 按抓取器状态刷新界面与提示 */
export function applyFetcherState(meta, { prompt = false, reason = '' } = {}) {
  const missing = !meta.fetcherOk;
  const notice = $('fetcher-notice');
  notice.hidden = !missing;
  if (!missing) {
    $('fetcher-modal').hidden = true;
    return;
  }

  $('fetcher-notice-text').textContent = `未找到抓取器 ${toSlash(meta.fetcherTarget)}，抓取清单前需要先下载。`;
  const dirLabel = toSlash(meta.fetcherTarget).split('/').filter(Boolean).pop() || 'ResourceTool';
  $('fetcher-modal-dir').textContent = `${dirLabel}/`;
  $('fetcher-modal-path').textContent = toSlash(meta.fetcherTarget);
  $('fetcher-reason').textContent = reason;
  $('fetcher-reason').hidden = !reason;

  if (prompt && meta.config.autoDownloadFetcher && !fetcherPrompted) {
    fetcherPrompted = true;
    $('fetcher-error').hidden = true;
    $('fetcher-progress').hidden = true;
    $('fetcher-bar').style.width = '0%';
    $('fetcher-modal').hidden = false;
  }
}

/* 提示并下载缺失的抓取器 */
export async function downloadFetcher() {
  const buttons = [$('btn-fetcher-download'), $('btn-fetcher-install')];
  for (const button of buttons) button.disabled = true;

  $('fetcher-error').hidden = true;
  $('fetcher-progress').hidden = false;
  $('fetcher-bar').style.width = '0%';
  $('fetcher-progress-text').textContent = '0%';

  const result = await guard(() => window.api.installFetcher());

  for (const button of buttons) button.disabled = false;
  if (!result) return;

  if (result.ok) {
    const meta = result.meta || (await window.api.meta());
    state.meta = meta;
    applyFetcherState(meta);
    $('fetcher-modal').hidden = true;
    $('fetcher-progress').hidden = true;
    say('SUCC', `抓取器已安装（${result.version}），可以直接抓取了`);
    return;
  }

  $('fetcher-progress').hidden = true;
  $('fetcher-error').hidden = false;
  $('fetcher-error').textContent = `下载失败：${result.error}（可在发布页手动下载后放进 ResourceTool/）`;
}

window.api.onRunProgress(({ got, total, phase }) => {
  if (phase !== 'download') return;
  applyDownloadProgress(got, total);
});

$('btn-fetcher-download').addEventListener('click', downloadFetcher);
$('btn-fetcher-install').addEventListener('click', downloadFetcher);
$('btn-fetcher-later').addEventListener('click', () => { $('fetcher-modal').hidden = true; });
$('btn-fetcher-open').addEventListener('click', () => window.api.openUrl(state.meta.releases));
$('btn-fetcher-releases').addEventListener('click', () => window.api.openUrl(state.meta.releases));

/* 刷新已抓到清单的区域 */
export async function refreshFetched(platformName) {
  const meta = await window.api.meta({ platform: platformName });
  state.meta = meta;
  renderRegionChips(meta);
  renderSummary(meta);
  const keep = $('browse-region').value;
  const options = meta.fetched.length ? meta.fetched : meta.regions;
  fillSelect($('browse-region'), options, options.includes(keep) ? keep : options[0]);
}

$('fetch-platform').addEventListener('change', async () => {
  renderConfigLine();
  await guard(() => refreshFetched($('fetch-platform').value));
  toastConfig();
  refreshFetchCommand();
});

/* 刷新抓取命令行 */
export async function refreshFetchCommand() {
  const box = $('fetch-command');
  if (box.hidden) return;

  const platform = $('fetch-platform').value;
  const result = await guard(() => window.api.fetchCommand({ platform, regions: effectiveRegions() }));
  if (!result) return;

  box.textContent = result.commands.join('\n\n');
}

$('btn-command').addEventListener('click', async () => {
  const box = $('fetch-command');
  const button = $('btn-command');

  if (!box.hidden) {
    box.hidden = true;
    button.textContent = '查看命令';
    return;
  }

  button.textContent = '收起命令';
  box.hidden = false;
  await refreshFetchCommand();
});

/* 开始执行抓取任务 */
export async function startFetch(regions) {
  const button = $('btn-fetch');
  if (button.disabled) return;

  button.hidden = true;
  $('btn-abort').hidden = false;
  $('btn-ping').disabled = true;
  $('fetch-command').hidden = true;
  $('btn-command').textContent = '查看命令';

  const platform = $('fetch-platform').value;
  const result = await guard(() => window.api.fetch({ platform, regions }));

  $('btn-abort').hidden = true;
  button.hidden = false;
  $('btn-ping').disabled = false;

  if (result && result.needFetcher) {
    say('WARN', '未找到 ResourceFetcher，请先下载或更新');
    await refreshFetched($('fetch-platform').value);
    applyFetcherState(state.meta, { reason: '点击「开始抓取」时发现抓取器不可用' });
    $('fetcher-modal').hidden = false;
    return;
  }

  if (result && result.aborted) {
    say('WARN', '已中断，已下载的部分保留，重跑会按哈希跳过');
  } else if (result) {
    if (result.ok) {
      const target = regions && regions.length ? regions.join(', ') : '全部区域';
      say('SUCC', `抓取完成：${target}｜${platform} 已抓 ${result.regions.join(', ') || '无'}`);
    } else {
      const region = result.failed?.region;
      say('ERRO', `抓取失败：${region} 退出码 ${result.failed?.code}`);
      if (region && region !== 'ALL') {
        say('TIPS', `${region} 的连接被对端中断（CDN 抖动），可以只重试该区域`);
      }
    }

    const meta = await window.api.meta({ platform });
    state.meta = meta;
    state.settings = { ...meta.config, regions: [...state.picked] };
    renderRegionChips(meta);
    renderSummary(meta);
    if (!result.ok && result.failed?.region && result.failed.region !== 'ALL') renderRetry(result.failed.region);
    fillSelect($('browse-region'), meta.fetched.length ? meta.fetched : meta.regions, meta.fetched[0]);
    await refreshBrowse();
  }

  button.disabled = false;
}

/* 渲染某个区域的重试状态 */
export function renderRetry(region) {
  const box = $('fetch-summary');
  if (box.querySelector(`[data-retry="${region}"]`)) return;

  const button = document.createElement('button');
  button.className = 'btn primary';
  button.dataset.retry = region;
  button.textContent = `重试 ${region}`;
  button.addEventListener('click', () => {
    button.disabled = true;
    startFetch([region]);
  });
  box.appendChild(button);
}

$('btn-fetch').addEventListener('click', () => {
  if (!state.meta.fetcherOk) {
    applyFetcherState(state.meta, { reason: '点击「开始抓取」时发现抓取器不可用' });
    $('fetcher-modal').hidden = false;
    return;
  }
  startFetch(effectiveRegions());
});

$('btn-clear-log').addEventListener('click', () => { $('run-log').textContent = ''; });
$('btn-clear-dl-log').addEventListener('click', () => { $('dl-log').textContent = ''; });

/* 中断当前抓取或下载 */
export async function abortRun() {
  const result = await guard(() => window.api.abort());
  if (!result) return;
  if (result.ok) say('TIPS', `正在中断（pid ${result.pid}）…`);
  else say('WARN', '当前没有正在运行的任务');
}

/* 渲染抓取页顶部的汇总信息 */
export function renderSummary(meta) {
  const box = $('fetch-summary');
  box.innerHTML = '';

  if (!meta.fetched.length) {
    box.textContent = '尚未抓取';
    return;
  }

  for (const region of meta.fetched) {
    const stat = document.createElement('button');
    stat.className = 'stat';
    stat.type = 'button';
    stat.dataset.region = region;
    stat.textContent = region;
    stat.title = `左键：在「清单预览」中查看 ${meta.platform} · ${region}｜右键：清除该区域清单`;
    stat.addEventListener('click', () => openBrowse(meta.platform, region));
    stat.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openClear(region);
    });
    box.appendChild(stat);
  }
}

/* 返回当前选中的区域列表 */
const pickedRegions = () => [...state.picked];

/* 判断是否处于全选状态 */
const isAllPicked = () => {
  const total = state.meta ? state.meta.regions.length : 5;
  return state.picked.size === 0 || state.picked.size === total;
};

$('btn-abort').addEventListener('click', abortRun);
$('btn-abort-uncensor').addEventListener('click', abortRun);
