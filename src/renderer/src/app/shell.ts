import { $ } from '../utils/dom'
import { cleanError, say } from '../utils/format'
import { closeClear } from '../views/fetch'
import { closeVersionDialog, loadDiag, renderSettings } from '../views/settings'
import { loadVersion } from '../views/version'
import { loadDiffLists } from '../views/uncensor'
import { loadResources } from '../views/resources'
import { refreshBrowse } from '../views/browse'
import { loadGameDir } from '../views/launcher'

/* 页签切换：切面板并按需拉数据 */
document.getElementById('tabs').addEventListener('click', (event) => {
  const button = (event.target as any).closest('.tab');
  if (!button) return;

  for (const tab of document.querySelectorAll<HTMLElement>('.tab')) tab.classList.toggle('active', tab === button);
  for (const panel of document.querySelectorAll<HTMLElement>('.panel')) panel.classList.toggle('active', panel.id === `panel-${button.dataset.tab}`);

  const tab = button.dataset.tab;
  if (tab === 'version') loadVersion();
  if (tab === 'uncensor') loadDiffLists();
  if (tab === 'resources') loadResources();
  if (tab === 'browse') refreshBrowse();
  if (tab === 'replace') loadGameDir();
  if (tab === 'settings') { renderSettings(); loadDiag(); }
});

/* Esc 关闭最上层弹窗 */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!$('clear-modal').hidden) closeClear();
  if (!$('error-modal').hidden) $('error-modal').hidden = true;
  if (!$('version-modal').hidden) closeVersionDialog();
  if (!$('result-modal').hidden) $('result-modal').hidden = true;
  if (!$('json-modal').hidden) $('json-modal').hidden = true;
  if (!$('dl-modal').hidden) $('dl-modal').hidden = true;
});

/* 兜底捕获界面异常，写进运行日志 */
window.addEventListener('error', (event) => say('ERRO', `界面异常：${cleanError(event.message)}`));
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.message ? event.reason.message : event.reason;
  say('ERRO', `界面异步异常：${cleanError(reason)}`);
});
