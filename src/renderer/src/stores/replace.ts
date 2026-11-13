import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { say } from '../utils/format';
import { toast } from '../utils/toast';
import { askConfirm } from '../app/dialog';
import { throttleProgress } from '../utils/progress';
import { fmtBytes, fmtTime, toSlash } from '@shared/utils';
import { BACKUP_TARGETS, BACKUP_TARGET_KEYS, useGameStore } from './game';
import { useBackupStore } from './backup';

export const useReplaceStore = defineStore('replace', () => {
  const game = useGameStore();
  const backupStore = useBackupStore();

  const records = ref({
    open: false,
    mode: 'view' as 'view' | 'edit',
    items: [] as any[],
    text: '',
    error: '',
    busy: false
  });

  const replace = ref({
    open: false,
    persistent: false,
    patch: false,
    install: false,
    packageFile: '',
    packages: [] as any[],
    hint: '',
    hintBad: false,
    running: false,
    progress: { visible: false, pct: 0, text: '0%' }
  });

  const remove = ref({
    open: false,
    record: '',
    records: [] as any[],
    persistent: '',
    patch: '',
    install: '',
    running: false,
    progress: { visible: false, pct: 0, text: '0%' }
  });

  const packageOptions = computed(() =>
    replace.value.packages.map((item: any) => ({
      label: `${item.tag}.zip · ${fmtBytes(item.bytes)}`,
      value: item.file
    }))
  );

  const recordOptions = computed(() =>
    remove.value.records.map((item: any) => ({
      label: `${item.tag} · ${(item.targets || []).map((t: string) => `${BACKUP_TARGETS[t]} ${item.counts?.[t] || 0} 个`).join(' · ')} · ${fmtTime(item.time)}`,
      value: item.time,
      tag: item.tag || ''
    }))
  );

  /** 重置进度条显示状态 */
  function resetProgress(progress: { visible: boolean; pct: number; text: string }) {
    progress.visible = false;
    progress.pct = 0;
    progress.text = '0%';
  }

  /** 打开替换面板并载入资源包 */
  async function openReplace() {
    if (!game.requireGamePaths()) return;
    replace.value.persistent = false;
    replace.value.patch = false;
    replace.value.install = false;
    replace.value.open = true;
    resetProgress(replace.value.progress);
    await loadPackages();
  }

  /** 读取可选的替换资源包 */
  async function loadPackages() {
    const data = await guard(() => window.api.backupPackages());
    replace.value.packages = data ? data.items : [];
    if (!replace.value.packages.length) {
      replace.value.packageFile = '';
      replace.value.hint = '先到「查看资源」把资源打包成 zip，再回来替换';
      replace.value.hintBad = true;
      return;
    }
    replace.value.packageFile = replace.value.packages[0].file;
    replace.value.hintBad = false;
    await refreshHint();
  }

  /** 统计资源包可覆盖的文件 */
  async function refreshHint() {
    const file = replace.value.packageFile;
    if (!file) return;
    replace.value.hint = '正在读取资源包…';
    const matched = await guard(() => window.api.matchPackageFiles({ file }));
    if (!matched) return;
    if (!matched.ok) {
      replace.value.hint = matched.error || '读取失败';
      replace.value.hintBad = true;
      return;
    }
    const counts = BACKUP_TARGET_KEYS.map((key) => [key, (matched as any)[key]?.length || 0] as const);
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    replace.value.hintBad = total === 0;
    replace.value.hint =
      total === 0
        ? `包里 ${matched.total} 个文件在游戏目录中一个都没匹配到`
        : `将覆盖 ${total} 个文件 · ${counts.map(([key, n]) => `${BACKUP_TARGETS[key]} ${n} 个`).join(' · ')}` +
          (matched.missing.length ? `（另有 ${matched.missing.length} 个游戏里没有，会按类型补进去）` : '');
  }

  const paintReplaceProgress = throttleProgress(({ written = 0, total = 0 } = {}) => {
    const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
    replace.value.progress.visible = true;
    replace.value.progress.pct = pct;
    replace.value.progress.text = `${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
  });

  /** 按资源包覆盖所选目录 */
  async function runReplace() {
    if (replace.value.running) {
      await guard(() => window.api.abortReplace());
      return;
    }

    const targets: string[] = BACKUP_TARGET_KEYS.filter((key) => (replace.value as any)[key]);
    if (!targets.length) {
      toast({ key: 'replace', kind: 'err', title: '无法开始替换', text: '至少勾选一个要替换的目录', timeout: 5000 });
      return;
    }

    const packageFile = replace.value.packageFile;
    if (!packageFile) {
      toast({
        key: 'replace',
        kind: 'err',
        title: '无法开始替换',
        text: '请先在下拉里选一个反和谐资源包',
        timeout: 5000
      });
      return;
    }

    const tagText = replace.value.packages.find((item: any) => item.file === packageFile)?.tag || '';
    const ok = await askConfirm(
      '确认替换',
      `将用反和谐资源包 ${tagText} 覆盖所选目录里的对应文件。\n替换前建议先「备份资源包」，确定继续吗？`,
      '开始替换'
    );
    if (!ok) return;

    const offProgress = window.api.onReplaceProgress((_event: any, data: any) => paintReplaceProgress(data || {}));
    replace.value.running = true;
    resetProgress(replace.value.progress);
    const result = await guard(() => window.api.replaceResource({ targets, packageFile }));
    if (typeof offProgress === 'function') offProgress();
    replace.value.running = false;

    if (!result) {
      replace.value.open = false;
      return;
    }
    if (result.aborted) {
      toast({
        key: 'replace',
        kind: 'warn',
        title: '替换已中断',
        text: '已写入的文件保留，可再次执行补齐',
        timeout: 5000
      });
      resetProgress(replace.value.progress);
      return;
    }
    if (!result.ok) {
      toast({ key: 'replace', kind: 'err', title: '替换失败', text: result.error || '未知错误', timeout: 5000 });
      resetProgress(replace.value.progress);
      return;
    }

    replace.value.open = false;
    const summary = BACKUP_TARGET_KEYS.filter((key) => targets.includes(key))
      .map((key) => `${BACKUP_TARGETS[key]} ${result.counts?.[key] || 0} 个`)
      .join(' · ');
    toast({ key: 'replace', kind: 'ok', title: '替换完成', text: `${result.tag} · ${summary}`, timeout: 5000 });
    say('SUCC', `替换完成 ${result.tag} ${summary} ${fmtBytes(result.bytes)}`);
  }

  /** 读取替换记录并同步选择 */
  async function loadRecords() {
    const data: any = await guard(() => window.api.listReplaces());
    if (!data) return;
    records.value.items = data.items || [];
    records.value.text = JSON.stringify(data.items || [], null, 2);
    remove.value.records = data.items || [];
    if (!remove.value.record || !remove.value.records.some((item: any) => item.time === remove.value.record)) {
      remove.value.record = remove.value.records.length ? remove.value.records[0].time : '';
    }
    syncRemoveSelection();
  }

  /** 打开替换记录窗口 */
  async function openRecords(mode: 'view' | 'edit' = 'view') {
    records.value.open = true;
    records.value.mode = mode;
    records.value.error = '';
    await loadRecords();
  }

  /** 关闭替换记录窗口 */
  function closeRecords() {
    records.value.open = false;
  }

  /** 切换记录窗口的查看模式 */
  function setRecordsMode(mode: 'view' | 'edit') {
    records.value.mode = mode;
    records.value.error = '';
    if (mode === 'edit') records.value.text = JSON.stringify(records.value.items, null, 2);
  }

  /** 确认后删除单条替换记录 */
  async function deleteRecord(item: any) {
    const ok = await askConfirm(
      '删除替换记录',
      `将删除记录 ${item.tag || item.time}（只清登记，不动资源包）。\n${toSlash(item.file)}`,
      '确认删除'
    );
    if (!ok) return;
    const res: any = await guard(() => window.api.removeReplace({ time: item.time }));
    if (!res) return;
    if (!res.ok) {
      toast({ key: 'records', kind: 'err', title: '删除失败', text: res.error || '未知错误' });
      return;
    }
    toast({ key: 'records', kind: 'ok', title: '已删除记录', text: item.tag || item.time });
    say('TIPS', `已删除替换记录: ${item.tag || item.time}`);
    await loadRecords();
  }

  /** 清空全部替换记录 */
  async function clearRecords() {
    if (!records.value.items.length) {
      toast({ key: 'records', kind: 'warn', title: '没有可清理的记录', text: '替换记录已经是空的' });
      return;
    }
    const count = records.value.items.length;
    const ok = await askConfirm(
      '清空替换记录',
      `将删除全部 ${count} 条替换记录（只清登记，不动磁盘上的资源包）。`,
      '确认清空'
    );
    if (!ok) return;
    const res: any = await guard(() => window.api.clearReplaces());
    if (!res) return;
    if (!res.ok) {
      toast({ key: 'records', kind: 'err', title: '清空失败', text: res.error || '未知错误' });
      return;
    }
    toast({ key: 'records', kind: 'ok', title: '已清空替换记录', text: `删除 ${res.removed} 条` });
    say('TIPS', `已清空替换记录: ${res.removed} 条`);
    await loadRecords();
  }

  /** 校验并保存替换记录 */
  async function saveRecords() {
    let parsed: any;
    try {
      parsed = JSON.parse(records.value.text);
    } catch (err: any) {
      records.value.error = `JSON 不合法：${err && err.message}`;
      return;
    }
    if (!Array.isArray(parsed)) {
      records.value.error = '记录必须是一个数组（[ … ]）';
      return;
    }
    records.value.busy = true;
    const res: any = await guard(() => window.api.saveReplaces({ items: parsed }));
    records.value.busy = false;
    if (!res) return;
    if (!res.ok) {
      records.value.error = res.error || '保存失败';
      toast({ key: 'records', kind: 'err', title: '保存失败', text: res.error || '未知错误' });
      return;
    }
    records.value.error = '';
    toast({ key: 'records', kind: 'ok', title: '替换记录已保存', text: `${(res.items || []).length} 条` });
    say('SUCC', `替换记录已保存: ${(res.items || []).length} 条`);
    await loadRecords();
  }

  /** 打开记录对应的资源目录 */
  async function openRecordFile(item: any) {
    if (!item || !item.file) return;
    await guard(() => window.api.openDir(item.file));
  }

  /** 载入备份并打开移除面板 */
  async function openRemove() {
    if (!game.requireGamePaths()) return;
    const [backupData, replaceData] = await Promise.all([
      guard(() => window.api.listBackups()),
      guard(() => window.api.listReplaces())
    ]);
    if (!backupData || !replaceData) return;

    remove.value.records = replaceData.items;
    remove.value.record = replaceData.items.length ? replaceData.items[0].time : '';
    backupStore.backups = backupData.items;
    remove.value.persistent = '';
    remove.value.patch = '';
    remove.value.install = '';
    syncRemoveSelection();
    resetProgress(remove.value.progress);
    remove.value.open = true;
  }

  /** 按记录标签自动勾选备份 */
  function syncRemoveSelection() {
    const option = recordOptions.value.find((entry: any) => entry.value === remove.value.record);
    const tag = option?.tag || '';
    if (!tag) return;
    for (const target of BACKUP_TARGET_KEYS) {
      const match = backupStore
        .restoreOptions(target)
        .find((entry: any) => entry.scope === 'package' && entry.tag === tag);
      if (match) (remove.value as any)[target] = match.value;
    }
  }

  const paintRemoveProgress = throttleProgress(({ target = '', written = 0, total = 0 } = {}) => {
    const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
    remove.value.progress.visible = true;
    remove.value.progress.pct = pct;
    remove.value.progress.text = `${BACKUP_TARGETS[target] || target} ${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
  });

  /** 用备份还原目录并清除记录 */
  async function runRemove() {
    if (remove.value.running) return;

    const jobs: any[] = [];
    for (const target of BACKUP_TARGET_KEYS) {
      const file = (remove.value as any)[target];
      if (!file) continue;
      const option = backupStore.restoreOptions(target).find((entry: any) => entry.value === file);
      jobs.push({ file, target, scope: option?.scope || 'full' });
    }

    if (!remove.value.record) {
      toast({
        key: 'remove',
        kind: 'err',
        title: '无法移除',
        text: '还没有替换记录，先用「替换资源」应用一个包',
        timeout: 5000
      });
      return;
    }
    if (!jobs.length) {
      toast({ key: 'remove', kind: 'err', title: '无法移除', text: '至少为一个目录选择用于还原的备份', timeout: 5000 });
      return;
    }

    const tag = recordOptions.value.find((entry: any) => entry.value === remove.value.record)?.tag || '';
    const ok = await askConfirm(
      '确认移除',
      `将用选定的备份覆盖还原对应目录，撤销反和谐包 ${tag || ''} 的替换效果。确定继续吗？`,
      '开始移除'
    );
    if (!ok) return;

    remove.value.running = true;
    const offProgress = window.api.onRestoreProgress((_event: any, data: any) => paintRemoveProgress(data || {}));
    let allOk = true;
    for (const job of jobs) {
      const result = await guard(() => window.api.restoreBackup(job));
      if (result && result.ok) {
        say(
          'SUCC',
          `移除还原 · ${BACKUP_TARGETS[job.target]} · ${result.entries} 个文件 · ${fmtBytes(result.bytes)} · ${toSlash(result.dir)}`
        );
      } else {
        allOk = false;
        say('ERR', `移除还原失败 ${BACKUP_TARGETS[job.target]} ${result ? result.error : '未知错误'}`);
      }
    }
    if (typeof offProgress === 'function') offProgress();
    remove.value.running = false;

    if (allOk) {
      await guard(() => window.api.removeReplace({ time: remove.value.record }));
      toast({ key: 'remove', kind: 'ok', title: '移除完成', text: `反和谐包 ${tag || ''} 已还原`, timeout: 5000 });
    }
    resetProgress(remove.value.progress);
    remove.value.open = false;
  }

  return {
    replace,
    remove,
    records,
    packageOptions,
    recordOptions,
    openReplace,
    loadPackages,
    refreshHint,
    runReplace,
    openRemove,
    syncRemoveSelection,
    runRemove,
    openRecords,
    closeRecords,
    setRecordsMode,
    loadRecords,
    deleteRecord,
    clearRecords,
    saveRecords,
    openRecordFile
  };
});
