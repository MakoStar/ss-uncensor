import { guard } from '../app/api'
import { $ } from '../utils/dom'
import { say } from '../utils/format'
import { throttleProgress } from '../utils/progress'
import { state } from '../app/state'
import { dismissToast, toast } from '../utils/toast'
import { askConfirm } from '../app/dialog'
import { BACKUP_TARGETS, requireGamePaths } from './launcher'
import { fmtBytes, fmtTime, toSlash } from '@shared/utils'

/* 把时间格式化成本地字符串 */

export const backupModal = {
  get custom() { return document.querySelector('input[name="backup-dest-mode"]:checked').value === 'custom'; },
  get scoped() { return document.querySelector('input[name="backup-scope"]:checked').value === 'package'; },
};

/* 同步备份弹窗的保存位置与备份范围显隐 */
export function syncBackupDestMode() {
  $('dest-custom-row').hidden = !backupModal.custom;
  for (const card of document.querySelectorAll('#backup-modal .dest-opts .opt-card')) {
    card.classList.toggle('active', card.querySelector('input').checked);
  }

  $('scope-package-row').hidden = !backupModal.scoped;
}

/* 载入反和谐资源包下拉并预读匹配结果 */
export async function loadBackupPackages() {
  const select = $('backup-package');
  const hint = $('backup-package-hint');
  const data = await guard(() => window.api.backupPackages());
  select.textContent = '';
  if (!data || !data.items.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '（打包目录里还没有反和谐资源包）';
    select.appendChild(empty);
    hint.textContent = '先到「查看资源」把资源打包成 zip，再回来按包备份';
    hint.classList.add('bad');
    return;
  }
  for (const item of data.items) {
    const option = document.createElement('option');
    option.value = item.file;
    option.textContent = `${item.tag}.zip · ${fmtBytes(item.bytes)}`;
    select.appendChild(option);
  }
  hint.classList.remove('bad');
  await refreshPackageHint();
}

/* 刷新资源包命中情况的提示文字 */
export async function refreshPackageHint() {
  const file = $('backup-package').value;
  const hint = $('backup-package-hint');
  if (!file) return;
  hint.textContent = '正在读取资源包…';
  const matched = await guard(() => window.api.matchPackageFiles({ file }));
  if (!matched) return;
  if (!matched.ok) {
    hint.textContent = matched.error || '读取失败';
    hint.classList.add('bad');
    return;
  }
  const total = matched.persistent.length + matched.install.length;
  hint.classList.toggle('bad', total === 0);
  if (total === 0) {
    hint.textContent = `包里 ${matched.total} 个文件在游戏目录中一个都没匹配到`;
    return;
  }

  const tagText = $('backup-package').selectedOptions[0].textContent.split(' · ')[0].replace(/\.zip$/, '');
  const line1 = `将备份 ${total} 个文件 · Persistent_Store ${matched.persistent.length} 个 · InstallResource ${matched.install.length} 个`
    + (matched.missing.length ? `（另有 ${matched.missing.length} 个游戏里没有）` : '');
  const line2 = `备份文件会标记为 ${tagText}`;
  hint.textContent = `${line1}\n${line2}`;
}

$('backup-package').addEventListener('change', refreshPackageHint);

for (const radio of document.querySelectorAll('input[name="backup-scope"]')) {
  radio.addEventListener('change', () => {
    syncBackupDestMode();
    if (backupModal.scoped && !$('backup-package').options.length) loadBackupPackages();
    else if (backupModal.scoped) refreshPackageHint();
  });
}

$('btn-backup-modal').addEventListener('click', () => {
  if (!requireGamePaths()) return;
  $('backup-persistent').checked = false;
  $('backup-install').checked = false;

  const savedDir = (state.settings && state.settings.backupDir) || '';
  document.querySelector('input[name="backup-dest-mode"][value="custom"]').checked = Boolean(savedDir);
  $('backup-dest').value = savedDir;
  dismissToast('backup');
  resetBackupProgress();
  syncBackupDestMode();
  $('backup-modal').hidden = false;

  loadBackupPackages();
});

for (const radio of document.querySelectorAll('input[name="backup-dest-mode"]')) {
  radio.addEventListener('change', syncBackupDestMode);
}

for (const id of ['backup-persistent', 'backup-install']) {
  $(id).addEventListener('change', () => dismissToast('backup'));
}

$('btn-backup-cancel').addEventListener('click', () => {
  $('backup-modal').hidden = true;
});

$('btn-backup-dest').addEventListener('click', async () => {
  const result = await guard(() => window.api.selectDirectory({ title: '选择备份保存位置' }));
  if (result && result.path) $('backup-dest').value = result.path;
});

/* 重置备份进度条 */
export function resetBackupProgress() {
  const bar = $('backup-progress');
  bar.hidden = true;
  $('backup-progress-fill').style.width = '0%';
  $('backup-progress-text').textContent = '0%';
}

/* 按已写字节更新备份进度条 */
export function setBackupProgress({ written = 0, total = 0 } = {}) {
  const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  $('backup-progress').hidden = false;
  $('backup-progress-fill').style.width = `${pct}%`;
  $('backup-progress-text').textContent = `${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
}

export let backupRunning = false;

export const backupNotify = (kind, title, text, timeout = 5000) =>
  toast({ key: 'backup', kind, title, text, timeout });

$('btn-backup-run').addEventListener('click', async () => {
  const button = $('btn-backup-run');

  if (backupRunning) {
    button.disabled = true;
    await guard(() => window.api.abortBackup());
    button.disabled = false;
    return;
  }

  const targets = [];
  if ($('backup-persistent').checked) targets.push('persistent');
  if ($('backup-install').checked) targets.push('install');

  if (!targets.length) {
    return backupNotify('err', '无法开始备份', '至少勾选一个要备份的目录');
  }

  const custom = backupModal.custom;
  const dest = custom ? $('backup-dest').value.trim() : '';
  if (custom && !dest) {
    return backupNotify('err', '无法开始备份', '请先点「浏览…」挑一个自定义保存位置');
  }

  const packageFile = backupModal.scoped ? $('backup-package').value : '';
  if (backupModal.scoped && !packageFile) {
    return backupNotify('err', '无法开始备份', '请先在下拉里选一个反和谐资源包');
  }

  const offProgress = window.api.onBackupProgress((_event, data) => paintBackupProgress(data || {}));
  backupRunning = true;
  button.textContent = '中断';
  resetBackupProgress();
  const result = await guard(() => window.api.backupResource({ targets, dest, packageFile }));
  if (typeof offProgress === 'function') offProgress();
  backupRunning = false;
  button.textContent = '开始备份';

  if (!result) {
    $('backup-modal').hidden = true;
    return;
  }
  if (result.aborted) {
    backupNotify('warn', '备份已中断', '打包中的文件没有保存，原目录不受影响');
    resetBackupProgress();
    return;
  }
  if (!result.ok) {
    backupNotify('err', '备份失败', result.error || '未知错误');
    resetBackupProgress();
    return;
  }

  state.settings = { ...(state.settings || {}), backupDir: custom ? result.dest : '' };
  $('backup-modal').hidden = true;
  for (const item of result.backups) {
    const label = item.scope === 'package' ? `反和谐包 ${item.tag}` : '完整目录';
    say('SUCC', `备份完成 · ${BACKUP_TARGETS[item.target]} · ${label} · ${item.files} 个文件 · ${fmtBytes(item.bytes)} · ${toSlash(item.file)}`);
  }
  toast({
    key: 'backup',
    kind: 'ok',
    title: '备份完成',
    text: result.tag
      ? `已按反和谐包 ${result.tag} 备份 ${result.backups.length} 份`
      : `完整备份 ${result.backups.length} 份`,
    timeout: 5000,
  });
  loadBackups();
});

export let backupsVisible = false;

/** 载入并渲染备份列表 */
export async function loadBackups(force = false) {
  if (!backupsVisible && !force) return;
  const data = await guard(() => window.api.listBackups());
  if (!data) return;

  $('backup-card').hidden = false;
  const tbody = $('backup-table').tBodies[0];
  tbody.textContent = '';

  if (!data.items.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'dim';
    td.textContent = '还没有备份记录';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const item of data.items) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.className = 'mono';
    nameTd.textContent = item.name;
    tr.appendChild(nameTd);

    const targetTd = document.createElement('td');
    targetTd.textContent = BACKUP_TARGETS[item.target] || item.target;
    tr.appendChild(targetTd);

    const tagTd = document.createElement('td');
    const tagChip = document.createElement('span');
    tagChip.className = item.scope === 'package' && item.tag ? 'tag-cell' : 'tag-cell plain';
    tagChip.textContent = item.scope === 'package' && item.tag ? item.tag : '完整';
    if (item.scope === 'package' && item.tag) tagChip.title = `对应反和谐资源包：${item.packageFile || item.tag}`;
    else tagChip.title = '完整目录备份（整个目标目录）';
    tagTd.appendChild(tagChip);
    tr.appendChild(tagTd);

    const sizeTd = document.createElement('td');
    sizeTd.className = 'mono';
    sizeTd.textContent = fmtBytes(item.bytes);
    tr.appendChild(sizeTd);

    const timeTd = document.createElement('td');
    timeTd.className = 'mono dim';
    timeTd.textContent = fmtTime(item.time);
    tr.appendChild(timeTd);

    const pathTd = document.createElement('td');
    pathTd.className = 'mono dim backup-path';
    pathTd.textContent = toSlash(item.file);
    pathTd.title = toSlash(item.file);
    tr.appendChild(pathTd);

    const opTd = document.createElement('td');
    const openBtn = document.createElement('button');
    openBtn.className = 'btn ghost';
    openBtn.textContent = '打开目录';
    openBtn.addEventListener('click', () => window.api.openDir(item.file));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn ghost danger';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      const ok = await askConfirm(
        '删除备份',
        `将永久删除 ${item.name}（${fmtBytes(item.bytes)}）。\n${toSlash(item.file)}`,
        '确认删除',
      );
      if (!ok) return;
      const result = await guard(() => window.api.deleteBackup({ file: item.file }));
      if (!result) return;
      if (!result.ok) {
        toast({ key: 'backup', kind: 'err', title: '删除失败', text: result.error || '未知错误', timeout: 5000 });
        return;
      }
      toast({ key: 'backup', kind: 'ok', title: '已删除备份', text: `${result.name} · 释放 ${fmtBytes(result.bytes)}`, timeout: 4000 });
      loadBackups(true);
    });

    const opBox = document.createElement('div');
    opBox.className = 'row-ops';
    opBox.appendChild(openBtn);
    opBox.appendChild(delBtn);
    opTd.appendChild(opBox);
    tr.appendChild(opTd);

    tbody.appendChild(tr);
  }
}

$('btn-view-backups').addEventListener('click', () => {
  backupsVisible = !backupsVisible;
  if (backupsVisible) loadBackups(true);
  else $('backup-card').hidden = true;
});

$('btn-backup-refresh').addEventListener('click', () => loadBackups(true));

/* 填充还原弹窗的备份下拉 */
export function fillRestoreSelect(id, items) {
  const select = $(id);
  select.textContent = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.dataset.scope = '';
  empty.textContent = '（不还原）';
  select.appendChild(empty);
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.file;

    option.dataset.scope = item.scope === 'package' ? 'package' : 'full';
    option.dataset.tag = item.tag || '';
    option.textContent = `${item.scope === 'package' ? `[${item.tag}] ` : '[完整] '}${item.name} · ${fmtBytes(item.bytes)} · ${fmtTime(item.time)}`;
    select.appendChild(option);
  }
}

$('btn-restore-modal').addEventListener('click', async () => {
  if (!requireGamePaths()) return;
  const data = await guard(() => window.api.listBackups());
  if (!data) return;
  fillRestoreSelect('restore-persistent', data.items.filter((item) => item.target === 'persistent'));
  fillRestoreSelect('restore-install', data.items.filter((item) => item.target === 'install'));
  $('restore-error').hidden = true;
  resetRestoreProgress();
  $('restore-modal').hidden = false;
});

$('btn-restore-cancel').addEventListener('click', () => {
  $('restore-modal').hidden = true;
});

/* 重置还原进度条 */
export function resetRestoreProgress() {
  $('restore-progress').hidden = true;
  $('restore-progress-fill').style.width = '0%';
  $('restore-progress-text').textContent = '0%';
}

/* 按解压字节更新还原进度条 */
export function setRestoreProgress({ target = '', written = 0, total = 0 } = {}) {
  const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  $('restore-progress').hidden = false;
  $('restore-progress-fill').style.width = `${pct}%`;
  $('restore-progress-text').textContent =
    `${BACKUP_TARGETS[target] || target} ${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
}

/* 备份进度限频绘制入口 */
export const paintBackupProgress = throttleProgress(setBackupProgress);
/* 还原进度限频绘制入口 */
export const paintRestoreProgress = throttleProgress(setRestoreProgress);

$('btn-restore-run').addEventListener('click', async () => {
  const jobs = [];
  const pick = (id, target) => {
    const select = $(id);
    const option = select.selectedOptions[0];
    if (!option || !option.value) return;
    jobs.push({ file: option.value, target, scope: option.dataset.scope || 'full' });
  };
  pick('restore-persistent', 'persistent');
  pick('restore-install', 'install');

  const err = $('restore-error');
  if (!jobs.length) {
    err.textContent = '至少为一个目录选择备份包';
    err.hidden = false;
    return;
  }

  const allScoped = jobs.every((job) => job.scope === 'package');
  const ok = await askConfirm(
    '确认还原',
    allScoped
      ? '按反和谐包备份只覆盖包内的那几个文件，目标目录其余文件保持不动，确定继续吗？'
      : '完整备份会先清空目标目录，再把备份包内容解压进去，确定继续吗？',
    '还原',
  );
  if (!ok) return;

  const button = $('btn-restore-run');
  button.disabled = true;
  button.textContent = '还原中…';

  const offProgress = window.api.onRestoreProgress((_event, data) => paintRestoreProgress(data || {}));
  for (const job of jobs) {

    const result = await guard(() => window.api.restoreBackup(job));
    if (result && result.ok) {
      const how = result.partial ? '按包覆盖' : '清空后完整还原';
      say('SUCC', `还原完成 · ${BACKUP_TARGETS[job.target]} · ${how} · ${result.entries} 个文件 · ${fmtBytes(result.bytes)} · ${toSlash(result.dir)}`);
    } else if (result) {
      say('ERR', `还原失败 · ${BACKUP_TARGETS[job.target]} · ${result.error}`);
    }
  }
  if (typeof offProgress === 'function') offProgress();
  button.disabled = false;
  button.textContent = '开始还原';
  resetRestoreProgress();
  $('restore-modal').hidden = true;
});
