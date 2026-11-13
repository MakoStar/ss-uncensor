import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { state } from '../app/state';
import { say, relPath } from '../utils/format';
import { toast } from '../utils/toast';
import { askConfirm } from '../app/dialog';
import { throttleProgress } from '../utils/progress';
import { fmtBytes, fmtTime, toSlash } from '@shared/utils';
import { BACKUP_TARGETS, BACKUP_TARGET_KEYS, useGameStore } from './game';

export interface BackupItem {
  name: string;
  target: string;
  scope: string;
  tag?: string;
  bytes: number;
  time: number | string;
  file: string;
  packageFile?: string;
  channel?: string;
  missing?: boolean;
}

export const useBackupStore = defineStore('backup', () => {
  const game = useGameStore();

  const backups = ref<BackupItem[]>([]);
  const backupsVisible = ref(true);
  const backupsLoading = ref(false);
  const missingCount = ref(0);
  const renderKey = ref(0);

  const detail = ref<{ open: boolean; item: BackupItem | null }>({ open: false, item: null });

  const backup = ref({
    open: false,
    persistent: false,
    patch: false,
    install: false,
    scope: 'full' as 'full' | 'package',
    destMode: 'default' as 'default' | 'custom',
    dest: '',
    packageFile: '',
    packages: [] as any[],
    hint: '',
    hintBad: false,
    running: false,
    progress: { visible: false, pct: 0, text: '0%' }
  });

  const restore = ref({
    open: false,
    persistent: '',
    patch: '',
    install: '',
    error: '',
    running: false,
    progress: { visible: false, pct: 0, text: '0%' }
  });

  const packageOptions = computed(() =>
    backup.value.packages.map((item: any) => ({
      label: `${item.tag}.zip · ${fmtBytes(item.bytes)}`,
      value: item.file
    }))
  );

  const restoreOptions = computed(() => (target: string) => {
    const list = backups.value
      .filter((item) => item.target === target && !item.missing)
      .map((item) => ({
        label: `[${channelLabel(item.channel)}] ${item.scope === 'package' ? `[${item.tag}] ` : '[完整] '}${item.name} · ${fmtBytes(item.bytes)} · ${fmtTime(item.time)}`,
        value: item.file,
        scope: item.scope === 'package' ? 'package' : 'full',
        tag: item.tag || '',
        channel: item.channel || 'unknown'
      }));
    return [{ label: '（不还原）', value: '', scope: '', tag: '', channel: '' }, ...list];
  });

  /** 拉取备份列表并统计缺失项 */
  async function loadBackups(force: boolean = false): Promise<void> {
    if (!backupsVisible.value && !force) return;
    backupsLoading.value = true;
    const startedAt = Date.now();
    const data = await guard(() => window.api.listBackups());
    const rest = 260 - (Date.now() - startedAt);
    if (rest > 0) await new Promise((resolve) => setTimeout(resolve, rest));
    backupsLoading.value = false;
    if (!data) return;
    backups.value = data.items;
    missingCount.value = Number(data.missing || 0);
    renderKey.value += 1;
  }

  /** 打开备份面板并载入资源包 */
  async function openBackup(): Promise<void> {
    if (!game.requireGamePaths()) return;
    backup.value.persistent = false;
    backup.value.patch = false;
    backup.value.install = false;

    const savedDir = (state.settings && state.settings.backupDir) || '';
    backup.value.destMode = savedDir ? 'custom' : 'default';
    backup.value.dest = savedDir;
    backup.value.open = true;
    resetProgress(backup.value.progress);
    await loadPackages();
  }

  /** 读取可选的备份资源包列表 */
  async function loadPackages(): Promise<void> {
    const data = await guard(() => window.api.backupPackages());
    backup.value.packages = data ? data.items : [];
    if (!backup.value.packages.length) {
      backup.value.packageFile = '';
      backup.value.hint = '先到「查看资源」把资源打包成 zip，再回来按包备份';
      backup.value.hintBad = true;
      return;
    }
    backup.value.packageFile = backup.value.packages[0].file;
    backup.value.hintBad = false;
    await refreshPackageHint();
  }

  /** 解析资源包并生成匹配提示 */
  async function refreshPackageHint(): Promise<void> {
    const file = backup.value.packageFile;
    if (!file) return;
    backup.value.hint = '正在读取资源包…';
    const matched = await guard(() => window.api.matchPackageFiles({ file }));
    if (!matched) return;
    if (!matched.ok) {
      backup.value.hint = matched.error || '读取失败';
      backup.value.hintBad = true;
      return;
    }
    const counts = BACKUP_TARGET_KEYS.map((key) => [key, (matched as any)[key]?.length || 0] as const);
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    backup.value.hintBad = total === 0;
    if (total === 0) {
      backup.value.hint = `包里 ${matched.total} 个文件在游戏目录中一个都没匹配到`;
      return;
    }

    const tagText = backup.value.packages.find((item: any) => item.file === file)?.tag || '';
    const line1 =
      `将备份 ${total} 个文件 · ${counts.map(([key, n]) => `${BACKUP_TARGETS[key]} ${n} 个`).join(' · ')}` +
      (matched.missing.length ? `（另有 ${matched.missing.length} 个游戏里没有）` : '');
    const line2 = `备份文件会标记为 ${tagText}`;
    backup.value.hint = `${line1}\n${line2}`;
  }

  /** 重置进度条的显示状态 */
  function resetProgress(progress: { visible: boolean; pct: number; text: string }): void {
    progress.visible = false;
    progress.pct = 0;
    progress.text = '0%';
  }

  const paintBackupProgress = throttleProgress(({ written = 0, total = 0 } = {}) => {
    const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
    backup.value.progress.visible = true;
    backup.value.progress.pct = pct;
    backup.value.progress.text = `${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
  });

  /** 执行备份或中止正在备份 */
  async function runBackup(): Promise<void> {
    if (backup.value.running) {
      await guard(() => window.api.abortBackup());
      return;
    }

    const targets: string[] = BACKUP_TARGET_KEYS.filter((key) => (backup.value as any)[key]);
    if (!targets.length) {
      toast({ key: 'backup', kind: 'err', title: '无法开始备份', text: '至少勾选一个要备份的目录', timeout: 5000 });
      return;
    }

    const custom = backup.value.destMode === 'custom';
    const dest = custom ? backup.value.dest.trim() : '';
    if (custom && !dest) {
      toast({
        key: 'backup',
        kind: 'err',
        title: '无法开始备份',
        text: '请先点「浏览…」挑一个自定义保存位置',
        timeout: 5000
      });
      return;
    }

    const packageFile = backup.value.scope === 'package' ? backup.value.packageFile : '';
    if (backup.value.scope === 'package' && !packageFile) {
      toast({
        key: 'backup',
        kind: 'err',
        title: '无法开始备份',
        text: '请先在下拉里选一个反和谐资源包',
        timeout: 5000
      });
      return;
    }

    const offProgress = window.api.onBackupProgress((_event: any, data: any) => paintBackupProgress(data || {}));
    backup.value.running = true;
    resetProgress(backup.value.progress);
    const result = await guard(() => window.api.backupResource({ targets, dest, packageFile }));
    if (typeof offProgress === 'function') offProgress();
    backup.value.running = false;

    if (!result) {
      backup.value.open = false;
      return;
    }
    if (result.aborted) {
      toast({
        key: 'backup',
        kind: 'warn',
        title: '备份已中断',
        text: '打包中的文件没有保存，原目录不受影响',
        timeout: 5000
      });
      resetProgress(backup.value.progress);
      return;
    }
    if (!result.ok) {
      toast({ key: 'backup', kind: 'err', title: '备份失败', text: result.error || '未知错误', timeout: 5000 });
      resetProgress(backup.value.progress);
      return;
    }

    state.settings = { ...(state.settings || {}), backupDir: custom ? result.dest : '' };
    backup.value.open = false;
    for (const item of result.backups) {
      const label = item.scope === 'package' ? `反和谐包 ${item.tag}` : '完整目录';
      say(
        'SUCC',
        `备份完成 · ${channelLabel(result.channel)} · ${BACKUP_TARGETS[item.target]} · ${label} · ${item.files} 个文件 · ${fmtBytes(item.bytes)} · ${toSlash(item.file)}`
      );
    }
    toast({
      key: 'backup',
      kind: 'ok',
      title: '备份完成',
      text: `${result.tag ? `已按反和谐包 ${result.tag} 备份` : '完整备份'} ${result.backups.length} 份 · 保存到 ${relPath(result.dest)}`,
      timeout: 5000
    });
    await loadBackups(true);
  }

  /** 选择备份文件的保存目录 */
  async function pickDest(): Promise<void> {
    const result = await guard(() => window.api.selectDirectory({ title: '选择备份保存位置' }));
    if (result && result.path) backup.value.dest = result.path;
  }

  /** 打开还原面板并载入备份 */
  async function openRestore(): Promise<void> {
    if (!game.requireGamePaths()) return;
    const data = await guard(() => window.api.listBackups());
    if (!data) return;
    backups.value = data.items;
    restore.value.persistent = '';
    restore.value.patch = '';
    restore.value.install = '';
    restore.value.error = '';
    resetProgress(restore.value.progress);
    restore.value.open = true;
  }

  const paintRestoreProgress = throttleProgress(({ target = '', written = 0, total = 0 } = {}) => {
    const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
    restore.value.progress.visible = true;
    restore.value.progress.pct = pct;
    restore.value.progress.text = `${BACKUP_TARGETS[target] || target} ${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
  });

  /** 按所选备份依次还原目录 */
  async function runRestore(): Promise<void> {
    const jobs = collectJobs(restore.value as any);
    if (!jobs.length) {
      restore.value.error = '至少为一个目录选择备份包';
      return;
    }

    const allScoped = jobs.every((job: any) => job.scope === 'package');
    const ok = await askConfirm(
      '确认还原',
      allScoped
        ? '按反和谐包备份只覆盖包内的那几个文件，目标目录其余文件保持不动，确定继续吗？'
        : '完整备份会先清空目标目录，再把备份包内容解压进去，确定继续吗？',
      '还原'
    );
    if (!ok) return;

    restore.value.running = true;
    const offProgress = window.api.onRestoreProgress((_event: any, data: any) => paintRestoreProgress(data || {}));
    for (const job of jobs) {
      const result = await guard(() => window.api.restoreBackup(job));
      if (result && result.ok) {
        const how = result.partial ? '按包覆盖' : '清空后完整还原';
        say(
          'SUCC',
          `还原完成 · ${BACKUP_TARGETS[job.target]} · ${how} · ${result.entries} 个文件 · ${fmtBytes(result.bytes)} · ${toSlash(result.dir)}`
        );
      } else if (result) {
        say('ERR', `还原失败 ${BACKUP_TARGETS[job.target]} ${result.error}`);
      }
    }
    if (typeof offProgress === 'function') offProgress();
    restore.value.running = false;
    resetProgress(restore.value.progress);
    restore.value.open = false;
  }

  /** 收集待还原的目录备份任务 */
  function collectJobs(selection: Record<string, string>): any[] {
    const jobs: any[] = [];
    for (const target of BACKUP_TARGET_KEYS) {
      const file = selection[target];
      if (!file) continue;
      const option = restoreOptions.value(target).find((entry: any) => entry.value === file);
      jobs.push({ file, target, scope: option?.scope || 'full' });
    }
    return jobs;
  }

  /** 取备份目录的中文名称 */
  function targetLabel(target: string): string {
    return BACKUP_TARGETS[target] || target;
  }

  const CHANNEL_LABEL: Record<string, string> = { official: '官服', bili: 'B服', unknown: '未知渠道' };
  const CHANNEL_DIR: Record<string, string> = { official: 'official', bili: 'bilibili', unknown: 'other' };

  /** 把渠道键转成中文名 */
  function channelLabel(key?: string): string {
    return CHANNEL_LABEL[String(key || '')] || CHANNEL_LABEL.unknown;
  }

  const defaultDest = computed(() => {
    const dirs = (state.meta && (state.meta as any).dirs) || {};
    const pkg = dirs.package || '';
    if (!pkg) return '';
    return `${toSlash(pkg)}/backup/${CHANNEL_DIR[game.channel.key] || CHANNEL_DIR.unknown}`;
  });

  /** 打开单个备份的详情弹窗 */
  function openDetail(item: BackupItem): void {
    if (!item) return;
    detail.value = { open: true, item };
  }

  /** 关闭备份详情弹窗 */
  function closeDetail(): void {
    detail.value.open = false;
  }

  /** 确认后删除指定备份文件 */
  async function deleteBackup(item: BackupItem): Promise<void> {
    const ok = await askConfirm(
      '删除备份',
      `将永久删除 ${item.name}（${fmtBytes(item.bytes)}）。\n${toSlash(item.file)}`,
      '确认删除'
    );
    if (!ok) return;
    const result = await guard(() => window.api.deleteBackup({ file: item.file }));
    if (!result) return;
    if (!result.ok) {
      toast({ key: 'backup', kind: 'err', title: '删除失败', text: result.error || '未知错误', timeout: 5000 });
      return;
    }
    toast({
      key: 'backup',
      kind: 'ok',
      title: '已删除备份',
      text: `${result.name} · 释放 ${fmtBytes(result.bytes)}`,
      timeout: 4000
    });
    if (detail.value.open && detail.value.item && detail.value.item.file === item.file) closeDetail();
    await loadBackups(true);
  }

  /** 切换备份列表的显示状态 */
  async function toggleBackups(): Promise<void> {
    backupsVisible.value = !backupsVisible.value;
    if (backupsVisible.value) await loadBackups(true);
  }

  /** 用系统程序打开备份文件 */
  async function openFile(item: any): Promise<void> {
    if (!item || !item.file) return;
    await guard(() => window.api.openPath(item.file));
    say('TIPS', `已打开文件: ${relPath(item.file)}`);
  }

  /** 在资源管理器中定位目录 */
  async function openDir(item: any): Promise<void> {
    if (!item || !item.file) return;
    await guard(() => window.api.openDir(item.file));
    say('TIPS', `已打开目录: ${relPath(item.file)}`);
  }

  return {
    backups,
    backupsVisible,
    backupsLoading,
    missingCount,
    renderKey,
    detail,
    defaultDest,
    backup,
    restore,
    packageOptions,
    restoreOptions,
    loadBackups,
    openBackup,
    loadPackages,
    refreshPackageHint,
    runBackup,
    pickDest,
    openRestore,
    runRestore,
    collectJobs,
    targetLabel,
    channelLabel,
    openDetail,
    closeDetail,
    deleteBackup,
    openFile,
    openDir,
    toggleBackups
  };
});
