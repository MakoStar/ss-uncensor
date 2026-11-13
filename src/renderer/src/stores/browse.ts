import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { relPath, sizeText } from '../utils/format';
import { toast } from '../utils/toast';
import { useMetaStore } from './meta';

export const MIN_LOADING_MS = 260;

const RESOURCE_SERVERS: Record<string, string> = {
  CN: 'https://nova-static.yostar.cn',
  EN: 'https://nova-static.stellasora.global',
  JP: 'https://nova-static.stellasora.jp',
  KR: 'https://nova-static.stellasora.kr',
  TW: 'https://nova-static.stargazer-games.com'
};

export interface ManifestItem {
  file: string;
  version: string;
  hash: string;
  extra: string;
}

export const useBrowseStore = defineStore('browse', () => {
  const meta = useMetaStore();

  const platform = ref('');
  const region = ref('');
  const source = ref('patch');
  const order = ref('FileName');
  const dir = ref('asc');
  const query = ref('');

  const page = ref(1);
  const pages = ref(1);
  const items = ref<ManifestItem[]>([]);
  const totalText = ref('');
  const loading = ref(false);
  const empty = ref({ text: '', tip: '' });
  const renderKey = ref(0);

  const viewFile = ref({ open: false, path: '', label: '', text: '', error: '', busy: false });

  let seq = 0;
  let queryTimer: number | null = null;

  const regionOptions = computed(() => (meta.fetched.length ? meta.fetched : meta.regions));
  const pagerVisible = computed(() => pages.value > 1);

  /** 按当前条件查询清单列表 */
  async function refresh() {
    if (!platform.value) platform.value = meta.platform;
    if (!region.value) region.value = regionOptions.value[0] || '';

    const mine = ++seq;
    loading.value = true;
    const startedAt = Date.now();

    const result = await guard(() =>
      window.api.listManifest({
        platform: platform.value,
        region: region.value,
        source: source.value,
        order: order.value,
        dir: dir.value,
        query: query.value,
        page: page.value
      })
    );
    if (mine !== seq) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
    loading.value = false;

    if (!result) {
      items.value = [];
      page.value = 1;
      pages.value = 1;
      totalText.value = '';
      empty.value = { text: '查询失败', tip: '接口没有返回结果，稍后再试或查看日志' };
      return;
    }

    if (result.error) {
      items.value = [];
      page.value = 1;
      pages.value = 1;
      totalText.value = result.error;
      empty.value = { text: result.error, tip: '切换平台 / 区域，或先在「抓取清单」页拉取对应清单' };
      return;
    }

    page.value = result.page;
    pages.value = result.pages;
    items.value = result.items;
    renderKey.value += 1;
    totalText.value = `${result.total} 条 · 第 ${result.page}/${result.pages} 页 · ${relPath(result.file)}`;

    const keyword = String(query.value || '').trim();
    if (keyword && result.total === 0) {
      empty.value = {
        text: `没有匹配「${keyword}」的文件`,
        tip: '关键词按子串匹配文件名，试试更短的片段，或清空关键词看全部'
      };
      return;
    }
    if (result.items.length === 0) {
      empty.value = { text: '没有可显示的条目', tip: '该清单可能为空，或当前页已越界' };
      return;
    }
    empty.value = { text: '', tip: '' };
  }

  /** 延迟触发关键词搜索 */
  function applyQuery() {
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = window.setTimeout(() => {
      page.value = 1;
      void refresh();
    }, 250);
  }

  /** 重置页码并重新查询 */
  function reload() {
    if (queryTimer) clearTimeout(queryTimer);
    page.value = 1;
    void refresh();
  }

  /** 切换清单来源并刷新 */
  function setSource(value: string) {
    source.value = value;
    reload();
  }

  /** 切换排序字段并刷新 */
  function setOrder(value: string) {
    order.value = value;
    reload();
  }

  /** 切换升降序并刷新 */
  function setDir(value: string) {
    dir.value = value;
    reload();
  }

  /** 跳转到指定页码 */
  function turn(next: number) {
    page.value = next;
    void refresh();
  }

  /** 校验页码后跳转 */
  function jumpTo(value: number | string) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(n, 1), Math.max(pages.value, 1));
    if (clamped === page.value) return;
    page.value = clamped;
    void refresh();
  }

  /** 切换平台并重新查询 */
  async function setPlatform(name: string) {
    platform.value = name;
    await meta.setPlatform(name);
    page.value = 1;
    await refresh();
  }

  /** 切换区域并重新查询 */
  function setRegion(name: string) {
    region.value = name;
    page.value = 1;
    void refresh();
  }

  /** 按外部传入条件打开清单 */
  function openAt(platformName: string, regionName: string) {
    platform.value = platformName;
    if (regionOptions.value.includes(regionName)) region.value = regionName;
    page.value = 1;
    void refresh();
  }

  /** 读取并展示清单文件内容 */
  async function openViewFile() {
    const view = viewFile.value;
    view.open = true;
    view.busy = true;
    view.error = '';
    view.text = '正在读取…';
    view.path = `${meta.meta.dirs.manifest}/${region.value}`;
    view.label = relPath(`${view.path}/${platform.value}_${source.value}_manifest.json`);

    const result = await guard(() =>
      window.api.manifestText({
        platform: platform.value,
        region: region.value,
        source: source.value
      })
    );

    view.busy = false;
    if (!result) {
      view.text = '';
      view.error = '读取失败，接口没有返回结果';
      return;
    }
    if (result.error) {
      view.text = '';
      view.error = result.error;
      return;
    }

    view.path = result.file;
    view.label = `${relPath(result.file)} · ${sizeText(result.size)}`;
    view.text = result.truncated
      ? `${result.text}\n\n… 文件较大，仅显示开头 ${sizeText(result.text.length)}，完整内容请打开目录查看`
      : result.text;
  }

  /** 关闭清单文件预览 */
  function closeViewFile() {
    viewFile.value.open = false;
  }

  /** 复制预览文件内容到剪贴板 */
  async function copyViewFile() {
    const text = viewFile.value.text;
    if (!text || text === '正在读取…') return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast({ key: 'viewfile', kind: 'ok', title: '已复制', text: `${text.length} 个字符`, timeout: 2500 });
  }

  /** 打开清单文件所在目录 */
  function openViewFileDir() {
    window.api.openDir(viewFile.value.path || `${meta.meta.dirs.manifest}/${region.value}`);
  }

  /** 拼接资源的下载地址 */
  function resourceUrl(item: ManifestItem) {
    const base = RESOURCE_SERVERS[String(region.value || 'CN').toUpperCase()] || RESOURCE_SERVERS.CN;
    const segs = ['res', platform.value, String(item.version ?? ''), item.extra, item.file]
      .filter((seg) => seg !== '' && seg != null)
      .map((seg) => encodeURIComponent(String(seg)));
    return `${base}/${segs.join('/')}`;
  }

  /** 复制资源下载地址 */
  async function copyResourceUrl(item: ManifestItem) {
    const url = resourceUrl(item);
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast({ key: 'resurl', kind: 'ok', title: '已复制资源地址', text: url, timeout: 4000 });
  }

  return {
    platform,
    region,
    source,
    order,
    dir,
    query,
    page,
    pages,
    items,
    totalText,
    loading,
    empty,
    viewFile,
    renderKey,
    regionOptions,
    pagerVisible,
    refresh,
    applyQuery,
    reload,
    setSource,
    setOrder,
    setDir,
    turn,
    jumpTo,
    setPlatform,
    setRegion,
    openAt,
    openViewFile,
    closeViewFile,
    copyViewFile,
    openViewFileDir,
    resourceUrl,
    copyResourceUrl
  };
});
