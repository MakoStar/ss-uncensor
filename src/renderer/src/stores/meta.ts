import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { state } from '../app/state';
import { $ } from '../utils/dom';
import { toSlash } from '@shared/utils';

export const useMetaStore = defineStore('meta', () => {
  const meta = computed(() => state.meta);
  const settings = computed(() => state.settings);
  const picked = computed<Set<string>>(() => state.picked);

  const platform = computed(() => (state.meta ? state.meta.platform : 'win'));
  const platforms = computed(() => (state.meta ? state.meta.platforms : []));
  const regions = computed(() => (state.meta ? state.meta.regions : []));
  const fetched = computed(() => (state.meta ? state.meta.fetched : []));
  const fetcherOk = computed(() => Boolean(state.meta && state.meta.fetcherOk));
  const hasManifests = computed(() => fetched.value.length > 0);

  const versionPath = ref('');

  const allPicked = computed(() => picked.value.size === 0 || picked.value.size === regions.value.length);
  const effectiveRegions = computed(() => (allPicked.value ? [] : [...picked.value]));

  /** 加载元数据并初始化状态 */
  async function init() {
    const next: any = await window.api.meta();
    state.meta = next;
    state.settings = { ...next.config };
    state.picked = new Set(next.config.regions || []);
    if (state.picked.size > 0 && state.picked.size === next.regions.length) state.picked.clear();
    versionPath.value = toSlash(next.versionFile || '');
    syncConfigText();
  }

  /** 合并主进程返回的元数据 */
  function applyMeta(next: any) {
    if (!next) return;
    state.meta = { ...(state.meta || {}), ...next };
    versionPath.value = toSlash(next.versionFile || '');
  }

  /** 按平台重新加载元数据 */
  async function load(platformName?: string) {
    const next: any = await window.api.meta(platformName ? { platform: platformName } : undefined);
    state.meta = next;
    if (!state.settings) state.settings = { ...next.config };
    versionPath.value = toSlash(next.versionFile || '');
    syncConfigText();
  }

  /** 刷新状态栏的抓取文案 */
  function syncConfigText() {
    const list = fetched.value;
    state.configText = list.length ? `${platform.value} · 已抓取 ${list.join(' ')}` : `${platform.value} · 未抓取`;
  }

  /** 切换平台并重新加载元数据 */
  function setPlatform(name: string) {
    return load(name);
  }

  /** 切换某个区域的选中状态 */
  function toggleRegion(region: string) {
    if (state.picked.has(region)) {
      state.picked.delete(region);
    } else {
      state.picked.add(region);
      if (state.picked.size === regions.value.length) state.picked.clear();
    }
    syncConfigText();
  }

  /** 把区域选择重置为全部 */
  function pickAll() {
    state.picked = new Set<string>();
    syncConfigText();
  }

  return {
    meta,
    settings,
    picked,
    platform,
    platforms,
    regions,
    fetched,
    fetcherOk,
    hasManifests,
    allPicked,
    effectiveRegions,
    versionPath,
    init,
    load,
    applyMeta,
    setPlatform,
    toggleRegion,
    pickAll,
    syncConfigText
  };
});
