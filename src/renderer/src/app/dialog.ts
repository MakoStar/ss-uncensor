import { $ } from '../utils/dom'

/* 弹出错误提示框 */
export function showError(title, text) {
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  $('error-modal').hidden = false;
}

$('btn-error-ok').addEventListener('click', () => { $('error-modal').hidden = true; });
$('error-modal').addEventListener('click', (event) => {
  if (event.target === $('error-modal')) $('error-modal').hidden = true;
});

/* 弹出二次确认框并返回用户选择 */
export function askConfirm(title, text, okLabel = '确认删除') {
  return new Promise((resolve) => {
    $('confirm-modal-title').textContent = title;
    $('confirm-text').textContent = text;
    $('btn-confirm-ok').textContent = okLabel;

    const done = (value) => {
      $('confirm-modal').hidden = true;
      $('btn-confirm-ok').removeEventListener('click', onOk);
      $('btn-confirm-cancel').removeEventListener('click', onCancel);
      resolve(value);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);

    $('btn-confirm-ok').addEventListener('click', onOk);
    $('btn-confirm-cancel').addEventListener('click', onCancel);
    $('confirm-modal').hidden = false;
  });
}
