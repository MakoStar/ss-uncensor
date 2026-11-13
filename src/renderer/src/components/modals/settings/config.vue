<script setup lang="ts">
import Modal from '../../ui/modal.vue';
import { useSettingsStore } from '../../../stores/settings';
import { toSlash } from '@shared/utils';

const settings = useSettingsStore();
</script>

<template>
  <Modal id="config-modal" v-show="settings.configModal.open" title="查看配置" wide @close="settings.closeConfig()">
    <div class="dialog-body">
      <div class="vr-folder">
        <code class="mono vr-path" id="config-file-path" :title="settings.configModal.file">{{
          toSlash(settings.configModal.file) || '(尚未定位到配置文件)'
        }}</code>
        <button class="btn ghost" id="btn-config-open-dir" @click="settings.openConfigFile()">打开文件位置</button>
        <button
          class="btn ghost"
          id="btn-config-reload"
          :class="{ busy: settings.configModal.reloading }"
          :disabled="settings.configModal.reloading"
          @click="settings.loadConfigText()"
        >
          {{ settings.configModal.reloading ? '载入中…' : '重新载入' }}
        </button>
      </div>

      <p class="modal-note">
        这里就是落盘的原始内容，改完点「保存到文件」会立即写回并套用；JSON 不合法会被拒绝，不会把配置写坏。
      </p>

      <textarea
        id="config-editor"
        class="config-editor"
        spellcheck="false"
        :value="settings.configModal.text"
        @input="settings.configModal.text = ($event.target as HTMLTextAreaElement).value"
      ></textarea>

      <div v-if="settings.configModal.error" class="dialog-text error" id="config-error">
        {{ settings.configModal.error }}
      </div>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost danger" id="btn-config-close" @click="settings.closeConfig()">关闭</button>
        <span class="spacer"></span>
        <button
          class="btn primary"
          id="btn-config-save"
          :disabled="settings.configModal.busy"
          @click="settings.saveConfig()"
        >
          {{ settings.configModal.busy ? '保存中…' : '保存到文件' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
