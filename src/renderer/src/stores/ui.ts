import { defineStore } from 'pinia';
import { ref } from 'vue';

export const TABS = ['fetch', 'browse', 'version', 'diff', 'uncensor', 'resources', 'replace', 'settings'] as const;

export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<string>('fetch');

  /** 按合法页签切换当前标签 */
  function setTab(tab: string) {
    if (TABS.includes(tab as any)) activeTab.value = tab;
  }

  /** 判断当前是否不在抓取页 */
  const legacyActive = () => activeTab.value !== 'fetch';
  return { activeTab, setTab, legacyActive };
});
