import { defineStore } from 'pinia';
import { ref } from 'vue';

export type SoundKind =
  | 'click'
  | 'select'
  | 'toggle'
  | 'switch'
  | 'open'
  | 'close'
  | 'success'
  | 'error'
  | 'warn'
  | 'info';

const STORAGE_KEY = 'sound.enabled';

const MASTER_GAIN = 0.65;
const MAX_VOICES = 6;
const MIN_GAP_MS = 25;
const KIND_GAP_MS = 60;

/** 读取音效开关的本地偏好 */
function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

const enabled = ref(readPref());

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** 创建带压限器的音频上下文 */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.14;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** 播放一段固定频率的短音 */
function blip(freq: number, at: number, dur: number, type: OscillatorType = 'sine', level = 1): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.22 * level, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** 播放一段扫频音 */
function sweep(from: number, to: number, at: number, dur: number, type: OscillatorType = 'sine', level = 1): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.2 * level, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

const RECIPES: Record<SoundKind, () => number> = {
  click: () => {
    blip(700, 0, 0.055, 'sine', 0.9);
    return 60;
  },
  select: () => {
    blip(880, 0, 0.05, 'triangle', 0.8);
    blip(1245, 0.02, 0.06, 'sine', 0.45);
    return 90;
  },
  toggle: () => {
    sweep(560, 820, 0, 0.08, 'sine', 0.9);
    return 90;
  },
  switch: () => {
    sweep(520, 700, 0, 0.11, 'sine', 0.8);
    return 120;
  },
  open: () => {
    sweep(500, 760, 0, 0.1, 'sine', 0.8);
    return 110;
  },
  close: () => {
    sweep(760, 500, 0, 0.09, 'sine', 0.7);
    return 100;
  },
  success: () => {
    blip(659.25, 0, 0.1, 'sine', 0.9);
    blip(987.77, 0.08, 0.16, 'sine', 0.8);
    return 240;
  },
  error: () => {
    blip(196, 0, 0.16, 'sawtooth', 0.5);
    blip(146.83, 0.02, 0.2, 'sawtooth', 0.45);
    return 220;
  },
  warn: () => {
    blip(440, 0, 0.09, 'triangle', 0.8);
    blip(440, 0.12, 0.12, 'triangle', 0.7);
    return 240;
  },
  info: () => {
    blip(784, 0, 0.09, 'sine', 0.7);
    return 100;
  }
};

const activeUntil: number[] = [];
let lastAny = 0;
const lastByKind = new Map<SoundKind, number>();

/** 统计当前仍在发声的音效数 */
function activeVoices(now: number): number {
  let drop = 0;
  while (drop < activeUntil.length && activeUntil[drop] <= now) drop++;
  if (drop) activeUntil.splice(0, drop);
  return activeUntil.length;
}

/** 按种类播放一次音效 */
export function playSound(kind: SoundKind): void {
  if (!enabled.value) return;

  const now = performance.now();
  if (now - lastAny < MIN_GAP_MS) return;
  const prev = lastByKind.get(kind) ?? 0;
  if (now - prev < KIND_GAP_MS) return;
  if (activeVoices(now) >= MAX_VOICES) return;

  lastAny = now;
  lastByKind.set(kind, now);

  try {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    activeUntil.push(now + (RECIPES[kind]?.() ?? 0));
  } catch {}
}

const COMPLETE_DEDUPE_MS = 400;

/** 播放任务完成的提示音 */
export function playComplete(kind: SoundKind = 'success'): void {
  if (!enabled.value) return;
  const prev = lastByKind.get(kind) ?? 0;
  if (performance.now() - prev < COMPLETE_DEDUPE_MS) return;
  playSound(kind);
}

/** 保存音效开关偏好 */
export function setSoundEnabled(value: boolean): void {
  enabled.value = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {}
  if (value) playSound('toggle');
}

const TEXT_FIELD = [
  'input[type="text"]',
  'input[type="search"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
  'textarea',
  '[contenteditable="true"]'
].join(', ');

const cursorCache = new WeakMap<Element, boolean>();

/** 判断元素是否带手型光标 */
function hasPointerCursor(el: HTMLElement): boolean {
  const cached = cursorCache.get(el);
  if (cached !== undefined) return cached;

  let node: HTMLElement | null = el;
  let hit = false;
  for (let depth = 0; node && depth < 6; depth++) {
    const cursor = getComputedStyle(node).cursor;
    if (cursor === 'pointer') {
      hit = true;
      break;
    }
    if (cursor !== 'auto' && cursor !== 'default' && cursor !== 'inherit') break;
    node = node.parentElement;
  }
  cursorCache.set(el, hit);
  return hit;
}

/** 按点击目标挑选音效种类 */
export function resolveClickSound(target: HTMLElement): SoundKind | null {
  if (target.closest('[disabled], [aria-disabled="true"]')) return null;

  const tab = target.closest<HTMLElement>('.tab');
  if (tab) return tab.classList.contains('active') ? null : 'switch';

  if (target.closest('.dd-item')) return 'select';
  if (target.closest('.dd-toggle')) return 'open';
  if (target.closest('.chip')) return 'select';

  if (target.closest('input[type="checkbox"], input[type="radio"]')) return 'toggle';
  const label = target.closest('label');
  if (label?.querySelector('input[type="checkbox"], input[type="radio"]')) return 'toggle';

  if (target.closest(TEXT_FIELD)) return null;
  if (target.closest('select')) return 'open';

  if (target.closest('a[href], [role="link"]')) return 'open';

  if (target.classList.contains('modal-mask')) return 'close';

  if (
    target.closest(
      'button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], summary, .btn'
    )
  )
    return 'click';
  return hasPointerCursor(target) ? 'click' : null;
}

let installed = false;

let routingWired = false;

/** 监听音频设备变化并复位上下文 */
function installOutputRouting(): void {
  if (routingWired) return;
  routingWired = true;

  try {
    navigator.mediaDevices?.addEventListener('devicechange', () => {
      try {
        void ctx?.close();
      } catch {}
      ctx = null;
      master = null;
    });
  } catch {}

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state === 'suspended') void ctx.resume();
  });
}

/** 安装全局点击与按键音效监听 */
export function installSoundEffects(): void {
  if (installed) return;
  installed = true;
  installOutputRouting();

  function handle(event: PointerEvent | KeyboardEvent): void {
    if (!enabled.value) return;

    if (event instanceof KeyboardEvent) {
      if (event.repeat) return;
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    } else if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    try {
      const kind = resolveClickSound(target);
      if (kind) playSound(kind);
    } catch {}
  }
  document.addEventListener('pointerdown', handle, { capture: true, passive: true });
  document.addEventListener('keydown', handle, true);
}

export const useSoundStore = defineStore('sound', () => {
  /** 设置音效开关 */
  function set(value: boolean): void {
    setSoundEnabled(value);
  }
  /** 切换音效开关 */
  function toggle(): void {
    setSoundEnabled(!enabled.value);
  }
  /** 播放指定种类音效 */
  function play(kind: SoundKind): void {
    playSound(kind);
  }
  return { enabled, set, toggle, play };
});
