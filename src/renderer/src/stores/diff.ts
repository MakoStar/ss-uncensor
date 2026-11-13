import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { guard } from '../app/api';
import { showError, askChoice, askConfirm } from '../app/dialog';
import { state } from '../app/state';
import { basename, relPath, say, sizeText } from '../utils/format';
import { toast } from '../utils/toast';
import { useMetaStore } from './meta';
import { playComplete, playSound } from './sound';
import { toSlash } from '@shared/utils';

const RENDER_STEP = 300;

export const DIFF_KIND_TEXT = { size: '体积不同', hash: '哈希不同', missing_in_base: '目标新增' };

export const MODE_LABEL = {
  contains: '包含',
  startsWith: '开头匹配',
  endsWith: '结尾匹配',
  exact: '完全相同',
  regex: '正则'
};

/** 按匹配模式生成文件名判断函数 */
export function ruleMatcher(mode: string, pattern: string): ((file: string) => boolean) | null {
  const raw = String(pattern || '');
  const text = raw.startsWith('^') ? raw.slice(1) : raw;
  const lower = text.toLowerCase();

  if (mode === 'contains') return (file: string) => file.toLowerCase().includes(lower);
  if (mode === 'startsWith') return (file: string) => file.toLowerCase().startsWith(lower);
  if (mode === 'endsWith') return (file: string) => file.toLowerCase().endsWith(lower);
  if (mode === 'exact') return (file: string) => file === text;
  try {
    const re = new RegExp(raw);
    return (file: string) => re.test(file);
  } catch (err) {
    return null;
  }
}

export const useDiffStore = defineStore('diff', () => {
  const meta = useMetaStore();

  const platform = ref('');
  const base = ref('');
  const target = ref('');

  const result = ref<any>(null);
  const filter = ref('all');

  const query = ref('');

  const comparing = ref(false);

  const rebuilding = ref(false);
  const summaryText = ref('尚未对比');

  const manifestMissing = ref(0);
  const totalText = ref('');
  const outText = ref('');
  const filesVisible = ref(false);

  const resultModal = ref({
    open: false,
    base: 'CN',
    target: 'JP',
    platform: 'win',
    list: [] as string[],
    rules: [] as any[],
    query: '',
    outFile: '',
    listFile: '',
    reportJson: '',
    file: '',
    error: '',
    kv: [] as any[],
    baseRows: [] as any[],
    targetRows: [] as any[]
  });

  const jsonModal = ref({ open: false, file: '', editable: false, text: '', error: '', title: '' });

  const viewResultModal = ref({
    open: false,
    loading: false,
    dir: '',
    base: '',
    target: '',
    platform: '',
    listFile: '',
    outFile: '',
    files: [] as any[],
    error: ''
  });

  const fileModal = ref<{ open: boolean; item: any }>({ open: false, item: null });

  const fileLocation = ref('');
  const locationHint = ref('');
  const locationIsResource = ref(false);

  /** 打开单个文件详情弹窗 */
  function openFile(item: any): void {
    if (!item) return;
    fileModal.value = { open: true, item };
    void resolveFileLocation(item);
    playSound('open');
  }

  /** 关闭文件详情弹窗 */
  function closeFile(): void {
    fileModal.value.open = false;
    playSound('close');
  }

  /** 定位文件在本地资源中的位置 */
  async function resolveFileLocation(item: any): Promise<void> {
    fileLocation.value = '';
    locationHint.value = '';
    locationIsResource.value = false;
    if (!item) return;

    const data = result.value || {};
    const dirs: any = (meta.meta && meta.meta.dirs) || {};
    const plat = data.platform || platform.value || meta.platform;
    const baseRegion = data.baseRegion || '';
    const targetRegion = data.targetRegion || '';

    const roots: string[] = [];
    const resourceRoot = toSlash(dirs.resource || '');
    if (resourceRoot && item.target && baseRegion && targetRegion) {
      roots.push(`${resourceRoot}/${baseRegion}2${targetRegion}/${plat}`);
    }
    const uncensorRoot = toSlash(dirs.uncensor || '');
    if (uncensorRoot) roots.push(uncensorRoot);

    const hit: any =
      item.file && roots.length ? await guard(() => window.api.locateFile({ file: item.file, roots })) : null;

    if (hit && hit.ok && hit.dir) {
      fileLocation.value = toSlash(hit.dir);
      locationHint.value = '已定位到本地已下载的资源';
      locationIsResource.value = true;
      return;
    }

    const manifestRoot = toSlash(dirs.manifest || '');
    const region = item.target ? targetRegion : baseRegion;
    fileLocation.value = manifestRoot && region ? `${manifestRoot}/${region}` : manifestRoot;
    locationHint.value = item.target
      ? '本地没有这个文件，打开的是目标区域的清单目录'
      : `目标侧没有这个文件，打开的是基准区域（${baseRegion || '基准'}）的清单目录`;
  }

  /** 打开文件所在目录并提示 */
  async function openFileLocation(): Promise<void> {
    const dir = fileLocation.value;
    if (!dir) return;
    await guard(() => window.api.openDir(dir));
    if (!locationIsResource.value) {
      toast({
        key: 'diffloc',
        kind: 'warn',
        title: locationHint.value || '本地没有这个文件，已打开清单目录',
        text: dir,
        timeout: 4000
      });
    }
  }

  /** 查出缺少清单的区域列表 */
  async function missingManifests(): Promise<{ region: string; side: string }[]> {
    const targets = [
      { region: base.value, side: '基准' },
      { region: target.value, side: '目标' }
    ];
    try {
      const res: any = await window.api.manifestStatus({
        regions: targets.map((item) => item.region),
        platform: platform.value
      });
      if (res && res.ok && Array.isArray(res.missing)) {
        return targets.filter((item) => res.missing.includes(item.region));
      }
    } catch {}
    return [];
  }

  /** 拼出缺失清单的提示文案 */
  function missingText(list: { region: string; side: string }[]): string {
    const parts = list.map((item) => `${item.side}区域 ${item.region}`);
    return `${platform.value} 平台缺少${parts.join('、')} 的清单`;
  }

  /** 刷新清单状态并更新提示 */
  async function refreshManifests(): Promise<{ region: string; side: string }[]> {
    if (!platform.value || !base.value || !target.value) return [];
    const missing = await missingManifests();

    if (result.value) return missing;
    summaryText.value = missing.length ? `${missingText(missing)}，先到「抓取清单」抓取` : '尚未对比';
    manifestMissing.value = missing.length;
    return missing;
  }

  /** 按搜索词过滤差异列表 */
  function pickByQuery(list: any[]): any[] {
    const keyword = query.value.trim().toLowerCase();
    return keyword
      ? list.filter((item: any) =>
          String(item.file || '')
            .toLowerCase()
            .includes(keyword)
        )
      : list;
  }

  const rows = computed(() => {
    const data = result.value;
    if (!data) return { list: [] as any[], changed: false, label: '差异项' };
    const items = data.items || [];
    const same = data.same || [];
    if (filter.value === 'same') return { list: pickByQuery(same), changed: false, label: '一致' };
    if (filter.value === 'onlyTarget')
      return { list: pickByQuery(items.filter((item: any) => !item.base)), changed: true, label: '仅目标有' };
    if (filter.value === 'onlyBase')
      return { list: pickByQuery(items.filter((item: any) => !item.target)), changed: true, label: '仅基准有' };
    if (filter.value === 'size')
      return {
        list: pickByQuery(items.filter((item: any) => (item.diff || []).includes('size'))),
        changed: true,
        label: '体积不同'
      };
    return { list: pickByQuery(items), changed: true, label: '差异项' };
  });

  const visibleCount = ref(RENDER_STEP);

  const shownRows = computed(() => rows.value.list.slice(0, visibleCount.value));
  const moreCount = computed(() => Math.max(0, rows.value.list.length - shownRows.value.length));

  /** 增加差异列表可见条数 */
  function loadMore(): void {
    if (!moreCount.value) return;
    visibleCount.value = Math.min(rows.value.list.length, visibleCount.value + RENDER_STEP);
  }

  const rebuiltText = ref('');

  /** 刷新差异条目总数文案 */
  function refreshTotal(): void {
    if (!result.value) {
      totalText.value = '';
      return;
    }
    totalText.value = `${rebuiltText.value}${rows.value.label} ${rows.value.list.length}`;
  }

  watch([filter, query], () => {
    visibleCount.value = RENDER_STEP;
    refreshTotal();
  });

  const summaryTiles = computed(() => {
    const summary = (result.value && result.value.summary) || {};
    return [
      { filter: '', value: summary.baseCount, label: '基础资源' },
      { filter: '', value: summary.targetCount, label: '目标资源' },
      { filter: 'same', value: summary.same, label: '一致资源' },
      { filter: 'onlyBase', value: summary.onlyInBase, label: '仅基准有' },
      { filter: 'onlyTarget', value: summary.onlyInTarget, label: '仅目标有' },
      { filter: 'all', value: summary.diffTotal, label: '差异文件' }
    ];
  });

  const resultRows = computed(() => {
    const query = resultModal.value.query.trim().toLowerCase();
    return resultModal.value.list
      .map((file, index) => ({ file, index }))
      .filter((row) => !query || row.file.toLowerCase().includes(query));
  });

  const resultCount = computed(() => {
    const total = resultModal.value.list.length;
    const filtered = resultRows.value.length;
    return resultModal.value.query ? `${total} 项 · 过滤出 ${filtered}` : `${total} 项`;
  });

  const listJsonText = computed(() =>
    JSON.stringify(
      { region: resultModal.value.target, platform: resultModal.value.platform, files: resultModal.value.list },
      null,
      2
    )
  );

  /** 切换差异列表过滤条件 */
  function setFilter(next: string): void {
    filter.value = next;
  }

  /** 按元数据补全默认对比区域 */
  function init(): void {
    if (!platform.value) platform.value = meta.platform;

    const regions = meta.regions;
    if (!regions.length) return;

    const want = (name: string, fallbackIndex: number) =>
      regions.includes(name) ? name : (regions[fallbackIndex] ?? regions[0]);

    if (!base.value) base.value = want('CN', 0);
    if (!target.value) target.value = want('JP', regions.length - 1);

    if (base.value === target.value) {
      target.value = regions.find((region: string) => region !== base.value) || target.value;
    }
  }

  /** 切换平台并重置对比结果 */
  async function setPlatform(name: string): Promise<void> {
    if (!name) return;
    resetCompare();
    platform.value = name;
    await meta.setPlatform(name);
  }

  /** 重建当前平台的清单快照 */
  async function rebuildSnapshots(): Promise<void> {
    if (rebuilding.value) return;
    rebuilding.value = true;
    playSound('click');
    try {
      const res: any = await guard(() => window.api.rebuildMani({ platform: platform.value }));
      if (!res) {
        toast({
          key: 'rebuild',
          kind: 'err',
          title: '重建快照失败',
          text: '主进程未响应，请查看运行日志',
          timeout: 4000
        });
        return;
      }
      if (res.missing && res.missing.length) {
        toast({
          key: 'rebuild',
          kind: 'warn',
          title: '部分区域无清单',
          text: `${res.missing.join(', ')} 还没有清单，已跳过`,
          timeout: 4000
        });
      }
      if (res.rebuilt && res.rebuilt.length) {
        const detail = res.rebuilt.map((item: any) => `${item.region}·g${item.gameVer}·${item.resources}项`).join('，');
        toast({
          key: 'rebuild',
          kind: 'ok',
          title: '快照已重建',
          text: `${detail}（对比/生成结果时也会自动重建）`,
          timeout: 5000
        });
        say('SUCC', `已重建快照: ${detail}`);
      }
    } finally {
      rebuilding.value = false;
    }
  }

  watch([platform, base, target], () => {
    void refreshManifests();
  });

  /** 清空对比结果和筛选条件 */
  function resetCompare(): void {
    result.value = null;
    rebuiltText.value = '';
    filter.value = 'all';
    query.value = '';
    filesVisible.value = false;
    summaryText.value = '尚未对比';
    totalText.value = '';
    outText.value = '';
  }

  /** 设置基准区域并重置对比 */
  function setBase(next: string): void {
    if (next === target.value) target.value = base.value;
    base.value = next;
    resetCompare();
  }

  /** 设置目标区域并重置对比 */
  function setTarget(next: string): void {
    if (next === base.value) base.value = target.value;
    target.value = next;
    resetCompare();
  }

  /** 对比两个区域的清单差异 */
  async function compare(): Promise<void> {
    if (comparing.value) return;
    if (base.value === target.value) {
      say('WARN', '基准与目标不能相同');
      showError('无法对比差异', '基准与目标是同一个区域。\n\n请把「基准」或「目标」改成另一个区域再对比。');
      playComplete('error');
      return;
    }

    const missing = await missingManifests();
    if (missing.length) {
      const text = missingText(missing);
      summaryText.value = `${text}，先到「抓取清单」抓取`;
      outText.value = '';
      totalText.value = '';
      showError('无法对比差异', `${text}。\n\n请先到「抓取清单」抓取 ${platform.value} 平台的对应区域，再回来对比。`);
      playComplete('error');
      return;
    }

    comparing.value = true;

    summaryText.value = '对比中…';
    outText.value = '对比中…';
    totalText.value = '';

    try {
      const res = await guard(() =>
        window.api.diff({ base: base.value, target: target.value, platform: platform.value })
      );
      if (!res) {
        summaryText.value = '对比失败';
        outText.value = '';
        playComplete('error');
        return;
      }
      if (res.error) {
        summaryText.value = res.error;
        outText.value = '';

        showError('无法对比差异', res.error);
        playComplete('error');
        return;
      }

      result.value = { ...res, baseRegion: base.value, targetRegion: target.value };
      filesVisible.value = true;
      const rebuilt = res.rebuilt && res.rebuilt.length ? `已自动合成 ${res.rebuilt.join(', ')} · ` : '';
      rebuiltText.value = rebuilt;
      refreshTotal();
      outText.value = `预览模式：差异 ${basename(res.outFile)} / 结果 ${basename(res.listFile)} 尚未写入磁盘，点「生成结果」才会落盘。`;
      playComplete('success');
    } finally {
      comparing.value = false;
    }
  }

  /** 生成差异结果并打开弹窗 */
  async function openResult(): Promise<void> {
    if (base.value === target.value) {
      say('WARN', '基准与目标不能相同');
      showError('无法生成结果', '基准与目标是同一个区域。\n\n请把「基准」或「目标」改成另一个区域再生成结果。');
      playComplete('error');
      return;
    }

    const missing = await missingManifests();
    if (missing.length) {
      showError(
        '无法生成结果',
        `${missingText(missing)}。\n\n请先到「抓取清单」抓取 ${platform.value} 平台的对应区域，再回来生成结果。`
      );
      playComplete('error');
      return;
    }

    const view = resultModal.value;

    view.base = base.value;
    view.target = target.value;
    view.platform = platform.value;
    view.open = true;
    view.file = '正在计算差异…';
    view.kv = [];
    view.error = '';
    view.baseRows = [];
    view.targetRows = [];
    view.list = [];
    view.rules = [];
    view.query = '';

    const res = await guard(() =>
      window.api.diffResult({
        base: base.value,
        target: target.value,
        platform: platform.value
      })
    );
    if (!res || res.error) {
      view.file = '生成失败';
      view.error = (res && res.error) || '生成失败，请查看运行日志';
      playComplete('error');
      return;
    }

    view.platform = res.platform || meta.platform || 'win';
    view.reportJson = res.reportJson || '';
    view.outFile = res.outFile || '';
    view.listFile = res.listFile || '';
    view.list = [...(res.list || [])];
    view.file = `${relPath(res.listFile)} · ${res.list.length} 项`;

    const s = res.summary || {};
    const cfg = res.config || {};
    const baseCfg = cfg.base || {};
    const targetCfg = cfg.target || {};
    view.baseRows = [
      { key: '资源总数', value: s.baseCount },
      { key: '独有文件', value: s.onlyInBase },
      { key: 'RES_VER', value: baseCfg.RES_VER },
      { key: 'CLIENT_VER', value: baseCfg.CLIENT_VER },
      { key: 'GAME_VER', value: baseCfg.GAME_VER }
    ].filter((row: any) => row.value !== undefined && row.value !== null && row.value !== '');
    view.targetRows = [
      { key: '资源总数', value: s.targetCount },
      { key: '独有文件', value: s.onlyInTarget },
      { key: 'RES_VER', value: targetCfg.RES_VER },
      { key: 'CLIENT_VER', value: targetCfg.CLIENT_VER },
      { key: 'GAME_VER', value: targetCfg.GAME_VER }
    ].filter((row: any) => row.value !== undefined && row.value !== null && row.value !== '');
    view.kv = [
      { key: '差异文件', value: s.diffTotal },
      { key: '一致', value: s.same },
      { key: '体积不同', value: s.sizeDiff },
      { key: '哈希不同', value: s.hashDiff },
      { key: '扩展名', value: res.ext || '' }
    ].filter((row: any) => row.value !== undefined && row.value !== null && row.value !== '');
    state.diff = view;
  }

  /** 按规则从结果中排除文件 */
  function applyRule(pattern: string, mode: string): void {
    const view = resultModal.value;
    if (!pattern) {
      toast({ key: 'rule', kind: 'warn', title: '排除规则', text: '请先填写要排除的内容', timeout: 3000 });
      return;
    }

    const match = ruleMatcher(mode, pattern);
    if (!match) {
      view.error = `正则不合法：${pattern}`;
      return;
    }
    view.error = '';

    const before = view.list.length;
    view.list = view.list.filter((file: string) => !match(file));
    const removed = before - view.list.length;

    view.rules.push({ mode, pattern, label: `${MODE_LABEL[mode]} ${pattern}`, removed });
    toast({
      key: 'rule',
      kind: removed ? 'ok' : 'info',
      title: '排除规则已应用',
      text: removed
        ? `${MODE_LABEL[mode]} ${pattern} · 移除 ${removed} 项`
        : `${MODE_LABEL[mode]} ${pattern} · 没有匹配项`,
      timeout: 3200
    });
  }

  const pendingFocus = ref(-1);

  /** 在结果列表新增空文件项 */
  function addResultFile(): void {
    resultModal.value.query = '';
    resultModal.value.list.push('');
    pendingFocus.value = resultModal.value.list.length - 1;
  }

  /** 取出待聚焦行的下标 */
  function consumeFocus(): number {
    const index = pendingFocus.value;
    pendingFocus.value = -1;
    return index;
  }

  /** 删除结果列表指定文件 */
  function removeResultFile(index: number): void {
    resultModal.value.list.splice(index, 1);
  }

  /** 删除已应用的排除规则 */
  function removeRule(index: number): void {
    resultModal.value.rules.splice(index, 1);
  }

  /** 按选择落盘差异与结果文件 */
  async function saveResult(): Promise<void> {
    const view = resultModal.value;

    const choice = await askChoice('保存差异结果', '选择要保存的内容：', [
      { value: 'diff', label: '差异 JSON' },
      { value: 'both', label: '两个都保存' },
      { value: 'result', label: '结果 JSON', primary: true }
    ]);
    if (!choice) return;

    const wantDiff = choice === 'diff' || choice === 'both';
    const wantResult = choice === 'result' || choice === 'both';

    const saved: string[] = [];

    if (wantDiff) {
      let res: any = null;
      try {
        res = await window.api.writeJson({ file: view.outFile, text: view.reportJson });
      } catch (err) {
        const reason = String((err as any)?.message || err || '未知错误');
        say('ERRO', `保存差异 JSON 失败: ${reason}`);
        view.error = reason;
        showError(
          '保存差异 JSON 失败',
          `写入差异报告时出错，详情见下。${reason}`,
          { label: '输出文件', value: basename(view.outFile) },
          true
        );
        playComplete('error');
        return;
      }
      if (!res || !res.ok) {
        const reason = (res && res.error) || '主进程返回失败';
        say('ERRO', `保存差异 JSON 失败: ${reason}`);
        view.error = reason;
        showError('保存差异 JSON 失败', reason, { label: '输出文件', value: basename(view.outFile) }, true);
        playComplete('error');
        return;
      }
      saved.push(basename(res.file));
    }

    if (wantResult) {
      const list = view.list.map((item) => String(item));
      const payload = { base: view.base, target: view.target, platform: view.platform, list };
      let res: any = null;
      try {
        res = await window.api.saveDiffList(payload);
      } catch (err) {
        const reason = String((err as any)?.message || err || '未知错误');
        say('ERRO', `保存结果 JSON 失败: ${reason}`);
        view.error = reason;
        showError(
          '保存结果 JSON 失败',
          `写入下载名单时出错，详情见下。${reason}`,
          { label: '输出文件', value: basename(view.listFile) },
          true
        );
        playComplete('error');
        return;
      }
      if (!res || !res.ok) {
        const reason = (res && res.error) || '主进程返回失败';
        say('ERRO', `保存结果 JSON 失败: ${reason}`);
        view.error = reason;
        showError('保存结果 JSON 失败', reason, { label: '输出文件', value: basename(view.listFile) }, true);
        playComplete('error');
        return;
      }
      saved.push(basename(res.file));
    }
    view.open = false;
    toast({ key: 'list', kind: 'ok', title: '已保存', text: saved.join('、'), timeout: 4000 });
  }

  /** 打开配置文件预览弹窗 */
  async function openJson(file: string, edit: boolean = false, initialText: string = ''): Promise<void> {
    const view = jsonModal.value;
    view.open = true;
    view.file = file;
    view.editable = edit;
    view.error = '';
    view.title = edit ? '编辑 JSON' : '预览 JSON';

    if (initialText) {
      view.text = initialText;
      return;
    }

    view.text = '加载中…';
    const res = await guard(() => window.api.readJson({ file }));
    if (!res || res.error) {
      view.text = (res && res.error) || '读取失败';
      return;
    }
    view.file = `${relPath(res.file)} · ${(res.size / 1024).toFixed(1)}KB`;
    view.text = res.text;
  }

  /** 把弹窗文本写回文件 */
  async function saveJson(): Promise<void> {
    const view = jsonModal.value;
    const res = await guard(() => window.api.writeJson({ file: view.file, text: view.text }));
    if (!res || !res.ok) {
      view.error = (res && res.error) || '保存失败';
      return;
    }
    toast({
      key: 'json',
      kind: 'ok',
      title: '已保存',
      text: `${basename(res.file)} · ${(res.bytes / 1024).toFixed(1)}KB`,
      timeout: 3000
    });
  }

  /** 把弹窗内容复制到剪贴板 */
  async function copyJson(): Promise<void> {
    const text = jsonModal.value.text;
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
    toast({ key: 'json', kind: 'ok', title: '已复制', text: `${text.length} 个字符`, timeout: 2500 });
  }

  /** 打开生成结果查看弹窗 */
  async function openViewResult(): Promise<void> {
    viewResultModal.value.open = true;
    viewResultModal.value.loading = true;
    viewResultModal.value.error = '';
    viewResultModal.value.files = [];
    const res: any = await guard(() =>
      window.api.listDiffResult({
        base: base.value,
        target: target.value,
        platform: platform.value
      })
    );
    if (!res || res.error) {
      const reason = (res && res.error) || '读取生成结果目录失败';
      viewResultModal.value.error = reason;
      viewResultModal.value.loading = false;
      say('ERRO', `查看结果失败: ${reason}`);
      return;
    }
    viewResultModal.value.dir = res.dir || '';
    viewResultModal.value.base = res.base || base.value;
    viewResultModal.value.target = res.target || target.value;
    viewResultModal.value.platform = res.platform || platform.value;
    viewResultModal.value.listFile = res.listFile || '';
    viewResultModal.value.outFile = res.outFile || '';
    viewResultModal.value.files = (res.files || []).slice().sort((a: any, b: any) => b.modified - a.modified);
    viewResultModal.value.loading = false;
  }

  /** 关闭生成结果弹窗 */
  function closeViewResult(): void {
    viewResultModal.value.open = false;
    playSound('close');
  }

  /** 用系统程序打开结果文件 */
  async function openResultFile(file: string): Promise<void> {
    if (!file) return;
    await guard(() => window.api.openPath(file));
    playSound('open');
  }

  /** 打开结果文件所在目录 */
  async function openResultDir(): Promise<void> {
    const dir = viewResultModal.value.dir;
    if (!dir) return;
    await guard(() => window.api.openDir(dir));
    playSound('open');
  }

  /** 确认后删除单个结果文件 */
  async function deleteResultFile(file: any): Promise<void> {
    const name = String((file && file.name) || '');
    if (!name) return;
    const ok = await askConfirm(
      '删除结果文件',
      `将永久删除 ${name}（${sizeText(file.size || 0)}）。\n${toSlash(file.path || name)}`,
      '确认删除'
    );
    if (!ok) return;

    const res: any = await guard(() => window.api.deleteDiffResult({ name }));
    if (!res) return;
    if (!res.ok) {
      toast({ key: 'diff-result', kind: 'err', title: '删除失败', text: res.error || '未知错误', timeout: 5000 });
      say('ERRO', `删除结果文件失败: ${res.error || name}`);
      return;
    }
    toast({
      key: 'diff-result',
      kind: 'ok',
      title: '已删除结果文件',
      text: `${res.name} · 释放 ${sizeText(res.bytes || 0)}`,
      timeout: 4000
    });
    say('SUCC', `已删除结果文件: ${res.name}`);
    playSound('close');
    await openViewResult();
  }

  /** 确认后清空全部生成结果 */
  async function clearResultFiles(): Promise<void> {
    const files = viewResultModal.value.files || [];
    if (!files.length) {
      toast({
        key: 'diff-result',
        kind: 'warn',
        title: '没有可清理的结果',
        text: '这个目录下当前没有生成结果',
        timeout: 3000
      });
      return;
    }
    const total = files.reduce((sum: number, f: any) => sum + Number(f.size || 0), 0);
    const ok = await askConfirm(
      '清空生成结果',
      `将永久删除 output/Generated/diff 下的 ${files.length} 个文件（共 ${sizeText(total)}）。\n游戏目录与清单不受影响。`,
      '确认清空'
    );
    if (!ok) return;

    const res: any = await guard(() => window.api.clearDiffResult());
    if (!res) return;
    if (!res.ok) {
      toast({
        key: 'diff-result',
        kind: 'err',
        title: '清空失败',
        text: (res.failed || []).join('、') || '部分文件删除失败',
        timeout: 6000
      });
      say('ERRO', `清空生成结果失败: ${(res.failed || []).join(', ')}`);
      return;
    }
    toast({
      key: 'diff-result',
      kind: 'ok',
      title: '已清空生成结果',
      text: `删除 ${res.count} 个文件 · 释放 ${sizeText(res.bytes || 0)}`,
      timeout: 4500
    });
    say('SUCC', `已清空生成结果: ${res.count} 个文件 ${sizeText(res.bytes || 0)}`);
    playSound('close');
    await openViewResult();
  }

  return {
    platform,
    base,
    target,
    result,
    filter,
    query,
    comparing,
    rebuilding,
    summaryText,
    totalText,
    outText,
    filesVisible,
    manifestMissing,
    refreshManifests,
    rows,
    shownRows,
    moreCount,
    loadMore,
    visibleCount,
    summaryTiles,
    resultModal,
    resultRows,
    resultCount,
    listJsonText,
    jsonModal,
    fileModal,
    openFile,
    closeFile,
    fileLocation,
    locationHint,
    locationIsResource,
    openFileLocation,
    viewResultModal,
    openViewResult,
    closeViewResult,
    openResultFile,
    openResultDir,
    deleteResultFile,
    clearResultFiles,
    setFilter,
    init,
    setPlatform,
    resetCompare,
    setBase,
    setTarget,
    compare,
    openResult,
    applyRule,
    addResultFile,
    removeResultFile,
    removeRule,
    consumeFocus,
    saveResult,
    openJson,
    saveJson,
    copyJson,
    rebuildSnapshots
  };
});
