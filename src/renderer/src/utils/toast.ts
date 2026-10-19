import { $ } from './dom'
import { state } from '../app/state'

export const TOAST_ICON = { info: 'i', ok: '✓', warn: '!', err: '×' };

export const toasts = new Map();

/* 淡出后移除一条通知 */
export function removeToast(el) {
  if (!el.isConnected || el.classList.contains('out')) return;
  for (const [key, entry] of toasts) {
    if (entry.el === el) toasts.delete(key);
  }
  el.classList.remove('in');
  el.classList.add('out');
  setTimeout(() => el.remove(), 220);
}

/* 弹出一条右上角通知 */
export function toast({ title = '', text = '', kind = 'info', key = '', timeout = 4000 } = {}) {
  const box = $('toasts');
  let entry = key ? toasts.get(key) : null;

  if (!entry) {
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.innerHTML = `
      <span class="toast-icon"></span>
      <div class="toast-body"><b></b><span></span></div>`;
    box.appendChild(el);
    entry = { el, timer: null };
    if (key) toasts.set(key, entry);
    requestAnimationFrame(() => el.classList.add('in'));
  }

  entry.el.className = `toast toast-${kind} in`;
  entry.el.querySelector('.toast-icon').textContent = TOAST_ICON[kind] || 'i';
  entry.el.querySelector('.toast-body b').textContent = title;
  entry.el.querySelector('.toast-body span').textContent = text;

  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => removeToast(entry.el), timeout);
  return entry.el;
}

/* 按 key 关闭通知 */
export function dismissToast(key) {
  const entry = toasts.get(key);
  if (!entry) return;
  toasts.delete(key);
  clearTimeout(entry.timer);
  removeToast(entry.el);
}

/* 用通知展示当前配置快照 */
export function toastConfig() {
  if (!state.configText) return;
  toast({ key: 'config', kind: 'info', title: '当前配置', text: state.configText, timeout: 3200 });
}
