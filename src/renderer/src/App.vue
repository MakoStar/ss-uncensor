<script setup lang="ts">
import { onMounted, watch } from 'vue';
import Topbar from './components/layout/topbar.vue';
import Fetch from './components/panels/fetch.vue';
import Browse from './components/panels/browse.vue';
import Version from './components/panels/version.vue';
import Diff from './components/panels/diff.vue';
import Uncensor from './components/panels/uncensor.vue';
import Resources from './components/panels/resources.vue';
import Replace from './components/panels/replace.vue';
import Settings from './components/panels/settings.vue';
import Dialog from './components/ui/dialog.vue';
import Toast from './components/ui/toast.vue';
import Zip from './components/modals/zip.vue';
import { installTips } from './utils/tip';
import { useUiStore } from './stores/ui';

const ui = useUiStore();

let switchTimer = 0;
watch(
  () => ui.activeTab,
  () => {
    document.body.classList.add('switching');
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => document.body.classList.remove('switching'), 480);
  }
);

onMounted(() => installTips());
</script>

<template>
  <Topbar />

  <main id="panels">
    <Fetch />
    <Browse />
    <Version />
    <Diff />
    <Uncensor />
    <Resources />
    <Replace />
    <Settings />
  </main>

  <Dialog />
  <Toast />

  <Zip />
</template>
