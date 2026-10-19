import { guard } from '../app/api'
import { $ } from '../utils/dom'
import { say } from '../utils/format'
import { throttleProgress } from '../utils/progress'
import { dismissToast, toast } from '../utils/toast'
import { askConfirm } from '../app/dialog'
import { requireGamePaths } from './launcher'
import { fmtBytes } from '@shared/utils'

export let replaceRunning = false;

export const replaceNotify = (kind, title, text, timeout = 5000) =>
  toast({ key: 'replace', kind, title, text, timeout });

export function resetReplaceProgress() {
  $('replace-progress').hidden = true;
  $('replace-progress-fill').style.width = '0%';
  $('replace-progress-text').textContent = '0%';
}

export const paintReplaceProgress = throttleProgress(({ written = 0, total = 0 } = {}) => {
  const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  $('replace-progress').hidden = false;
  $('replace-progress-fill').style.width = `${pct}%`;
  $('replace-progress-text').textContent = `${pct}% · ${fmtBytes(written)}${total > 0 ? ` / ${fmtBytes(total)}` : ''}`;
});

export async function loadReplacePackages() {
  const select = $('replace-package');
  const hint = $('replace-package-hint');
  const data = await guard(() => window.api.backupPackages());
  select.textContent = '';
  if (!data || !data.items.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '（打包目录里还没有反和谐资源包）';
    select.appendChild(empty);
    hint.textContent = '先到「查看资源」把资源打包成 zip，再回来替换';
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
  await refreshReplaceHint();
}

export async function refreshReplaceHint() {
  const file = $('replace-package').value;
  const hint = $('replace-package-hint');
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
  hint.textContent = total === 0
    ? `包里 ${matched.total} 个文件在游戏目录中一个都没匹配到`
    : `将覆盖 ${total} 个文件 · Persistent_Store ${matched.persistent.length} 个 · InstallResource ${matched.install.length} 个`
      + (matched.missing.length ? `（另有 ${matched.missing.length} 个游戏里没有，会按类型补进去）` : '');
}

$('replace-package').addEventListener('change', refreshReplaceHint);

$('btn-replace-modal').addEventListener('click', () => {
  if (!requireGamePaths()) return;
  $('replace-persistent').checked = false;
  $('replace-install').checked = false;
  dismissToast('replace');
  resetReplaceProgress();
  $('replace-modal').hidden = false;
  loadReplacePackages();
});

$('btn-replace-cancel').addEventListener('click', () => {
  $('replace-modal').hidden = true;
});

$('btn-replace-run').addEventListener('click', async () => {
  const button = $('btn-replace-run');

  if (replaceRunning) {
    button.disabled = true;
    await guard(() => window.api.abortReplace());
    button.disabled = false;
    return;
  }

  const targets = [];
  if ($('replace-persistent').checked) targets.push('persistent');
  if ($('replace-install').checked) targets.push('install');
  if (!targets.length) {
    return replaceNotify('err', '无法开始替换', '至少勾选一个要替换的目录');
  }

  const packageFile = $('replace-package').value;
  if (!packageFile) {
    return replaceNotify('err', '无法开始替换', '请先在下拉里选一个反和谐资源包');
  }

  const tagText = $('replace-package').selectedOptions[0].textContent.split(' · ')[0].replace(/\.zip$/, '');
  const ok = await askConfirm(
    '确认替换',
    `将用反和谐资源包 ${tagText} 覆盖所选目录里的对应文件。\n替换前建议先「备份资源包」，确定继续吗？`,
    '开始替换',
  );
  if (!ok) return;

  const offProgress = window.api.onReplaceProgress((_event, data) => paintReplaceProgress(data || {}));
  replaceRunning = true;
  button.textContent = '中断';
  resetReplaceProgress();
  const result = await guard(() => window.api.replaceResource({ targets, packageFile }));
  if (typeof offProgress === 'function') offProgress();
  replaceRunning = false;
  button.textContent = '开始替换';

  if (!result) {
    $('replace-modal').hidden = true;
    return;
  }
  if (result.aborted) {
    replaceNotify('warn', '替换已中断', '已写入的文件保留，可再次执行补齐');
    resetReplaceProgress();
    return;
  }
  if (!result.ok) {
    replaceNotify('err', '替换失败', result.error || '未知错误');
    resetReplaceProgress();
    return;
  }

  $('replace-modal').hidden = true;
  toast({
    key: 'replace',
    kind: 'ok',
    title: '替换完成',
    text: `${result.tag} · Persistent_Store ${result.counts.persistent} 个 · InstallResource ${result.counts.install} 个`,
    timeout: 5000,
  });
  say('SUCC', `替换完成 · ${result.tag} · Persistent_Store ${result.counts.persistent} 个 · InstallResource ${result.counts.install} 个 · ${fmtBytes(result.bytes)}`);
});
