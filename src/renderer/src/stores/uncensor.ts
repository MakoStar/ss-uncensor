import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { state } from '../app/state';
import { outputDirSetting } from '../app/state';
import { basename, relPath, say as sayRaw } from '../utils/format';
import { toast } from '../utils/toast';
import { useMetaStore } from './meta';
import { useResourcesStore } from './resources';
import { useFetchStore } from './fetch';
import { playComplete } from './sound';
import { fmtBytes } from '@shared/utils';

/** 带模块标记输出运行日志 */
const say = (tag: string, message: string) => sayRaw(tag, message, 'uncensor');

/** 深拷贝对象避免引用共享 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export interface DiffList {
  name: string;
  region?: string;
  platform?: string;
  count: number;
  file: string;
}

export const useUncensorStore = defineStore('uncensor', () => {
  const meta = useMetaStore();

  const lists = ref<DiffList[]>([]);
  const listIndex = ref(0);

  const listPlatform = ref('');
  const timeout = ref(900);
  const retries = ref(3);
  const dir = ref('');
  const running = ref(false);

  const runningMode = ref('');

  const custom = ref({
    open: false,
    region: 'JP',
    platform: 'win',
    base: 'CN',
    target: 'JP',
    files: [] as string[],
    query: '',
    saved: false,
    error: ''
  });

  const done = ref<any>(null);
  const zipping = ref(false);

  const plan = ref({
    open: false,
    loading: false,
    error: '',
    mode: '' as string,
    label: '',
    payload: null as any,
    info: null as any
  });

  const sync = ref({
    open: false,
    phase: 'scan' as string,
    error: '',
    done: 0,
    total: 0,
    label: '',
    outputDir: '',
    source: '',
    missing: [] as string[],
    matched: [] as string[],
    extra: [] as Array<{ name: string; path: string; rel: string }>,
    removed: 0
  });

  let syncSeq = 0;

  window.api.onSyncProgress((data: any) => {
    if (!sync.value.open) return;
    sync.value.done = Number(data.done) || 0;
    sync.value.total = Number(data.total) || 0;
    sync.value.label = String(data.label || '');
    if (data.phase === 'clean' && sync.value.phase !== 'cleaned') sync.value.phase = 'clean';
  });

  /** 从名单信息里识别所属平台 */
  function listPlatformOf(item: DiffList): string {
    const direct = String(item.platform || '').trim();
    if (direct) return direct;
    const hit = String(item.name || '').match(/_([A-Za-z0-9]+)_diff_files\.json$/i);
    return hit ? hit[1] : '';
  }

  const listPlatforms = computed(() => {
    const fromMeta = (meta.platforms || []).map((p) => String(p).trim()).filter(Boolean);
    const fromLists = lists.value.map(listPlatformOf).filter(Boolean);
    const seen = new Set<string>();
    return [...fromMeta, ...fromLists].filter((p) => {
      const key = p.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  const platformOptions = computed(() => [
    { value: '', label: `全部平台 (${lists.value.length})` },
    ...listPlatforms.value.map((p) => ({
      value: p,
      label: `${p} (${lists.value.filter((i) => listPlatformOf(i).toLowerCase() === p.toLowerCase()).length})`
    }))
  ]);

  const visibleLists = computed(() => {
    if (!listPlatform.value) return lists.value;
    const wanted = listPlatform.value.toLowerCase();
    return lists.value.filter((item) => listPlatformOf(item).toLowerCase() === wanted);
  });

  const listOptions = computed(() =>
    visibleLists.value.map((item) => ({
      label: `${item.name}｜${item.region || '?'} · ${item.count} 项`,
      value: item.name
    }))
  );

  const currentList = computed(() => visibleLists.value[listIndex.value] || null);

  const effectivePlatform = computed(() => listPlatform.value || meta.platform);

  /** 按平台过滤名单并修正选中项 */
  function setListPlatform(value: string) {
    if (listPlatform.value === value) return;
    const selected = currentList.value?.name || '';
    listPlatform.value = value;
    const hit = visibleLists.value.findIndex((item) => item.name === selected);
    listIndex.value = hit >= 0 ? hit : 0;
  }

  const customRows = computed(() => {
    const query = custom.value.query.trim().toLowerCase();
    return custom.value.files
      .map((file, index) => ({ file, index }))
      .filter((row) => !query || row.file.toLowerCase().includes(query));
  });

  /** 按当前平台拉取差异名单 */
  async function loadLists() {
    syncDir();
    const result = await guard(() => window.api.diffLists({ platform: effectivePlatform.value }));
    if (!result) return;
    const selected = currentList.value?.name || '';
    lists.value = result.lists;
    const hit = visibleLists.value.findIndex((item) => item.name === selected);
    listIndex.value = hit >= 0 ? hit : 0;
  }

  /** 把设置里的输出目录同步到本地 */
  function syncDir() {
    const saved = outputDirSetting();
    if (saved !== dir.value) dir.value = saved;
  }

  /** 按设置重置自定义下载模板 */
  function customTemplate() {
    const saved = String(((state.settings || {}).uncensor || {}).region || '')
      .trim()
      .toUpperCase();
    const allowed = (meta.regions || []).map((item: string) => String(item).toUpperCase());
    const region = allowed.includes(saved) ? saved : 'JP';
    custom.value.region = region;
    custom.value.platform = effectivePlatform.value;
    custom.value.base = 'CN';
    custom.value.target = region;
    custom.value.files = [];
  }

  /** 打开自定义下载弹窗 */
  function openCustom() {
    if (!custom.value.files.length && !custom.value.saved) customTemplate();
    custom.value.query = '';
    custom.value.error = '';
    custom.value.open = true;
  }

  /** 把选中名单载入自定义弹窗 */
  async function loadCustomFromSelection() {
    const item = currentList.value;
    if (!item) {
      toast({
        key: 'custom',
        kind: 'warn',
        title: '没有可载入的名单',
        text: '先在「区域差异」里生成结果',
        timeout: 3000
      });
      return;
    }

    let files: string[] = [];
    if (item.count > 0) {
      const result = await guard(() => window.api.readJson({ file: item.file }));
      if (result && result.text) {
        try {
          const data = JSON.parse(result.text);
          files = Array.isArray(data.files) ? data.files : [];
          custom.value.region = data.region || item.region || custom.value.region;
          custom.value.platform = data.platform || item.platform || custom.value.platform;
        } catch (err) {
          files = [];
        }
      }
    }

    const pair = item.name.match(/^([A-Za-z0-9]+)2([A-Za-z0-9]+)_gen_/i);
    if (pair) {
      custom.value.base = pair[1].toUpperCase();
      custom.value.target = pair[2].toUpperCase();
    }

    custom.value.files = files;
    custom.value.region = item.region || custom.value.region;
    custom.value.platform = item.platform || custom.value.platform;
  }

  /** 在自定义列表新增空行 */
  function addCustomFile() {
    custom.value.files.push('');
  }

  /** 删除自定义列表指定行 */
  function removeCustomFile(index: number) {
    custom.value.files.splice(index, 1);
  }

  /** 清空自定义文件列表 */
  function clearCustomFiles() {
    custom.value.files = [];
  }

  /** 保存自定义名单到磁盘 */
  async function saveCustom() {
    const payload = {
      region: custom.value.region,
      platform: custom.value.platform,
      files: custom.value.files.map((item) => String(item).trim()).filter(Boolean)
    };
    const result = await guard(() => window.api.writeCustomList(payload));
    if (!result || !result.ok) {
      custom.value.error = (result && result.error) || '保存失败';
      return;
    }

    custom.value.region = payload.region;
    custom.value.platform = payload.platform;
    custom.value.saved = true;
    custom.value.open = false;
    toast({
      key: 'custom',
      kind: 'ok',
      title: '模板已保存',
      text: `${result.count} 项 → ${basename(result.file)}`,
      timeout: 3200
    });
  }

  /** 按参数启动资源下载任务 */
  async function runDownload(payload: any, label: string, mode: string) {
    if (running.value) return;
    running.value = true;
    runningMode.value = mode;
    say('TIPS', `${label} 开始`);

    const current = {
      dir: dir.value.trim(),
      timeout: Number(timeout.value) || 900,
      retries: Number(retries.value) || 3
    };

    const settings = plain(state.settings || {});
    await guard(() =>
      window.api.saveSettings(
        plain({
          ...settings,
          uncensor: { ...(settings.uncensor || {}), ...current }
        })
      )
    );

    const options = plain({
      platform: effectivePlatform.value,
      ...payload,
      uncensor: { ...(payload.uncensor || {}), ...current }
    });
    const result = await guard(() => window.api.uncensor(options));

    state.settings = {
      ...(state.settings || {}),
      uncensor: { ...((state.settings && state.settings.uncensor) || {}), ...current }
    };
    running.value = false;
    runningMode.value = '';

    if (result && result.needFetcher) {
      say('WARN', '未找到 ResourceFetcher, 请先下载或更新');
      await meta.load(meta.platform);
      const fetchStore = useFetchStore();
      fetchStore.applyFetcherState(state.meta, { reason: '资源下载时发现抓取器不可用' });
      fetchStore.fetcherModal.open = true;
      return;
    }
    if (result && result.aborted) {
      say(
        'WARN',
        `已中断 · ${result.official ? '官方' : String(result.region)} · ${result.files} 个文件已在 ${relPath(result.dir)}`
      );
      playComplete('info');
    } else if (result && result.ok) {
      say(
        'SUCC',
        `下载完成 · ${result.official ? '官方' : String(result.region)} · ${result.files} 个文件 · ${relPath(result.dir)}`
      );
      playComplete('success');
      showDone(result, payload.meta || {});
    } else if (result) {
      say('ERRO', `下载失败 ${result.error || result.region || ''}`);
      playComplete('error');
    }
  }

  /** 中断当前下载任务 */
  async function abort() {
    const result = await guard(() => window.api.abort());
    if (!result) return;
    if (result.ok) say('TIPS', `正在中断(pid ${result.pid})..`);
    else say('WARN', '当前没有正在运行的下载任务');
  }

  /** 记录下载完成信息供展示 */
  function showDone(result: any, extra: any = {}) {
    done.value = {
      dir: result.dir,
      official: Boolean(result.official),
      platform: result.platform || extra.platform || meta.platform || '',
      custom: Boolean(result.custom),
      region: result.region || '',
      base: result.official ? 'CN' : extra.base || '',
      target: result.official ? 'default' : extra.target || '',
      files: result.files,
      bytes: result.bytes,
      label: result.official ? '官方默认包' : result.pair || result.region,
      error: ''
    };
  }

  /** 按下载模式组装请求参数 */
  function buildDownloadPayload(mode: string): { payload: any; label: string } | null {
    if (mode === 'list') {
      const item = currentList.value;
      if (!item) {
        toast({ key: 'dl', kind: 'warn', title: '没有可用名单', text: '先在「区域差异」里生成结果', timeout: 3200 });
        return null;
      }
      const pair = item.name.match(/^([A-Z0-9]+)2([A-Z0-9]+)_gen_/i);
      return {
        payload: {
          uncensor: { region: item.region, list: item.file },
          listPlatform: listPlatformOf(item) || effectivePlatform.value,
          listName: item.name,
          meta: { base: pair ? pair[1] : '', target: pair ? pair[2] : '', platform: item.platform }
        },
        label: `按选择下载（${item.name}）`
      };
    }
    if (mode === 'official') {
      return { payload: { official: true }, label: `按官方下载（${effectivePlatform.value}）` };
    }
    if (mode === 'custom') {
      if (!custom.value.files.length) {
        openCustom();
        return null;
      }
      const payload = {
        region: custom.value.region,
        platform: custom.value.platform,
        base: custom.value.base,
        target: custom.value.target,
        files: custom.value.files.map((item) => String(item).trim()).filter(Boolean)
      };
      if (!payload.files.length) {
        toast({ key: 'dl', kind: 'warn', title: 'files 为空', text: '先「载入当前选择」或新增文件', timeout: 3200 });
        return null;
      }
      return { payload: { custom: payload }, label: `按自定义下载（${payload.region}）` };
    }
    return null;
  }

  /** 打开下载确认弹窗读取信息 */
  async function openDownloadPlan(mode: string) {
    if (running.value) return;
    const built = buildDownloadPayload(mode);
    if (!built) return;

    const current = {
      dir: dir.value.trim(),
      timeout: Number(timeout.value) || 900,
      retries: Number(retries.value) || 3
    };
    plan.value = {
      open: true,
      loading: true,
      error: '',
      mode,
      label: built.label,
      payload: built.payload,
      info: null
    };

    const info = await guard(() =>
      window.api.uncensorPreview(
        plain({
          ...built.payload,
          platform: effectivePlatform.value,
          uncensor: { ...(built.payload.uncensor || {}), ...current }
        })
      )
    );
    plan.value.loading = false;
    if (!info || !info.ok) {
      plan.value.error = (info && info.error) || '读取下载信息失败';
      return;
    }
    plan.value.info = info;
  }

  /** 关闭下载确认弹窗 */
  function cancelDownloadPlan() {
    plan.value.open = false;
  }

  /** 扫描输出目录比对现有资源 */
  async function openSync() {
    if (plan.value.mode === 'official') return;
    const info = plan.value.info;
    if (!info) return;
    const seq = ++syncSeq;
    const listFile = String(info.listFile || '');

    const files = (Array.isArray(info.files) ? info.files : []).map((f: string) => String(f));
    if (!listFile && !files.length) {
      toast({
        key: 'sync',
        kind: 'warn',
        title: '无法按清单同步',
        text: '没有可用的比对清单，请先在「区域差异」里生成结果',
        timeout: 3600
      });
      return;
    }

    sync.value = {
      open: true,
      phase: 'scan',
      error: '',
      done: 0,
      total: 0,
      label: '准备扫描',
      outputDir: String(info.outputDir || ''),
      source: String(info.syncSource || ''),
      missing: [],
      matched: [],
      extra: [],
      removed: 0
    };

    const result = await guard(() =>
      window.api.syncScan(
        plain({
          listFile,
          files,
          outputDir: String(info.outputDir || '')
        })
      )
    );
    if (!sync.value.open || seq !== syncSeq) return;
    if (!result || !result.ok) {
      sync.value.phase = 'error';
      sync.value.error = (result && result.error) || '扫描失败';
      return;
    }
    sync.value.missing = result.missing || [];
    sync.value.matched = result.matched || [];
    sync.value.extra = result.extra || [];
    sync.value.total = result.total || sync.value.total;
    sync.value.done = sync.value.total;
    sync.value.phase = 'done';
    say(
      'TIPS',
      `按清单同步 · 匹配 ${sync.value.matched.length} · 不存在 ${sync.value.missing.length} · 需要清理 ${sync.value.extra.length}`
    );
  }

  /** 忽略同步结果并关闭弹窗 */
  function ignoreSync() {
    syncSeq += 1;
    sync.value.open = false;
  }

  /** 取消按清单同步流程 */
  function cancelSync() {
    const wasOpen = sync.value.open;
    syncSeq += 1;
    sync.value.open = false;
    plan.value.open = false;
    if (wasOpen) say('TIPS', '已取消下载(按清单同步)');
  }

  /** 同步结束后继续执行下载 */
  function startDownloadAfterSync() {
    if (!plan.value.open) return;
    sync.value.open = false;
    confirmDownloadPlan('config');
  }

  /** 忽略同步直接开始下载 */
  function ignoreAndDownload() {
    startDownloadAfterSync();
  }

  /** 清理多余文件后继续下载 */
  async function cleanSync() {
    const files = sync.value.extra.map((f) => String(f.path));
    const seq = syncSeq;
    sync.value.phase = 'clean';
    sync.value.done = 0;
    sync.value.total = files.length;
    sync.value.removed = 0;

    if (files.length) {
      const result = await guard(() =>
        window.api.syncClean(
          plain({
            outputDir: sync.value.outputDir,
            files
          })
        )
      );
      if (!sync.value.open || seq !== syncSeq) return;
      if (!result || !result.ok) {
        sync.value.phase = 'error';
        sync.value.error = (result && result.error) || '清理失败';
        return;
      }
      sync.value.removed = result.removed || 0;
      say(
        'SUCC',
        `按清单同步 · 已清理 ${sync.value.removed} 个文件${result.failed ? `，失败 ${result.failed} 个` : ''}`
      );
    } else {
      say('TIPS', '按清单同步 没有需要清理的文件, 直接开始下载');
    }

    sync.value.extra = [];
    sync.value.done = sync.value.total;
    sync.value.phase = 'cleaned';

    await new Promise((resolve) => setTimeout(resolve, 700));
    if (!sync.value.open || seq !== syncSeq) return;
    startDownloadAfterSync();
  }

  /** 按选项开始执行下载任务 */
  function confirmDownloadPlan(option: 'clear' | 'overwrite' | 'config') {
    const { mode, label } = plan.value;
    const payload = plain(plan.value.payload);
    plan.value.open = false;

    if (mode === 'custom') {
      custom.value.region = payload.custom.region;
      custom.value.platform = payload.custom.platform;
      custom.value.open = false;
    }

    const options: Record<string, string> = { clear: '清空并下载', overwrite: '覆盖并下载', config: '按配置下载' };
    const extra = option === 'clear' ? { clear: true } : option === 'overwrite' ? { overwrite: true } : {};
    void runDownload({ ...payload, ...extra }, `${label} · ${options[option]}`, mode);
  }

  /** 按选中名单打开下载确认 */
  function downloadByList() {
    void openDownloadPlan('list');
  }

  /** 按官方默认包打开下载确认 */
  function downloadOfficial() {
    void openDownloadPlan('official');
  }

  /** 按自定义名单打开下载确认 */
  function downloadCustom() {
    void openDownloadPlan('custom');
  }

  /** 打开自定义名单编辑弹窗 */
  function openCustomDialog() {
    if (!custom.value.files.length) {
      openCustom();
      return;
    }
    custom.value.open = true;
  }

  /** 把下载结果打包成压缩包 */
  async function zipDone() {
    if (!done.value) return;
    zipping.value = true;
    const result = await useResourcesStore().runZipWithProgress({
      dir: done.value.dir,
      platform: done.value.platform,
      official: done.value.official,
      custom: done.value.custom,
      region: done.value.region,
      base: done.value.base,
      target: done.value.target
    });
    zipping.value = false;
    if (!result) return;
    if (!result.ok) {
      done.value.error = result.error || '打包失败';
      return;
    }
    done.value.error = '';
    say('SUCC', `已打包 ${basename(result.file)} ${fmtBytes(result.bytes)} 用时 ${result.seconds || 0}s`);
    toast({
      key: 'zip',
      kind: 'ok',
      title: '打包完成',
      text: `${basename(result.file)} · ${fmtBytes(result.bytes)} · ${result.seconds || 0}s`,
      timeout: 5000
    });
  }

  /** 打开下载结果的输出目录 */
  function openDoneDir() {
    if (done.value) window.api.openDir(done.value.dir);
  }

  return {
    lists,
    listIndex,
    listOptions,
    listPlatform,
    listPlatforms,
    platformOptions,
    visibleLists,
    currentList,
    effectivePlatform,
    setListPlatform,
    timeout,
    retries,
    dir,
    running,
    runningMode,
    custom,
    customRows,
    done,
    zipping,
    plan,
    sync,
    loadLists,
    openCustom,
    openCustomDialog,
    loadCustomFromSelection,
    addCustomFile,
    removeCustomFile,
    clearCustomFiles,
    saveCustom,
    openDownloadPlan,
    cancelDownloadPlan,
    confirmDownloadPlan,
    openSync,
    ignoreSync,
    cancelSync,
    ignoreAndDownload,
    cleanSync,
    runDownload,
    downloadByList,
    downloadOfficial,
    downloadCustom,
    abort,
    showDone,
    zipDone,
    openDoneDir
  };
});
