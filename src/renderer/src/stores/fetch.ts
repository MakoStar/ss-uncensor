import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { state } from '../app/state';
import { guard } from '../app/api';
import { $, esc } from '../utils/dom';
import { relPath, say as sayRaw, shortPath } from '../utils/format';
import { logToFile } from '../utils/log';
import { useBrowseStore } from './browse';
import { useDiffStore } from './diff';
import { useMetaStore } from './meta';
import { useSettingsStore } from './settings';
import { playComplete } from './sound';
import { toSlash } from '@shared/utils';

/** 带模块标记输出运行日志 */
const say = (tag: string, message: string): void => sayRaw(tag, message, 'fetch');

const pingRows = new Map<string, HTMLElement>();
const pingDone = new Set<string>();

/** 把运行日志滚动到底部 */
const scrollLog = (): void => {
  const box = $('run-log');
  if (box) box.scrollTop = box.scrollHeight;
};

/** 取得或创建区域的测试行 */
function pingRow(region: string): HTMLElement {
  const exists = pingRows.get(region);
  if (exists && exists.isConnected) return exists;

  const row = document.createElement('div');
  row.className = 'l-out ping-line';
  $('run-log').appendChild(row);
  pingRows.set(region, row);
  scrollLog();
  return row;
}

/** 把连通性结果拼成行内容 */
function pingHtml(result: any): string {
  const http = result.http || {};
  const status = http.status ? `HTTP ${http.status}${http.note ? `（${http.note}）` : ''}` : http.error || '失败';
  const parts = [
    `<span class="region">${esc(result.region)}</span>`,
    `<span class="dim">${esc(result.url)}</span>`,
    `<span class="${result.ok ? 'ok' : http.status ? 'warn' : 'bad'}">${esc(status)}</span>`,
    `ping ${result.icmp == null ? '-' : `${result.icmp}ms`}`,
    `dns ${result.dns == null ? '-' : `${result.dns}ms`}`,
    `ttfb ${http.ttfb == null ? '-' : `${http.ttfb}ms`}`
  ];
  if (http.size) parts.push(`${(http.size / 1048576).toFixed(1)}MB`);
  return parts.join(' · ');
}

/** 把连通性结果拼成纯文本 */
const pingText = (result: any): string => {
  const http = result.http || {};
  const status = http.status ? `HTTP ${http.status}${http.note ? `(${http.note})` : ''}` : http.error || '失败';
  return `${result.region} · ${result.url} · ${result.ok ? '可达' : '不可达'} · ${status} · ping ${result.icmp == null ? '-' : `${result.icmp}ms`} · dns ${result.dns == null ? '-' : `${result.dns}ms`} · ttfb ${http.ttfb == null ? '-' : `${http.ttfb}ms`}`;
};

export const useFetchStore = defineStore('fetch', () => {
  const meta = useMetaStore();

  const running = ref(false);
  const pingBusy = ref(false);
  const commandOpen = ref(false);
  const commandText = ref('');

  const retries = ref<string[]>([]);

  const clearModal = ref({ open: false, title: '', sub: '', list: [] as any[], error: '', removable: true });

  const fetcherModal = ref({
    open: false,
    path: '',
    dir: '',
    reason: '',
    error: '',
    progress: { visible: false, pct: 0, text: '0%' },
    busy: false
  });

  const manifestModal = ref({ open: false, root: '', rel: '', regions: [] as any[] });

  watch(
    () => [meta.platform, meta.effectiveRegions],
    () => {
      if (commandOpen.value) void refreshCommand();
    }
  );

  /** 按平台刷新抓取命令文本 */
  async function refreshCommand(): Promise<void> {
    if (!commandOpen.value) return;
    const result = await guard(() =>
      window.api.fetchCommand({ platform: meta.platform, regions: meta.effectiveRegions })
    );
    if (result) commandText.value = result.commands.join('\n\n');
  }

  /** 展开或收起抓取命令 */
  async function toggleCommand(): Promise<void> {
    commandOpen.value = !commandOpen.value;
    if (commandOpen.value) await refreshCommand();
  }

  /** 按选中区域启动资源抓取 */
  async function start(regions: string[]): Promise<void> {
    if (running.value) return;
    running.value = true;
    commandOpen.value = false;

    const platform = meta.platform;
    const result = await guard(() => window.api.fetch({ platform, regions }));
    running.value = false;

    if (result && result.needFetcher) {
      say('WARN', '未找到 ResourceFetcher, 请先下载或更新');
      await meta.load(platform);
      applyFetcherState(state.meta, { reason: '点击「开始抓取」时发现抓取器不可用' });
      $('fetcher-modal').hidden = false;
      return;
    }

    if (result && result.aborted) {
      say('WARN', '已中断, 已下载的部分保留, 重跑会按哈希跳过');
      playComplete('info');
      return;
    }

    if (!result) return;

    if (result.ok) {
      const target = regions.length ? regions.join(', ') : '全部区域';
      say('SUCC', `抓取完成: ${target}|${platform} 已抓 ${result.regions.join(', ') || '无'}`);
      playComplete('success');
    } else {
      const region = result.failed?.region;
      say('ERRO', `抓取失败: ${region} 退出码 ${result.failed?.code}`);
      playComplete('error');
      if (region && region !== 'ALL') {
        say('TIPS', `${region} 的连接被对端中断(CDN 抖动), 可以只重试该区域`);
        if (!retries.value.includes(region)) retries.value.push(region);
      }
    }

    await meta.load(platform);
    await useBrowseStore().refresh();
    void useDiffStore().refreshManifests();
  }

  /** 中断正在运行的抓取任务 */
  async function abort(): Promise<void> {
    const result = await guard(() => window.api.abort());
    if (!result) return;
    if (result.ok) say('TIPS', `正在中断(pid ${result.pid})..`);
    else say('WARN', '当前没有正在运行的任务');
  }

  /** 测试各区域的连通性 */
  async function ping(): Promise<void> {
    if (running.value) return;

    if (pingBusy.value) {
      await guard(() => window.api.abort());
      return;
    }

    pingBusy.value = true;
    const result = await guard(() => window.api.ping({ platform: meta.platform, regions: meta.effectiveRegions }));
    pingBusy.value = false;

    if (result && result.aborted) {
      say('TIPS', '连通性测试已中断, 已完成的区域结果保留');
      playComplete('info');
    } else if (result && !result.ok) {
      say('TIPS', '有区域不可达, 可以先只勾可用的区域抓, 或稍后重试');
      playComplete('warn');
    } else if (result) {
      playComplete('success');
    }
  }

  /** 打开区域清单清理弹窗 */
  async function openClear(region: string): Promise<void> {
    const info = await guard(() => window.api.regionInfo({ region, platform: meta.platform }));
    if (!info) return;

    const fileCount = info.manifests.length + (info.cache ? info.cache.files : 0);
    const rows = info.manifests.map((item: any) => ({
      name: `${shortPath(info.paths.manifest)}/${item.name}`,
      bytes: item.bytes
    }));
    if (info.cache) {
      rows.push({
        name: `${shortPath(info.cache.path)}（补丁缓存）`,
        bytes: info.cache.bytes,
        note: `${info.cache.files} 个`
      });
    }
    if (info.versionEntry) rows.push({ name: `版本登记里的 ${info.region} 一项`, bytes: null });

    clearModal.value = {
      open: true,
      title: `清除 ${info.region} 的清单`,
      sub: `平台 ${meta.platform} · 共 ${fileCount} 个文件`,
      list: rows,
      error: '',
      removable: Boolean(info.removable)
    };
  }

  /** 确认并清除该区域清单 */
  async function confirmClear(): Promise<void> {
    if (!clearModal.value.open) return;
    const result = await guard(() =>
      window.api.clearRegion({
        region: clearModal.value.title.replace(/^清除 /, '').replace(/ 的清单$/, ''),
        platform: meta.platform
      })
    );
    if (!result) return;
    clearModal.value.open = false;
    say('SUCC', `已清除 ${result.region || ''} 的清单(${result.removed} 个文件)`);
    playComplete('success');
    await meta.load(meta.platform);
    await useBrowseStore().refresh();
  }

  /** 按抓取器状态填充提示 */
  function applyFetcherState(
    info: any,
    { prompt = false, reason = '' }: { prompt?: boolean; reason?: string } = {}
  ): void {
    if (!info || info.fetcherOk) return;

    const target = toSlash(info.fetcherTarget);
    fetcherModal.value.path = target;
    fetcherModal.value.dir = `${target.split('/').filter(Boolean).pop() || 'ResourceTool'}/`;
    fetcherModal.value.reason = reason;
    if (prompt) fetcherModal.value.open = true;
  }

  /** 下载并安装抓取器程序 */
  async function downloadFetcher(): Promise<void> {
    if (fetcherModal.value.busy) return;
    fetcherModal.value.busy = true;
    fetcherModal.value.error = '';
    fetcherModal.value.progress = { visible: true, pct: 0, text: '0%' };

    const result = await guard(() => window.api.installFetcher());
    fetcherModal.value.busy = false;
    if (!result) return;

    if (result.ok) {
      await meta.load(meta.platform);
      await useSettingsStore().checkFetcherUpdate({ silent: true });
      fetcherModal.value.open = false;
      fetcherModal.value.progress.visible = false;
      say('SUCC', `抓取器已安装(${result.version}), 可以直接抓取了`);
      playComplete('success');
      return;
    }
    fetcherModal.value.progress.visible = false;
    fetcherModal.value.error = `下载失败：${result.error}（可在发布页手动下载后放进 ResourceTool/）`;
    playComplete('error');
  }

  /** 按已下载字节更新进度 */
  function applyDownloadProgress(got: number, total: number): void {
    const pct = total ? Math.min(100, Math.round((got / total) * 100)) : 0;
    const text = `${pct}%  ·  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)}MB`;
    fetcherModal.value.progress = { visible: true, pct, text };
  }

  window.api.onRunProgress(({ got, total, phase, scope }: any) => {
    if (scope === 'fetcher' && !fetcherModal.value.busy) return;
    if (phase === 'prepare') {
      fetcherModal.value.progress = { visible: true, pct: 0, text: '查询版本…' };
      return;
    }
    if (phase !== 'download') return;
    applyDownloadProgress(got, total);
  });

  /** 打开清单目录浏览弹窗 */
  async function openManifest(): Promise<void> {
    manifestModal.value = { open: true, root: '', rel: '', regions: [] };
    const result = await guard(() => window.api.manifestTree({ platform: meta.platform }));
    if (!result || !result.ok) {
      manifestModal.value.rel = '读取失败';
      return;
    }
    manifestModal.value.root = result.root;
    manifestModal.value.rel = `${relPath(result.rel)} · ${meta.platform} · ${result.regions.length} 个区域`;
    manifestModal.value.regions = result.regions;
  }

  /** 用系统程序打开清单文件 */
  function openManifestFile(file: string): void {
    window.api.openPath(file);
  }

  /** 用系统程序打开清单目录 */
  function openManifestDir(dir: string): void {
    window.api.openPath(dir);
  }

  /** 清空运行日志面板内容 */
  function clearLog(): void {
    const box = $('run-log');
    if (box) box.textContent = '';
    pingRows.clear();
    pingDone.clear();
  }

  window.api.onPingProgress(({ phase, regions, region, url, result }: any) => {
    if (phase === 'plan') {
      pingRows.clear();
      pingDone.clear();
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
      pingDone.add(region);
      const row = pingRow(region);
      row.innerHTML = pingHtml(result);
      scrollLog();
      logToFile(pingText(result));
      return;
    }

    if (phase === 'abort') {
      for (const [name, row] of pingRows) {
        if (pingDone.has(name)) continue;
        row.innerHTML = `<span class="dot-idle"></span><span class="dim">${esc(name)} · 已中断</span>`;
      }
      scrollLog();
    }
  });

  /** 在浏览器打开发布页 */
  async function openReleases(): Promise<void> {
    const url = meta.meta?.releases || '';
    if (!url) return;
    await guard(() => window.api.openUrl(url));
  }

  return {
    running,
    pingBusy,
    commandOpen,
    commandText,
    retries,
    clearModal,
    fetcherModal,
    manifestModal,
    refreshCommand,
    toggleCommand,
    start,
    abort,
    ping,
    clearLog,
    openClear,
    confirmClear,
    applyFetcherState,
    downloadFetcher,
    applyDownloadProgress,
    openManifest,
    openManifestFile,
    openManifestDir,
    openReleases
  };
});
