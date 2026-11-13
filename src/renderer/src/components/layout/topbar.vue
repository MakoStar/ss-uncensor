<script setup lang="ts">
import { useUiStore, TABS } from '../../stores/ui';
import { useVersionStore } from '../../stores/version';
import { useUncensorStore } from '../../stores/uncensor';
import { useResourcesStore } from '../../stores/resources';
import { useBrowseStore } from '../../stores/browse';
import { useGameStore } from '../../stores/game';
import { useSettingsStore } from '../../stores/settings';

const ui = useUiStore();
const browse = useBrowseStore();
const version = useVersionStore();
const uncensor = useUncensorStore();
const resources = useResourcesStore();
const game = useGameStore();
const settings = useSettingsStore();

const LABELS: Record<string, string> = {
  fetch: '抓取清单',
  browse: '清单预览',
  version: '版本标识',
  diff: '差异对比',
  uncensor: '资源下载',
  resources: '查看资源',
  replace: '替换资源',
  settings: '设置'
};

function select(tab: string) {
  if (ui.activeTab === tab) return;
  ui.setTab(tab);

  for (const panel of document.querySelectorAll<HTMLElement>('#legacy-panels .panel')) {
    panel.classList.toggle('active', panel.id === `panel-${tab}`);
  }

  if (tab === 'version') version.load();
  if (tab === 'uncensor') uncensor.loadLists();
  if (tab === 'resources') resources.load();
  if (tab === 'browse') browse.refresh();
  if (tab === 'replace') game.load();
  if (tab === 'settings') {
    settings.fillForm();
    settings.loadDiag();
  }
}
</script>

<template>
  <header class="topbar">
    <nav class="tabs" id="tabs">
      <button
        v-for="tab in TABS"
        :key="tab"
        class="tab"
        :class="{ active: ui.activeTab === tab }"
        :data-tab="tab"
        @click="select(tab)"
      >
        {{ LABELS[tab] }}
      </button>
    </nav>
  </header>
</template>
