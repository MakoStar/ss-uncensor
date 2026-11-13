import { createApp } from 'vue';
import './styles/index.css';
import App from './App.vue';
import { pinia } from './stores/pinia';
import { useMetaStore } from './stores/meta';
import { useBackgroundStore } from './stores/background';
import { useGameStore } from './stores/game';
import { useBackupStore } from './stores/backup';
import { useSettingsStore } from './stores/settings';
import { state } from './app/state';
import { toast } from './utils/toast';
import { installSoundEffects } from './stores/sound';

createApp(App).use(pinia).mount('#app');

window.api.onConfigChanged((payload) => {
  const next = payload && payload.config;
  if (!next) return;
  state.settings = { ...next };
  useMetaStore().syncConfigText();
  useSettingsStore().fillForm();
  useGameStore().applyConfig(next);

  try {
    const backup = useBackupStore();
    if (backup.backupsVisible) backup.loadBackups(true);
  } catch (err) {}

  if (!(payload && payload.silent)) {
    toast({
      key: 'config-hot',
      kind: 'info',
      title: '配置已重新载入',
      text: '检测到配置文件变更，已立即生效',
      timeout: 3000
    });
  }
});

installSoundEffects();

void (async () => {
  try {
    await useMetaStore().init();
    await useBackgroundStore().apply();
  } catch (err) {
    console.error('bootstrap failed', err);
  }
})();
