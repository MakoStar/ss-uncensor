import { guard } from '../app/api'
import { askConfirm, showError } from '../app/dialog'
import { $, esc, fillSelect } from '../utils/dom'
import { relPath, say } from '../utils/format'
import { state } from '../app/state'
import { toast, toastConfig } from '../utils/toast'
import { effectiveRegions, refreshFetched, renderConfigLine } from './fetch'
import { loadVersion } from './version'
import { toSlash } from '@shared/utils'

/* 渲染抓取器版本信息 */
export function renderFetcherVersion() {
  const info = state.fetcher || {};
  const button = $('btn-fetcher-update');
  const hint = $('fetcher-hint');

  if (!info.local && !info.latest) {
    hint.textContent = '';
    button.disabled = true;
    button.textContent = '更新抓取器';
    return;
  }

  button.disabled = !info.updateAvailable;
  button.textContent = info.updateAvailable ? `更新到 ${info.latest}` : '已是最新';

  if (info.updateAvailable) {
    hint.textContent = `有新版本：本地 ${info.local} → 最新 ${info.latest}，更新前会自动备份当前版本`;
  } else if (info.error) {
    hint.textContent = `检查失败：${info.error}`;
  } else {
    hint.textContent = `抓取器 ${info.local}，已是最新`;
  }
}

/* 检查抓取器是否有新版本 */
export async function checkFetcherUpdate({ silent = false } = {}) {
  const info = await guard(() => window.api.fetcherVersion());
  if (!info) return null;

  state.fetcher = info;
  renderFetcherVersion();

  const skipped = state.settings.skippedFetcher;
  if (info.updateAvailable && !silent && info.latest !== skipped) {
    toast({ key: 'fetcher', kind: 'warn', title: '抓取器可更新', text: `${info.local} → ${info.latest}`, timeout: 5000 });
  }
  return info;
}

/* 打开发型版本弹窗 */
export async function openVersionDialog() {
  const modal = $('version-modal');
  $('ver-local').textContent = '查询中…';
  $('ver-latest').textContent = '查询中…';
  $('ver-note').textContent = '正在查询 GitHub Releases…';
  $('ver-error').hidden = true;
  $('ver-progress').hidden = true;
  $('ver-bar').style.width = '0%';
  modal.hidden = false;

  const info = await checkFetcherUpdate({ silent: true });
  if (!info) {
    $('ver-note').textContent = '查询失败';
    $('ver-error').hidden = false;
    $('ver-error').textContent = '无法连接 GitHub，稍后再试或点「打开发布页」手动下载';
    return;
  }

  const skipped = state.settings.skippedFetcher;
  $('ver-local').textContent = info.local || '未安装';
  $('ver-latest').textContent = info.latest || '查询失败';

  const latestBox = $('ver-latest').parentElement;

  latestBox.classList.toggle('latest', Boolean(info.latest && !info.updateAvailable));
  latestBox.classList.toggle('outdated', Boolean(info.updateAvailable));

  if (info.error) {
    $('ver-note').textContent = `查询失败：${info.error}`;
  } else if (info.updateAvailable) {
    $('ver-note').textContent = skipped === info.latest
      ? `有新版本（已跳过提醒），随时可以重装`
      : '有新版本，重装前会自动备份当前版本，中途失败自动回滚';
  } else {
    $('ver-note').textContent = '当前已是最新版本；仍可点「重装最新版」重新下载一份。';
  }
}

/* 重装当前版本抓取器 */
export async function reinstallFetcher() {
  const button = $('btn-ver-install');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = '下载中…';
  $('ver-progress').hidden = false;
  $('ver-bar').style.width = '0%';
  $('ver-progress-text').textContent = '0%';
  $('ver-error').hidden = true;

  const result = await guard(() => window.api.installFetcher({ update: true }));

  button.disabled = false;
  button.textContent = '重装最新版';

  if (!result) {
    $('ver-error').hidden = false;
    $('ver-error').textContent = '操作失败，请查看运行日志';
    return;
  }
  if (!result.ok) {
    $('ver-progress').hidden = true;
    $('ver-error').hidden = false;
    $('ver-error').textContent = result.error;
    return;
  }

  closeVersionDialog();
  state.meta = result.meta;
  toast({ key: 'fetcher', kind: 'ok', title: '抓取器已更新', text: `${result.version} 已就绪`, timeout: 4000 });
  await checkFetcherUpdate({ silent: true });
  renderSettings();
}

/* 跳过某个抓取器版本不再提示 */
export async function skipFetcherVersion() {
  const latest = state.fetcher && state.fetcher.latest;
  if (!latest) {
    closeVersionDialog();
    return;
  }
  state.settings = { ...state.settings, skippedFetcher: latest };
  const result = await guard(() => window.api.saveSettings(state.settings));
  if (result) state.settings = { ...result.config };
  closeVersionDialog();
  toast({ key: 'fetcher', kind: 'info', title: '已跳过', text: `不再提醒 ${latest}，出现更新的还会提示`, timeout: 4000 });
}

/* 关闭版本弹窗 */
export function closeVersionDialog() {
  $('version-modal').hidden = true;
}

$('btn-fetcher-check').addEventListener('click', openVersionDialog);

/* 下载并更新抓取器 */
export async function updateFetcher() {
  const button = $('btn-fetcher-update');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = '更新中…';

  const result = await guard(() => window.api.installFetcher({ update: true }));
  button.disabled = false;

  if (!result) {
    button.textContent = '更新抓取器';
    return;
  }

  if (result.ok) {
    state.meta = result.meta;
    toast({ key: 'fetcher', kind: 'ok', title: '抓取器已更新', text: `${result.version} 已就绪`, timeout: 4000 });
    $('fetcher-hint').textContent = `抓取器 ${result.version}，已是最新`;
    await checkFetcherUpdate({ silent: true });
    renderSettings();
  } else {
    toast({ key: 'fetcher', kind: 'err', title: '更新失败', text: result.error, timeout: 6000 });
    await checkFetcherUpdate({ silent: true });
  }
}

$('version-platform').addEventListener('change', async () => {
  const target = $('version-platform').value;
  await guard(async () => {
    await refreshFetched(target);
    $('fetch-platform').value = target;
    $('browse-platform').value = target;
    $('version-path').value = toSlash(state.meta.versionFile);
    renderConfigLine();
  });
  await loadVersion();
});

$('version-path').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadVersion();
});

/* 渲染设置页表单 */
export function renderSettings() {
  const cfg = state.settings;
  const meta = state.meta;

  $('set-platform').value = cfg.platform;
  $('set-fetcher').value = cfg.fetcher || '';
  $('set-output').value = cfg.outputRoot || '';
  $('set-timeout').value = cfg.timeout;
  $('set-retries').value = cfg.retries;
  $('set-autoretry').value = cfg.autoRetry;
  $('set-loglevel').value = cfg.logLevel;
  $('set-patterns').value = cfg.resPatterns;
  $('set-useregex').checked = Boolean(cfg.useResourceRegex);
  $('set-filter').checked = Boolean(cfg.filterOutdated);
  $('set-merge').checked = Boolean(cfg.mergePatch);
  $('set-overwrite').checked = Boolean(cfg.overwrite);
  $('set-autofetcher').checked = Boolean(cfg.autoDownloadFetcher);

  $('uncensor-timeout').value = cfg.uncensor.timeout;
  $('uncensor-retries').value = cfg.uncensor.retries;
  if (cfg.uncensor.dir) $('uncensor-dir').value = cfg.uncensor.dir;
  $('settings-file').textContent = relPath(meta.settingsFile);

  const rows = [
    ['运行时', `electron ${meta.electron} / node ${meta.node}`],
    ['抓取器', state.fetcher && state.fetcher.local ? `${relPath(meta.fetcher)} · ${toSlash(state.fetcher.local)}` : relPath(meta.fetcher)],
    ['输出根目录', relPath(meta.dirs.output)],
    ['清单目录', relPath(meta.dirs.manifest)],
    ['补丁缓存', relPath(meta.dirs.metadata)],
    ['合成清单', relPath(meta.dirs.generatedMani)],
    ['差异产物', relPath(meta.dirs.generatedDiff)],
    ['资源目录', relPath(meta.dirs.resource)],
    ['已抓区域', meta.fetched.join(', ') || '(none)'],
  ];
  $('env-kv').innerHTML = rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('');
}

/* 收集设置页表单为配置对象 */
export function collectSettings() {
  const cfg = state.settings;
  return {
    ...cfg,

    regions: effectiveRegions(),
    platform: $('set-platform').value,
    fetcher: $('set-fetcher').value.trim(),
    outputRoot: $('set-output').value.trim(),
    timeout: Number($('set-timeout').value) || cfg.timeout,
    retries: Number($('set-retries').value),
    autoRetry: Number($('set-autoretry').value),
    logLevel: $('set-loglevel').value,
    resPatterns: $('set-patterns').value.trim(),
    useResourceRegex: $('set-useregex').checked,
    filterOutdated: $('set-filter').checked,
    mergePatch: $('set-merge').checked,
    overwrite: $('set-overwrite').checked,
    autoDownloadFetcher: $('set-autofetcher').checked,

    uncensor: { ...cfg.uncensor },
  };
}

$('btn-save-settings').addEventListener('click', async () => {
  const result = await guard(() => window.api.saveSettings(collectSettings()));
  if (!result) return;

  state.meta = result.meta;
  state.settings = { ...result.config };
  state.picked = new Set(result.config.regions || []);
  say('SUCC', '配置已保存并生效');

  fillSelect($('fetch-platform'), state.meta.platforms, result.config.platform);
  fillSelect($('browse-platform'), state.meta.platforms, result.config.platform);
  fillSelect($('version-platform'), state.meta.platforms, result.config.platform);
  $('version-path').value = state.meta.versionFile || '';
  renderSettings();
  renderConfigLine();
  toastConfig();
});

/* 载入诊断日志 */
export async function loadDiag() {
  const result = await guard(() => window.api.diag());
  if (result) {
    $('diag-tail').textContent = `启动日志：${result.log}\n\n${result.tail}`;
  }
}

$('btn-open-log').addEventListener('click', async () => {
  const result: any = await window.api.diag();
  await window.api.openDir(result.log);
});

$('btn-fetcher-update').addEventListener('click', updateFetcher);

/* 卸载：确认后调起安装包自带的卸载器 */
$('btn-uninstall').addEventListener('click', async () => {
  const yes = await askConfirm('卸载星塔反和谐工具', '会先关闭应用再删除安装目录；配置与已下载资源在卸载向导里还会再问一次。继续吗？', '继续卸载');
  if (!yes) return;
  const result = await window.api.uninstallApp();
  if (!result || !result.ok) showError('无法卸载', (result && result.error) || '没有找到卸载程序，可到「设置 → 应用」里卸载');
});
