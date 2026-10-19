import { guard } from '../app/api'
import { $ } from '../utils/dom'
import { cleanError, say } from '../utils/format'
import { throttleProgress } from '../utils/progress'
import { toast } from '../utils/toast'
import { askConfirm } from '../app/dialog'
import { fillRestoreSelect } from './backup'
import { BACKUP_TARGETS, requireGamePaths } from './launcher'
import { fmtBytes, fmtTime, toSlash } from '@shared/utils'

export let removeRunning = false;

/* 移除反和谐操作的统一通知 */
export const removeNotify = (kind, title, text, timeout = 5000) =>
  toast({ key: 'remove', kind, title, text, timeout });

/* 重置移除进度条 */
export function resetRemoveProgress() {
  $('remove-progress').hidden = true;
  $('remove-progress-fill').style.width = '0%';
  $('remove-progress-text').textContent = '0%';
}

/* 移除进度限频绘制入口 */
export const paintRemoveProgress = throttleProgress(({ target = '', written = 0, total = 0 } = {}) => {
  const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  $('remove-progress').hidden = false;
  $('remove-progress-fill').style.width = `${pct}%`;
  $('remove-progress-text').textContent =
    `${BACKUP_TARGETS[target] || target} ${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
});

/* 按替换记录自动预选同标签备份 */
export function syncRemoveSelection() {
  const option = $('remove-record').selectedOptions[0];
  const tag = option ? option.dataset.tag : '';
  if (!tag) return;
  for (const id of ['remove-persistent', 'remove-install']) {
    const select = $(id);
    const match = [...select.options].find((opt) => opt.dataset.scope === 'package' && opt.dataset.tag === tag);
    if (match) select.value = match.value;
  }
}

$('remove-record').addEventListener('change', syncRemoveSelection);

$('btn-remove-modal').addEventListener('click', async () => {
  if (!requireGamePaths()) return;
  const [backupData, replaceData] = await Promise.all([
    guard(() => window.api.listBackups()),
    guard(() => window.api.listReplaces()),
  ]);
  if (!backupData || !replaceData) return;

  const recordSelect = $('remove-record');
  recordSelect.textContent = '';
  if (!replaceData.items.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '（还没有替换记录，先用「替换资源」应用一个包）';
    recordSelect.appendChild(empty);
  } else {
    for (const item of replaceData.items) {
      const option = document.createElement('option');
      option.value = item.time;
      option.dataset.tag = item.tag || '';
      const parts = (item.targets || []).map((t) => `${BACKUP_TARGETS[t]} ${item.counts?.[t] || 0} 个`).join(' · ');
      option.textContent = `${item.tag} · ${parts} · ${fmtTime(item.time)}`;
      recordSelect.appendChild(option);
    }
  }

  fillRestoreSelect('remove-persistent', backupData.items.filter((item) => item.target === 'persistent'));
  fillRestoreSelect('remove-install', backupData.items.filter((item) => item.target === 'install'));
  syncRemoveSelection();
  resetRemoveProgress();
  $('remove-modal').hidden = false;
});

$('btn-remove-cancel').addEventListener('click', () => {
  $('remove-modal').hidden = true;
});

$('btn-remove-run').addEventListener('click', async () => {
  if (removeRunning) return;
  const jobs = [];
  const pick = (id, target) => {
    const select = $(id);
    const option = select.selectedOptions[0];
    if (!option || !option.value) return;
    jobs.push({ file: option.value, target, scope: option.dataset.scope || 'full' });
  };
  pick('remove-persistent', 'persistent');
  pick('remove-install', 'install');

  const recordTime = $('remove-record').value;
  if (!recordTime) {
    return removeNotify('err', '无法移除', '还没有替换记录，先用「替换资源」应用一个包');
  }
  if (!jobs.length) {
    return removeNotify('err', '无法移除', '至少为一个目录选择用于还原的备份');
  }

  const recordOption = $('remove-record').selectedOptions[0];
  const tag = recordOption ? recordOption.dataset.tag : '';
  const ok = await askConfirm(
    '确认移除',
    `将用选定的备份覆盖还原对应目录，撤销反和谐包 ${tag || ''} 的替换效果。确定继续吗？`,
    '开始移除',
  );
  if (!ok) return;

  const button = $('btn-remove-run');
  removeRunning = true;
  button.disabled = true;
  button.textContent = '移除中…';
  const offProgress = window.api.onRestoreProgress((_event, data) => paintRemoveProgress(data || {}));
  let allOk = true;
  for (const job of jobs) {

    const result = await guard(() => window.api.restoreBackup(job));
    if (result && result.ok) {
      say('SUCC', `移除还原 · ${BACKUP_TARGETS[job.target]} · ${result.entries} 个文件 · ${fmtBytes(result.bytes)} · ${toSlash(result.dir)}`);
    } else {
      allOk = false;
      say('ERR', `移除还原失败 · ${BACKUP_TARGETS[job.target]} · ${result ? result.error : '未知错误'}`);
    }
  }
  if (typeof offProgress === 'function') offProgress();
  removeRunning = false;
  button.disabled = false;
  button.textContent = '开始移除';

  if (allOk) {
    await guard(() => window.api.removeReplace({ time: recordTime }));
    toast({ key: 'remove', kind: 'ok', title: '移除完成', text: `反和谐包 ${tag || ''} 已还原`, timeout: 5000 });
  }
  resetRemoveProgress();
  $('remove-modal').hidden = true;
});
