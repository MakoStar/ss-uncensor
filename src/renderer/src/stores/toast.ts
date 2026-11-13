import { defineStore } from 'pinia';
import { ref } from 'vue';
import { state } from '../app/state';
import { playSound, type SoundKind } from './sound';

export const TOAST_ICON = { info: 'i', ok: '✓', warn: '!', err: '×' };

const TOAST_SOUND: Record<string, SoundKind> = { ok: 'success', err: 'error', warn: 'warn' };

export interface ToastItem {
  id: string;
  kind: string;
  title: string;
  text: string;
  out: boolean;
}

const TOAST_LIFE_MIN = 400;
const TOAST_LIFE_MAX = 600;
const TOAST_LIFE_STEP = 100;

const TOAST_OUT_MS = 120;

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([]);
  const timers = new Map<string, number>();
  let seq = 0;

  /** 显示提示并按需复用同键项 */
  function show({
    title = '',
    text = '',
    kind = 'info',
    key = ''
  }: { title?: string; text?: string; kind?: string; key?: string } = {}): string {
    const id = key || `toast-${++seq}`;
    const existing = items.value.find((item) => item.id === id);

    const sound = TOAST_SOUND[kind];
    if (existing) {
      const wasTerminal = Boolean(TOAST_SOUND[existing.kind]);
      existing.kind = kind;
      existing.title = title;
      existing.text = text;
      existing.out = false;
      if (sound && !wasTerminal) playSound(sound);
    } else {
      items.value.push({ id, kind, title, text, out: false });
      if (sound) playSound(sound);
    }

    if (timers.has(id)) {
      clearTimeout(timers.get(id) as number);
      timers.delete(id);
    }
    const index = items.value.findIndex((item) => item.id === id);
    const life = Math.min(TOAST_LIFE_MAX, TOAST_LIFE_MIN + Math.max(0, index) * TOAST_LIFE_STEP);
    timers.set(
      id,
      window.setTimeout(() => dismiss(id), life)
    );
    try {
      (window as any).__lastToast = { id, kind, title, text, at: Date.now(), index, life };
    } catch (err) {}
    return id;
  }

  /** 标记并移除指定提示 */
  function dismiss(id: string): void {
    const item = items.value.find((entry) => entry.id === id);
    if (!item || item.out) return;
    item.out = true;
    timers.delete(id);
    window.setTimeout(() => {
      items.value = items.value.filter((entry) => entry.id !== id);
    }, TOAST_OUT_MS);
  }

  try {
    (window as any).__showToast = show;
  } catch (err) {}

  /** 用当前配置文案弹出提示 */
  function toastConfig(): void {
    if (!state.configText) return;
    show({ key: 'config', kind: 'info', text: state.configText });
  }
  return { items, show, dismiss, toastConfig };
});
