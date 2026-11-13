import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { state } from '../app/state';
import { askConfirm, showError } from '../app/dialog';
import { cleanError, relPath, say } from '../utils/format';
import { toast, toastConfig } from '../utils/toast';
import { toSlash } from '@shared/utils';
import { useMetaStore } from './meta';
import { useBackgroundStore } from './background';

export const CHANNEL_LABEL: Record<string, string> = {
  stable: '正式版',
  alpha: 'Alpha 测试版',
  beta: 'Beta 测试版',
  rc: 'RC 候选版'
};

export const CHANNEL_SHORT: Record<string, string> = { stable: 'Stable', alpha: 'Alpha', beta: 'Beta', rc: 'RC' };

export const CHANNEL_OPTIONS = [
  { value: 'stable', label: 'Stable 正式版' },
  { value: 'alpha', label: 'Alpha 测试版' },
  { value: 'beta', label: 'Beta 测试版' },
  { value: 'rc', label: 'RC 候选版' }
];

/** 按版本标签识别发布通道 */
export function channelOf(tag: string): string {
  const text = String(tag || '').toLowerCase();
  if (/-alpha(\.\d+)?$/.test(text)) return 'alpha';
  if (/-beta(\.\d+)?$/.test(text)) return 'beta';
  if (/-rc(\.\d+)?$/.test(text)) return 'rc';
  return 'stable';
}

/** 把规则文本拆成字符串数组 */
export function splitPatterns(raw: unknown): string[] {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return [];
  const inner = text
    .replace(/^\s*\[/, '')
    .replace(/\]\s*$/, '')
    .trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) =>
      item
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
    )
    .filter(Boolean);
}

/** 把字符串数组拼成规则文本 */
export function joinPatterns(list: unknown): string {
  const items = (Array.isArray(list) ? list : [])
    .map((item) => String(item == null ? '' : item).trim())
    .filter(Boolean);
  if (!items.length) return '';
  return `[${items.map((item) => `"${item.replace(/"/g, '\\"')}"`).join(',')}]`;
}

export const useSettingsStore = defineStore('settings', () => {
  const meta = useMetaStore();

  const form = ref<any>({
    platform: 'win',
    fetcher: '',
    fetcherChannel: 'stable',
    fetcherMirror: 'official',
    outputRoot: '',
    timeout: 900,
    retries: 3,
    autoRetry: 0,
    logLevel: 'info',
    resPatterns: '',
    resPatternList: [] as string[],
    useResourceRegex: false,
    filterOutdated: false,
    mergePatch: false,
    overwrite: false,
    autoDownloadFetcher: true,
    background: true
  });

  const fetcherInfo = ref<any>(null);

  const versionModal = ref({
    open: false,
    local: '—',
    latest: '—',
    localChannel: '',
    latestChannel: '',
    note: '',
    error: ''
  });

  const rollback = ref({ open: false, versions: [] as any[], tag: '', error: '', note: '' });

  const emptyJob = (): {
    busy: boolean;
    kind: string;
    title: string;
    pct: number;
    text: string;
    error: string;
  } => ({ busy: false, kind: '', title: '', pct: 0, text: '', error: '' });
  const fetcherJob = ref(emptyJob());

  window.api.onRunProgress((data: any) => {
    if (!data || data.scope !== 'fetcher') return;
    const job = fetcherJob.value;
    if (!job.busy) return;
    if (data.phase === 'prepare') {
      job.text = '查询版本…';
      return;
    }
    if (data.phase === 'extract') {
      job.text = '解压安装中…';
      return;
    }
    if (data.phase === 'done') {
      job.pct = 100;
      job.text = '100%';
      return;
    }
    const got = Number(data.got) || 0;
    const total = Number(data.total) || 0;
    const pct = total ? Math.min(100, Math.round((got / total) * 100)) : 0;
    job.pct = pct;
    job.text = total
      ? `${pct}% · ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)}MB`
      : `${(got / 1048576).toFixed(1)}MB`;
  });

  const diagTail = ref('');

  const configModal = ref({ open: false, file: '', text: '', error: '', busy: false, reloading: false });

  const outputModal = ref({ open: false, mode: 'default', custom: '' });

  const patternsModal = ref({ open: false, rows: [] as string[] });

  const envRows = computed(() => {
    const data = meta.meta;
    if (!data) return [];
    return [
      ['运行时', `electron ${data.electron} / node ${data.node}`],
      ['输出根目录', relPath(data.dirs.output)],
      ['清单目录', relPath(data.dirs.manifest)],
      ['补丁缓存', relPath(data.dirs.metadata)],
      ['合成清单', relPath(data.dirs.generatedMani)],
      ['差异产物', relPath(data.dirs.generatedDiff)],
      ['资源目录', relPath(data.dirs.resource)],
      ['已抓区域', data.fetched.join(', ') || '(none)']
    ];
  });

  const wantedTag = computed(() => {
    const info = fetcherInfo.value || {};
    const channel = form.value.fetcherChannel || 'stable';
    if (info.channels && channel in info.channels) return info.channels[channel] || '';
    return (channel === 'stable' ? info.latestStable : info.latestPrerelease) || '';
  });

  const channelRowLabel = (channel: string): string =>
    channel === 'stable' ? '正式版最新' : `${CHANNEL_SHORT[channel] || channel} 最新`;

  const fetcherRows = computed(() => {
    const info = fetcherInfo.value || {};
    const channel = form.value.fetcherChannel || 'stable';
    const tag = wantedTag.value;

    const rows: any[] = [];
    if (info.local) {
      const localChannel = info.localChannel || channelOf(info.local);
      rows.push({
        key: '本地版本',
        value: info.local,
        short: CHANNEL_SHORT[localChannel] || 'Stable',
        channel: localChannel
      });
    }
    rows.push({
      key: channelRowLabel(channel),
      value: tag || '该通道暂无版本',
      short: tag ? CHANNEL_SHORT[channel] || 'Stable' : '',
      channel,
      muted: !tag
    });

    const stableTag = (info.channels && info.channels.stable) || info.latestStable;
    if (channel !== 'stable' && stableTag) {
      rows.push({ key: '正式版最新', value: stableTag, short: 'Stable', channel: 'stable' });
    }
    return rows;
  });

  const fetcherPlaceholder = '留空 = 自动探测';

  const fetcherPathTitle = computed(() => {
    const found = relPath(meta.meta?.fetcher) || '';
    if (!found || found === '(missing)') return '留空时在应用目录的 ResourceTool 下自动探测';
    return `留空时自动探测到：${found}`;
  });

  const canUpdate = computed(() => {
    const info = fetcherInfo.value || {};
    const channel = form.value.fetcherChannel || 'stable';
    if (info.channelAvailable && channel in info.channelAvailable) return Boolean(info.channelAvailable[channel]);
    return channel === 'stable' ? Boolean(info.updateAvailable) : Boolean(info.prereleaseAvailable);
  });

  const checkFailed = computed(() => Boolean(fetcherInfo.value && fetcherInfo.value.error));
  const checking = ref(false);

  const channelEmpty = computed(() => {
    if (!fetcherInfo.value || checkFailed.value) return false;
    return !wantedTag.value;
  });

  const updateLabel = computed(() => {
    if (checkFailed.value) return '重试检查';
    if (channelEmpty.value) return '该通道暂无版本';
    return canUpdate.value && wantedTag.value ? `更新到 ${wantedTag.value}` : '已是最新';
  });

  const updateDisabled = computed(() => {
    if (fetcherJob.value.busy || checking.value) return true;
    if (checkFailed.value) return false;
    if (!fetcherInfo.value || !fetcherInfo.value.local) return false;
    return !canUpdate.value;
  });

  const fetcherTips = [
    '路径留空就在 ResourceTool 下自动探测，也可以点「选择…」指定',
    '更新通道决定检查哪条发布线：Stable 最稳，Alpha / Beta / RC 属预发布',
    '下载镜像只影响安装包，一条不通会自动换下一条'
  ];

  const fetcherHint = computed(() => {
    const info = fetcherInfo.value || {};
    if (info.error && info.stale) return `网络不通，版本号来自上次查询的缓存：${info.error}`;
    if (info.error) return `检查失败：${info.error}`;
    if (!info.local && info.latest) return '本地没找到 ResourceFetcher.exe，点「选择…」指定一个，或留空等待自动探测';
    return '';
  });

  async function pickFetcher(): Promise<void> {
    const dirs: any = (meta.meta && meta.meta.dirs) || {};
    const res: any = await guard(() =>
      window.api.selectFile({
        title: '选择 ResourceFetcher 可执行文件',
        defaultPath: dirs.appDir || meta.meta?.cwd || '',
        filters: [{ name: 'ResourceFetcher', extensions: ['exe'] }]
      })
    );
    if (!res || !res.path) return;
    form.value.fetcher = relPath(res.path);
  }

  function fillForm(): void {
    const cfg = state.settings || {};
    form.value = {
      ...form.value,
      platform: cfg.platform || 'win',
      fetcher: cfg.fetcher || '',
      fetcherChannel: cfg.fetcherChannel || 'stable',
      fetcherMirror: cfg.fetcherMirror || 'official',
      outputRoot: cfg.outputRoot || '',
      timeout: cfg.timeout ?? 900,
      retries: cfg.retries ?? 3,
      autoRetry: cfg.autoRetry ?? 1,
      logLevel: cfg.logLevel || 'info',
      resPatterns: cfg.resPatterns ?? '',
      resPatternList: splitPatterns(cfg.resPatterns ?? ''),
      useResourceRegex: Boolean(cfg.useResourceRegex),
      filterOutdated: Boolean(cfg.filterOutdated),
      mergePatch: Boolean(cfg.mergePatch),
      overwrite: Boolean(cfg.overwrite),
      autoDownloadFetcher: Boolean(cfg.autoDownloadFetcher),
      background: cfg.background !== false
    };
  }

  function buildConfig(): Record<string, any> {
    const cfg = state.settings || {};
    return {
      ...cfg,
      regions: [...(state.picked || [])],
      platform: form.value.platform,
      fetcher: String(form.value.fetcher ?? '').trim(),
      fetcherChannel: form.value.fetcherChannel || 'stable',
      fetcherMirror: form.value.fetcherMirror || 'official',
      outputRoot: String(form.value.outputRoot ?? '').trim(),
      timeout: Number(form.value.timeout) || cfg.timeout || 900,
      retries: Number(form.value.retries) || 0,
      autoRetry: Number(form.value.autoRetry) || 0,
      logLevel: form.value.logLevel || 'info',
      resPatterns: joinPatterns(form.value.resPatternList),
      useResourceRegex: form.value.useResourceRegex,
      filterOutdated: form.value.filterOutdated,
      mergePatch: form.value.mergePatch,
      overwrite: form.value.overwrite,
      autoDownloadFetcher: form.value.autoDownloadFetcher,
      background: form.value.background,
      uncensor: { ...(cfg.uncensor || {}) }
    };
  }

  async function checkFetcherUpdate({ silent = false }: { silent?: boolean } = {}): Promise<any> {
    if (checking.value) return fetcherInfo.value;
    checking.value = true;
    let info: any = null;
    try {
      info = await guard(() => window.api.fetcherVersion());
    } finally {
      checking.value = false;
    }
    if (!info) return null;
    fetcherInfo.value = info;
    state.fetcher = info;

    const skipped = state.settings && state.settings.skippedFetcher;
    if (info.updateAvailable && !silent && info.latest !== skipped) {
      toast({
        key: 'fetcher',
        kind: 'warn',
        title: '抓取器可更新',
        text: `${info.local} → ${info.latest}`,
        timeout: 5000
      });
    }
    return info;
  }

  async function persistConfig(patch: Record<string, any>): Promise<boolean> {
    const next = JSON.parse(JSON.stringify({ ...(state.settings || {}), ...patch }));
    const result: any = await guard(() => window.api.saveSettings(next));
    if (!result || result.ok === false) {
      toast({
        key: 'fetcher',
        kind: 'err',
        title: '保存失败',
        text: (result && result.error) || '写入 config.json 失败',
        timeout: 6000
      });
      return false;
    }
    state.settings = { ...(result.config || next) };
    meta.applyMeta(result.meta);
    return true;
  }

  async function setChannel(channel: string): Promise<void> {
    form.value.fetcherChannel = channel;
    await persistConfig({ fetcherChannel: channel });
    await checkFetcherUpdate({ silent: true });
  }

  async function setMirror(mirror: string): Promise<void> {
    form.value.fetcherMirror = mirror;
    const ok = await persistConfig({ fetcherMirror: mirror });
    if (!ok) return;
    const item = ((meta.meta as any)?.fetcherMirrors || []).find((row: any) => row.value === mirror);
    toast({
      key: 'fetcher-mirror',
      kind: 'ok',
      title: '下载镜像已保存',
      text: item ? item.label : mirror,
      timeout: 3000
    });
  }

  async function openConfig(): Promise<void> {
    configModal.value.open = true;
    configModal.value.error = '';
    await loadConfigText();
  }

  function closeConfig(): void {
    configModal.value.open = false;
  }

  async function loadConfigText(): Promise<void> {
    if (configModal.value.reloading) return;
    configModal.value.reloading = true;
    const res: any = await guard(() => window.api.configText());

    await new Promise((resolve) => setTimeout(resolve, 240));
    configModal.value.reloading = false;
    if (!res) return;
    configModal.value.file = res.file || '';
    if (!res.ok) {
      configModal.value.error = res.error || '读取配置失败';
      toast({ key: 'config-reload', kind: 'err', title: '重新载入失败', text: res.error || '读取配置失败' });
      return;
    }
    let text = String(res.text || '');
    try {
      text = JSON.stringify(JSON.parse(text || '{}'), null, 2);
    } catch {}
    configModal.value.text = text;
    configModal.value.error = '';
    toast({
      key: 'config-reload',
      kind: 'ok',
      title: '已重新载入',
      text: `${relPath(configModal.value.file) || configModal.value.file}（${text.split('\n').length} 行）`
    });
  }

  async function saveConfig(): Promise<void> {
    configModal.value.busy = true;
    const res: any = await guard(() => window.api.configWrite({ text: configModal.value.text }));
    configModal.value.busy = false;
    if (!res) return;

    if (!res.ok) {
      configModal.value.error = res.error || '保存失败';
      toast({ key: 'config-file', kind: 'err', title: '配置未保存', text: res.error || '未知错误', timeout: 6000 });
      return;
    }
    meta.applyMeta(res.meta);
    if (res.config) {
      state.settings = { ...res.config };
      state.picked = new Set((res.config as any).regions || []);
      fillForm();
      toastConfig();
    }
    say('SUCC', `配置文件已保存: ${relPath(res.file)}`);
    toast({
      key: 'config-file',
      kind: 'ok',
      title: '配置文件已保存',
      text: relPath(res.file) || res.file,
      timeout: 4000
    });
    await loadConfigText();
  }

  async function openConfigFile(): Promise<void> {
    const file = configModal.value.file || (meta.meta && meta.meta.settingsFile) || '';
    if (!file) return;
    await guard(() => window.api.openDir(file));
    say('TIPS', `已打开配置文件位置: ${relPath(file)}`);
  }

  const patternsPreview = computed(() => joinPatterns(form.value.resPatternList));

  function addPattern(value: string = ''): void {
    form.value.resPatternList = [...(form.value.resPatternList || []), String(value)];
  }

  function removePattern(index: number): void {
    form.value.resPatternList = (form.value.resPatternList || []).filter((_: string, i: number) => i !== index);
  }

  const defaultOutputDir = computed(() => {
    const dirs = (meta.meta && (meta.meta as any).dirs) || {};
    return toSlash(String(dirs.output || ''));
  });

  const outputDirLabel = computed(() => {
    const raw = String(form.value.outputRoot || '').trim();
    if (!raw) return relPath(defaultOutputDir.value) || 'output';
    return relPath(raw) || raw;
  });

  const outputModalPath = computed(() => {
    const item = outputModal.value;
    if (item.mode === 'custom') return toSlash(item.custom) || '';
    return defaultOutputDir.value;
  });

  function openOutputModal(): void {
    const raw = String(form.value.outputRoot || '').trim();
    outputModal.value = { open: true, mode: raw ? 'custom' : 'default', custom: raw ? toSlash(raw) : '' };
  }

  function closeOutputModal(): void {
    outputModal.value.open = false;
  }

  async function pickOutputDir(): Promise<void> {
    const res: any = await guard(() =>
      window.api.selectDirectory({
        title: '选择输出目录',
        defaultPath: defaultOutputDir.value
      })
    );
    if (!res || !res.path) return;
    outputModal.value.custom = toSlash(res.path);
    outputModal.value.mode = 'custom';
  }

  function applyOutputModal(): void {
    const item = outputModal.value;
    form.value.outputRoot = item.mode === 'custom' ? String(item.custom || '').trim() : '';
    item.open = false;
  }

  async function saveOutputModal(): Promise<void> {
    applyOutputModal();
    await save();
  }

  const patternsModalPreview = computed(() => joinPatterns(patternsModal.value.rows));

  function openPatternsModal(): void {
    patternsModal.value = { open: true, rows: [...(form.value.resPatternList || [])] };
  }

  function closePatternsModal(): void {
    patternsModal.value.open = false;
  }

  function addModalPattern(value: string = ''): void {
    patternsModal.value.rows = [...patternsModal.value.rows, String(value)];
  }

  function removeModalPattern(index: number): void {
    patternsModal.value.rows = patternsModal.value.rows.filter((_: string, i: number) => i !== index);
  }

  function applyPatternsModal(): void {
    form.value.resPatternList = patternsModal.value.rows
      .map((item) => String(item == null ? '' : item).trim())
      .filter(Boolean);
    patternsModal.value.open = false;
  }

  async function savePatternsModal(): Promise<void> {
    applyPatternsModal();
    await save();
  }

  async function save(): Promise<void> {
    let payload: any;
    try {
      payload = JSON.parse(JSON.stringify(buildConfig()));
    } catch (err: any) {
      toast({
        key: 'settings',
        kind: 'err',
        title: '保存失败',
        text: `表单取值失败：${cleanError(err && err.message)}`,
        timeout: 8000
      });
      say('ERRO', `保存配置失败(表单): ${cleanError(err && err.message)}`);
      return;
    }

    let result: any;
    try {
      if (typeof window.api.saveSettings !== 'function') throw new Error('主进程接口缺失（saveSettings），请重启应用');
      result = await window.api.saveSettings(payload);
    } catch (err: any) {
      const msg = cleanError(err && err.message) || '主进程未响应';
      say('ERRO', `保存配置失败: ${msg}`);
      toast({ key: 'settings', kind: 'err', title: '保存失败', text: msg, timeout: 9000 });
      return;
    }

    if (!result) {
      toast({ key: 'settings', kind: 'err', title: '保存失败', text: '主进程没有返回结果', timeout: 8000 });
      return;
    }
    if (result.ok === false) {
      toast({ key: 'settings', kind: 'err', title: '保存失败', text: result.error || '未知错误', timeout: 9000 });
      return;
    }

    const savedFile = (result.meta && result.meta.settingsFile) || (meta.meta && meta.meta.settingsFile) || '';
    meta.applyMeta(result.meta);
    state.settings = { ...result.config };
    state.picked = new Set(result.config.regions || []);
    say('SUCC', `配置已保存并生效: ${savedFile || '(未知路径)'}`);
    fillForm();
    toastConfig();
    toast({
      key: 'settings',
      kind: 'ok',
      title: '已保存并生效',
      text: savedFile ? `已写入 ${toSlash(savedFile)}` : '抓取参数已更新，后续抓取使用新配置',
      timeout: 6000
    });
  }

  async function saveWithConfirm(): Promise<void> {
    const file = (meta.meta && (meta.meta as any).settingsFile) || '';
    const where = relPath(file) || 'config.json';
    const ok = await askConfirm(
      '保存配置',
      `将把当前抓取配置写入 ${where} 并立即生效，确定保存吗？`,
      '确认保存',
      'primary'
    );
    if (!ok) return;
    await save();
  }

  async function reset(): Promise<void> {
    const result = await guard(() => window.api.resetSettings());
    if (!result) return;
    meta.applyMeta(result.meta);
    state.settings = { ...result.config };
    state.picked = new Set(result.config.regions || []);
    fillForm();
    toastConfig();
    say('TIPS', '配置已恢复默认');
    toast({ key: 'settings', kind: 'ok', title: '已恢复默认配置', text: '抓取参数已重置为默认值', timeout: 3500 });
  }

  async function openVersion(): Promise<void> {
    const view = versionModal.value;
    view.open = true;
    view.local = '查询中…';
    view.latest = '查询中…';
    view.note = '正在查询 GitHub Releases…';
    view.error = '';

    const info = await checkFetcherUpdate({ silent: true });
    if (!info) {
      view.note = '查询失败';
      view.error = '无法连接 GitHub，稍后再试或点「打开发布页」手动下载';
      return;
    }

    const skipped = state.settings && state.settings.skippedFetcher;
    const channel = form.value.fetcherChannel || 'stable';
    const label = CHANNEL_LABEL[channel] || channel;
    const tag = wantedTag.value;

    view.local = info.local || '未安装';
    view.localChannel = info.localChannel || (info.local ? channelOf(info.local) : '');

    view.latest = tag || '该通道暂无版本';
    view.latestChannel = tag ? channel : '';

    if (info.error && info.stale) {
      view.note = `网络不通，下面是上次查询到的版本：${info.error}`;
    } else if (info.error) {
      view.note = `查询失败：${info.error}`;
    } else if (!tag) {
      view.note = `${label}通道还没有发布版本，请切换到其它通道再试。`;
    } else if (canUpdate.value) {
      view.note =
        skipped === tag
          ? '有新版本（已跳过提醒），随时可以更新'
          : '有新版本，更新前会自动备份当前版本，中途失败自动回滚';
    } else {
      view.note = `${label}通道已是最新；仍可点「重装最新版」重新下载一份。`;
    }
  }

  function clearJobSoon(delay: number): void {
    setTimeout(() => {
      if (!fetcherJob.value.busy) fetcherJob.value = emptyJob();
    }, delay);
  }

  async function runFetcherJob(kind: string, title: string, payload: any): Promise<any> {
    if (fetcherJob.value.busy) return null;
    fetcherJob.value = { busy: true, kind, title, pct: 0, text: '准备中…', error: '' };

    const result: any = await guard(() => window.api.installFetcher(payload));

    if (!result) {
      fetcherJob.value = { ...fetcherJob.value, busy: false, error: '调用失败，详情见运行日志' };
      toast({
        key: 'fetcher',
        kind: 'err',
        title: '抓取器任务失败',
        text: '没有拿到主进程结果，详情见运行日志',
        timeout: 7000
      });
      clearJobSoon(8000);
      return null;
    }
    if (!result.ok) {
      if (result.cancelled) {
        fetcherJob.value = emptyJob();
        toast({ key: 'fetcher', kind: 'info', title: '已中断下载', text: '没有改动本地抓取器', timeout: 3500 });
        return result;
      }
      fetcherJob.value = { ...fetcherJob.value, busy: false, error: result.error || '未知错误' };
      toast({
        key: 'fetcher',
        kind: 'err',
        title: kind === 'rollback' ? '回退失败' : '更新失败',
        text: result.error || '未知错误',
        timeout: 7000
      });
      await checkFetcherUpdate({ silent: true });
      clearJobSoon(8000);
      return result;
    }

    fetcherJob.value = { ...fetcherJob.value, busy: false, pct: 100, text: '完成' };
    meta.applyMeta(result.meta);
    const label = result.channelLabel ? `（${result.channelLabel}）` : '';
    toast({
      key: 'fetcher',
      kind: 'ok',
      title: kind === 'rollback' ? '抓取器已回退' : '抓取器已更新',
      text: `${result.version}${label} 已就绪`,
      timeout: 4000
    });
    if (kind === 'rollback') say('SUCC', `抓取器已回退到 ${result.version}(${result.channelLabel || ''})`);
    await checkFetcherUpdate({ silent: true });
    fillForm();
    clearJobSoon(1500);
    return result;
  }

  async function cancelFetcherJob(): Promise<void> {
    if (!fetcherJob.value.busy) return;
    fetcherJob.value = { ...fetcherJob.value, text: '正在中断…' };
    await guard(() => window.api.cancelFetcher());
  }

  async function reinstall(): Promise<void> {
    const info = fetcherInfo.value || {};
    const channel = form.value.fetcherChannel || 'stable';
    if (channelEmpty.value) {
      toast({ key: 'fetcher', kind: 'info', title: '该通道暂无版本', text: '请切换到其它通道再下载', timeout: 4000 });
      return;
    }
    await runFetcherJob('reinstall', `重装 ${wantedTag.value || info.local || '最新版'}`, { update: true, channel });
  }

  async function skipVersion(): Promise<void> {
    if (channelEmpty.value) {
      toast({ key: 'fetcher', kind: 'info', title: '该通道暂无版本', text: '请切换到其它通道再跳过', timeout: 4000 });
      return;
    }
    const latest = wantedTag.value || (fetcherInfo.value && fetcherInfo.value.latest);
    if (!latest) {
      versionModal.value.open = false;
      return;
    }
    state.settings = { ...(state.settings || {}), skippedFetcher: latest };

    const payload = JSON.parse(JSON.stringify(state.settings));
    const result = await guard(() => window.api.saveSettings(payload));
    if (result) state.settings = { ...result.config };
    versionModal.value.open = false;
    toast({
      key: 'fetcher',
      kind: 'info',
      title: '已跳过',
      text: `不再提醒 ${latest}，出现更新的还会提示`,
      timeout: 4000
    });
  }

  async function updateFetcher(): Promise<void> {
    const channel = form.value.fetcherChannel || 'stable';

    if (checkFailed.value || !fetcherInfo.value) {
      const fresh = await checkFetcherUpdate({ silent: true });
      if (!fresh || fresh.error) {
        toast({
          key: 'fetcher',
          kind: 'err',
          title: '检查更新失败',
          text: (fresh && fresh.error) || '连不上 GitHub，换个下载镜像或稍后再试',
          timeout: 7000
        });
        return;
      }
    }

    const info = fetcherInfo.value || {};
    if (channelEmpty.value) {
      toast({ key: 'fetcher', kind: 'info', title: '该通道暂无版本', text: '请切换到其它通道再更新', timeout: 4000 });
      return;
    }
    if (!canUpdate.value) {
      toast({
        key: 'fetcher',
        kind: 'info',
        title: '当前已是最新',
        text: `${CHANNEL_LABEL[channel] || channel} 通道没有可更新的版本`,
        timeout: 4000
      });
      return;
    }
    await runFetcherJob('update', `更新到 ${wantedTag.value || '最新版'}`, { update: true, channel });
  }

  async function openRollback(): Promise<void> {
    const view = rollback.value;
    view.open = true;
    view.versions = [];
    view.tag = '';
    view.error = '';
    view.note = '';

    const list = await guard(() => window.api.fetcherReleases());
    if (!list || !list.ok || !list.releases || list.releases.length === 0) {
      view.error = (list && list.error) || '获取版本列表失败，稍后再试';
      return;
    }

    const order: Record<string, number> = { stable: 0, rc: 1, beta: 2, alpha: 3 };
    const releases = [...list.releases].sort((a: any, b: any) => {
      const ra = order[a.channel] ?? 4;
      const rb = order[b.channel] ?? 4;
      if (ra !== rb) return ra - rb;
      return String(b.date).localeCompare(String(a.date));
    });

    const current = fetcherInfo.value && fetcherInfo.value.local;
    view.note = list.cached ? '网络不通，这里是上次查到的版本列表，可能不是最新' : '';
    view.versions = releases.map((item: any) => ({
      tag: item.tag,
      channel: item.channel || 'stable',
      label: `[${CHANNEL_SHORT[item.channel] || item.channelShort || 'Stable'}] ${item.tag}（${item.date || '未知日期'}）${item.tag === current ? ' · 当前' : ''}`
    }));

    const wanted = form.value.fetcherChannel || 'stable';
    const same = view.versions.find((item: any) => item.channel === wanted);
    if (same) view.tag = same.tag;
  }

  async function doRollback(): Promise<void> {
    const view = rollback.value;
    if (!view.tag) return;
    view.error = '';
    const result = await runFetcherJob('rollback', `回退到 ${view.tag}`, { tag: view.tag, update: true });
    if (result && result.ok) view.open = false;
    else if (fetcherJob.value.error) view.error = fetcherJob.value.error;
  }

  async function loadDiag(): Promise<void> {
    const result = await guard(() => window.api.diag());
    if (result) diagTail.value = `启动日志：${result.log}\n\n${result.tail}`;
  }

  async function openLog(): Promise<void> {
    const result: any = await window.api.diag();
    await window.api.openDir(result.log);
  }

  async function uninstall(): Promise<void> {
    const portable = Boolean(state.meta && (state.meta as any).portable);
    const yes = await askConfirm(
      '卸载星塔反和谐工具',
      portable
        ? '免安装版将关闭应用并删除整个应用目录（含配置、日志与已下载的资源），操作不可恢复。继续吗？'
        : '会先关闭应用再删除安装目录；配置与已下载资源在卸载向导里还会再问一次。继续吗？',
      '继续卸载'
    );
    if (!yes) return;
    const result = await window.api.uninstallApp();
    if (!result || !result.ok) {
      showError('无法卸载', (result && result.error) || '没有找到卸载程序，可到「设置 → 应用」里卸载');
    }
  }

  async function refreshBackground(): Promise<void> {
    const fresh = await guard(() => useBackgroundStore().refresh());
    if (!fresh) return;
    if (fresh.ok) toast({ key: 'background', kind: 'ok', title: '背景图已更新', text: fresh.crc64, timeout: 3000 });
    else
      toast({
        key: 'background',
        kind: 'err',
        title: '背景图更新失败',
        text: fresh.error || '未知错误',
        timeout: 5000
      });
  }

  function setBackground(on: boolean): void {
    form.value.background = on;
    state.settings = { ...(state.settings || {}), background: on };
    void useBackgroundStore().sync();
  }

  const bgModal = ref({
    open: false,
    tab: 'current' as 'current' | 'history',
    loading: false,
    url: '',
    crc64: '',
    image: '',
    error: ''
  });
  const bgHistory = ref<Array<{ hash: string; base64: string }>>([]);
  const bgHistoryLoading = ref(false);
  const bgSaving = ref(false);

  async function openBgModal(tab: 'current' | 'history'): Promise<void> {
    bgModal.value.open = true;
    bgModal.value.tab = tab;
    if (tab === 'current') await loadBg();
    else await loadBgHistory();
  }

  function closeBgModal(): void {
    bgModal.value.open = false;
  }

  async function loadBg(): Promise<void> {
    if (bgModal.value.loading) return;
    bgModal.value.loading = true;
    bgModal.value.error = '';
    try {
      const config = await guard(() => useBackgroundStore().current());
      if (!config || !config.ok) {
        bgModal.value.error = (config && config.error) || '获取背景配置失败';
        return;
      }
      bgModal.value.url = config.url;
      bgModal.value.crc64 = config.crc64 || '';
      const cached = await guard(() => window.api.backgroundImage({ url: config.url }));
      if (cached && cached.ok && cached.base64) {
        bgModal.value.image = cached.base64;
        bgModal.value.crc64 = config.crc64 || '';
      } else {
        bgModal.value.error = (cached && cached.error) || '背景图下载失败';
      }
    } finally {
      bgModal.value.loading = false;
    }
  }

  async function loadBgHistory(): Promise<void> {
    if (bgHistoryLoading.value) return;
    bgHistoryLoading.value = true;
    try {
      bgHistory.value = await useBackgroundStore().history();
    } finally {
      bgHistoryLoading.value = false;
    }
  }

  async function useBgHash(hash: string): Promise<void> {
    const res = await guard(() => useBackgroundStore().useHash(hash));
    if (res && res.ok) toast({ key: 'bg-hash', kind: 'ok', title: '已切换背景', text: hash, timeout: 2500 });
    else if (res) toast({ key: 'bg-hash', kind: 'err', title: '切换失败', text: res.error || '未知错误' });
  }

  async function copyBgUrl(): Promise<void> {
    const url = bgModal.value.url;
    if (!url) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) toast({ key: 'bg-copy', kind: 'ok', title: '已复制 URL', text: url });
    else toast({ key: 'bg-copy', kind: 'err', title: '复制失败', text: '请从弹窗里手动选中地址复制' });
  }

  async function saveBg(): Promise<void> {
    const url = bgModal.value.url;
    if (!url) {
      toast({ key: 'bg-save', kind: 'warn', title: '无法下载', text: '还没有拿到背景图地址' });
      return;
    }
    const picked: any = await guard(() => window.api.selectDirectory({ title: '选择背景图保存位置' }));
    if (!picked || !picked.path) return;
    bgSaving.value = true;
    const res: any = await guard(() => window.api.backgroundSave({ url, dir: picked.path }));
    bgSaving.value = false;
    if (res && res.ok) {
      toast({ key: 'bg-save', kind: 'ok', title: '背景图已保存', text: relPath(res.file) || res.file });
      say('SUCC', `背景图已保存: ${toSlash(res.file)}(${(res.bytes / 1048576).toFixed(1)}MB)`);
    } else if (res) {
      toast({ key: 'bg-save', kind: 'err', title: '保存失败', text: res.error || '未知错误' });
    }
  }

  return {
    form,
    fetcherInfo,
    versionModal,
    rollback,
    diagTail,
    configModal,
    patternsPreview,
    outputModal,
    outputModalPath,
    outputDirLabel,
    defaultOutputDir,
    patternsModal,
    patternsModalPreview,
    envRows,
    fetcherRows,
    canUpdate,
    updateLabel,
    updateDisabled,
    checkFailed,
    checking,
    channelEmpty,
    fetcherHint,
    fetcherTips,
    fetcherPlaceholder,
    channelOptions: CHANNEL_OPTIONS,
    pickFetcher,
    fetcherJob,
    fetcherPathTitle,
    setMirror,
    cancelFetcherJob,
    setBackground,
    bgModal,
    bgHistory,
    bgHistoryLoading,
    bgSaving,
    openBgModal,
    closeBgModal,
    loadBg,
    loadBgHistory,
    useBgHash,
    saveBg,
    copyBgUrl,
    fillForm,
    buildConfig,
    save,
    saveWithConfirm,
    reset,
    checkFetcherUpdate,
    setChannel,
    addPattern,
    removePattern,
    openOutputModal,
    closeOutputModal,
    pickOutputDir,
    applyOutputModal,
    saveOutputModal,
    openPatternsModal,
    closePatternsModal,
    addModalPattern,
    removeModalPattern,
    applyPatternsModal,
    savePatternsModal,
    openConfig,
    closeConfig,
    loadConfigText,
    saveConfig,
    openConfigFile,
    openVersion,
    reinstall,
    skipVersion,
    updateFetcher,
    openRollback,
    doRollback,
    loadDiag,
    openLog,
    uninstall,
    refreshBackground
  };
});
