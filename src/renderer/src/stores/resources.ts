import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { outputDirSetting } from '../app/state';
import { askConfirm } from '../app/dialog';
import { basename, relPath, say } from '../utils/format';
import { toast } from '../utils/toast';
import { fmtBytes, toSlash } from '@shared/utils';
import { MIN_LOADING_MS } from './browse';

/** 取路径末尾的文件名 */
export const pathName = (file: string) =>
  String(file || '')
    .split(/[\\/]/)
    .pop() || '';

const PACKAGE_PLATFORMS = ['win', 'and', 'ios'];

/** 按文件名判断包类型 */
function packageTypeOf(name: string): 'mod' | 'backup' {
  return /^(PS|IR)(_|\.)/i.test(String(name || '')) ? 'backup' : 'mod';
}

/** 从文件名解析所属平台 */
function packagePlatformOf(name: string): string {
  const tokens = String(name || '')
    .replace(/\.(zip|tar\.gz)$/i, '')
    .split(/[_\-.]/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  return tokens.find((token) => PACKAGE_PLATFORMS.includes(token)) || '';
}

export const useResourcesStore = defineStore('resources', () => {
  const summary = ref<any>(null);
  const loading = ref(false);
  const renderKey = ref(0);
  const packPlatform = ref('');

  const allPackages = computed(() => {
    const items = (summary.value && summary.value.packages) || [];
    return items.map((item: any) => ({
      ...item,
      type: item.type || packageTypeOf(item.name),
      platform: item.platform || packagePlatformOf(item.name)
    }));
  });

  const packagePlatforms = computed(() => {
    const seen = new Set<string>();
    const order = ['win', 'and', 'ios'];
    const names = allPackages.value.map((item: any) => String(item.platform || '').toLowerCase()).filter(Boolean);
    return [...order.filter((p) => names.includes(p)), ...names.filter((p) => !order.includes(p))].filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  });

  /** 统计某平台的包数量 */
  /** 统计某平台的压缩包数量 */
  function packageCountOf(platform: string): number {
    return allPackages.value.filter((item: any) => String(item.platform || '').toLowerCase() === platform).length;
  }

  const packagePlatformOptions = computed(() => [
    { value: '', label: '全部平台', count: allPackages.value.length },
    ...packagePlatforms.value.map((p) => ({ value: p, label: p, count: packageCountOf(p) }))
  ]);

  /** 设置当前的平台筛选 */
  function setPackPlatform(value: string) {
    packPlatform.value = value;
  }

  const visiblePackages = computed(() => {
    const items = packPlatform.value
      ? allPackages.value.filter(
          (item: any) => String(item.platform || '').toLowerCase() === packPlatform.value.toLowerCase()
        )
      : allPackages.value;
    const order = new Map(packagePlatforms.value.map((p, i) => [p, i]));
    return [...items].sort((a: any, b: any) => {
      const oa = order.has(String(a.platform || '').toLowerCase())
        ? order.get(String(a.platform || '').toLowerCase())
        : 99;
      const ob = order.has(String(b.platform || '').toLowerCase())
        ? order.get(String(b.platform || '').toLowerCase())
        : 99;
      if (oa !== ob) return Number(oa) - Number(ob);
      return (Number(b.mtime) || 0) - (Number(a.mtime) || 0);
    });
  });

  const packGroups = computed(() => [
    {
      key: 'mod',
      title: '模组资源包',
      short: '模组',
      id: 'res-pack-table',
      empty: '还没有打包过模组资源',
      items: visiblePackages.value.filter((item: any) => item.type === 'mod')
    },
    {
      key: 'backup',
      title: '备份恢复包',
      short: '备份',
      id: 'res-pack-backup-table',
      empty: '还没有备份恢复包',
      items: visiblePackages.value.filter((item: any) => item.type === 'backup')
    }
  ]);

  const zip = ref({ open: false, file: '', done: 0, total: 0, seconds: 0 });
  const zipStartedAt = ref(0);

  let zipTimer: number | null = null;

  const zipPercent = computed(() => {
    if (zip.value.total) return Math.min(100, Math.round((zip.value.done / zip.value.total) * 100));
    return Math.round(30 + 20 * Math.sin(zip.value.seconds * 2));
  });

  const zipText = computed(() => {
    if (zip.value.total) {
      return `${fmtBytes(zip.value.done)} / ${fmtBytes(zip.value.total)} · ${zipPercent.value}% · ${zip.value.seconds}s`;
    }
    return `正在打包 · 已用 ${zip.value.seconds}s`;
  });

  /** 启动打包计时刷新 */
  function startZipTimer() {
    if (zipTimer) clearInterval(zipTimer);
    zipTimer = window.setInterval(() => {
      if (!zip.value.open) return;
      zip.value.seconds = zipStartedAt.value ? Math.round((Date.now() - zipStartedAt.value) / 1000) : 0;
    }, 400);
  }

  /** 停止打包计时刷新 */
  function stopZipTimer() {
    if (zipTimer) clearInterval(zipTimer);
    zipTimer = null;
  }

  window.api.onPackageProgress(({ done, total }: any) => {
    if (!zip.value.open) return;
    zip.value.total = total || zip.value.total;
    zip.value.done = done;
    zip.value.seconds = zipStartedAt.value ? Math.round((Date.now() - zipStartedAt.value) / 1000) : 0;
  });

  /** 读取资源目录汇总信息 */
  /** 读取资源汇总并刷新界面 */
  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    const started = Date.now();

    const result = await guard(() => window.api.resourceSummary({ dir: outputDirSetting() }));
    const elapsed = Date.now() - started;
    if (elapsed < MIN_LOADING_MS) await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
    loading.value = false;
    if (!result) return;

    summary.value = result;
    if (packPlatform.value && !packagePlatforms.value.includes(packPlatform.value)) packPlatform.value = '';
    renderKey.value += 1;
  }

  /** 重新读取资源并提示结果 */
  async function refresh() {
    if (loading.value) return;
    await load();
    const s = summary.value;
    toast({
      key: 'res-refresh',
      kind: s ? 'ok' : 'warn',
      title: s ? '已刷新' : '刷新失败',
      text: s
        ? `${s.totals.files} 个文件 · ${fmtBytes(s.totals.bytes)} · ${s.totals.packages} 个包`
        : '读取资源目录失败，请查看运行日志',
      timeout: 2400
    });
  }

  /** 打开资源输出根目录 */
  /** 打开资源根目录 */
  function openRoot(): void {
    if (summary.value) window.api.openDir(summary.value.root);
  }

  /** 打开资源所在目录 */
  async function openDir(item: any): Promise<void> {
    if (!item || !item.dir) return;
    await guard(() => window.api.openDir(item.dir));
    say('TIPS', `已打开目录: ${relPath(item.dir)}`);
  }

  /** 用系统程序打开压缩包文件 */
  async function openPackageFile(item: any): Promise<void> {
    if (!item || !item.file) return;
    await guard(() => window.api.openPath(item.file));
    say('TIPS', `已打开文件: ${basename(item.file)}`);
  }

  /** 打开压缩包所在目录 */
  async function openPackageFolder(item: any): Promise<void> {
    if (!item || !item.file) return;
    await guard(() => window.api.openDir(item.file));
    say('TIPS', `已打开目录: ${relPath(item.file)}`);
  }

  /** 打开打包进度弹窗 */
  function openZipProgress(file: string): void {
    zip.value = { open: true, file: file ? pathName(toSlash(file)) : '', done: 0, total: 0, seconds: 0 };
    startZipTimer();
  }

  /** 关闭打包进度弹窗 */
  function closeZipProgress(): void {
    zip.value.open = false;
    zipStartedAt.value = 0;
    zip.value.total = 0;
    stopZipTimer();
  }

  /** 带进度弹窗执行打包 */
  async function runZipWithProgress(options: any): Promise<any> {
    const probe = await guard(() => window.api.packageZip({ ...options, dryRun: true }));
    if (!probe) return null;

    let overwrite = false;
    if (probe.needConfirm) {
      const ok = await askConfirm(
        '已存在同名压缩包',
        `${probe.name}（${fmtBytes(probe.bytes)}）已经在打包目录里，要覆盖吗？`,
        '覆盖'
      );
      if (!ok) return null;
      overwrite = true;
    }

    say('TIPS', `开始打包 ${probe.name} ..`);
    zipStartedAt.value = Date.now();
    zip.value.done = 0;
    zip.value.total = 0;
    openZipProgress(options.dir || '');
    const result = await guard(() => window.api.packageZip(overwrite ? { ...options, overwrite: true } : options));
    closeZipProgress();
    zipStartedAt.value = 0;
    return result;
  }

  /** 确认后重新打包成压缩包 */
  async function repackage(item: any): Promise<void> {
    const ok = await askConfirm(
      `重新打包 ${item.pair} · ${item.platform}`,
      `将把 ${relPath(item.dir)} 下的 ${item.files} 个文件（${fmtBytes(item.bytes)}）重新打包成 zip。`,
      '开始打包'
    );
    if (!ok) return;

    say('TIPS', `正在打包 ${item.pair} ${item.platform} ..`);
    const official = item.pair === '官方默认' || item.rel === 'Default';
    const custom = item.pair === 'Custom';
    const result = await runZipWithProgress({
      dir: item.dir,
      platform: item.platform,
      official,
      custom,
      region: item.region || '',
      base: official || custom ? '' : item.base,
      target: official || custom ? '' : item.target
    });

    if (!result) return;
    if (!result.ok) {
      toast({ key: 'zip', kind: 'err', title: '打包失败', text: result.error || '未知错误', timeout: 5000 });
      return;
    }
    say('SUCC', `已打包 ${basename(result.file)} ${fmtBytes(result.bytes)} 用时 ${result.seconds || 0}s`);
    toast({
      key: 'zip',
      kind: 'ok',
      title: '打包完成',
      text: `${basename(result.file)} · ${fmtBytes(result.bytes)} · ${result.seconds || 0}s`,
      timeout: 5000
    });
    await load();
  }

  /** 确认后删除整组资源文件 */
  async function removeResource(item: any): Promise<void> {
    const ok = await askConfirm(
      `删除 ${item.pair} · ${item.platform} 的资源`,
      `将永久删除 ${relPath(item.dir)} 下的 ${item.files} 个文件（${fmtBytes(item.bytes)}），之后需要重新下载。`
    );
    if (!ok) return;

    const result = await guard(() =>
      window.api.removeResource({
        pair: item.pair,
        region: item.region || '',
        platform: item.platform,
        dir: item.dir,
        root: outputDirSetting()
      })
    );
    if (!result) return;
    if (!result.ok) {
      toast({ key: 'rm', kind: 'err', title: '删除失败', text: result.error || '未知错误', timeout: 4000 });
      return;
    }
    say('SUCC', `已删除 ${item.pair} ${item.platform} ${result.files} 个文件 ${fmtBytes(result.bytes)}`);
    await load();
  }

  /** 确认后删除压缩包文件 */
  async function removePackage(item: any): Promise<void> {
    const ok = await askConfirm(
      `删除压缩包 ${item.name}`,
      `将删除 ${relPath(item.file)}（${fmtBytes(item.bytes)}），已下载的资源目录不受影响。`
    );
    if (!ok) return;

    const result = await guard(() => window.api.removePackage({ file: item.file }));
    if (!result) return;
    if (!result.ok) {
      toast({ key: 'rm', kind: 'err', title: '删除失败', text: result.error || '未知错误', timeout: 4000 });
      return;
    }
    say('SUCC', `已删除压缩包 ${relPath(result.file)}`);
    await load();
  }

  return {
    summary,
    loading,
    renderKey,
    zip,
    zipPercent,
    zipText,
    packPlatform,
    packagePlatforms,
    packagePlatformOptions,
    allPackages,
    visiblePackages,
    packGroups,
    setPackPlatform,
    load,
    refresh,
    openRoot,
    openDir,
    openPackageFile,
    openPackageFolder,
    openZipProgress,
    closeZipProgress,
    runZipWithProgress,
    repackage,
    removeResource,
    removePackage
  };
});
