<script setup lang="ts">
import Modal from '../../ui/modal.vue';
import { useSettingsStore } from '../../../stores/settings';
import { relPath } from '../../../utils/format';
import { toSlash } from '@shared/utils';

const settings = useSettingsStore();
</script>

<template>
  <Modal id="output-modal" v-show="settings.outputModal.open" title="输出目录" @close="settings.closeOutputModal()">
    <div class="dialog-body">
      <p class="modal-note">
        Manifest / Metadata / Generated / Uncensor 都放在这个根目录下；换目录后已抓的清单不会自动搬过去。
      </p>

      <div class="scope-label">保存位置</div>
      <div class="dest-opts" id="output-modal-opts">
        <label class="opt-card" :class="{ active: settings.outputModal.mode === 'default' }">
          <input
            type="radio"
            name="output-mod"
            value="default"
            v-model="settings.outputModal.mode"
            id="output-mode-default"
          />
          <span class="opt-text"><b>使用默认</b><i>工具根目录下的 output</i></span>
        </label>
        <label class="opt-card" :class="{ active: settings.outputModal.mode === 'custom' }">
          <input
            type="radio"
            name="output-mod"
            value="custom"
            v-model="settings.outputModal.mode"
            id="output-mode-custom"
          />
          <span class="opt-text"><b>自定义目录</b><i>自己指定一个根目录</i></span>
        </label>
      </div>

      <div class="dest-custom" id="output-modal-path-row">
        <input
          type="text"
          id="output-dir-path"
          class="path-input"
          readonly
          :title="settings.outputModalPath"
          :value="relPath(settings.outputModalPath) || settings.outputModalPath"
        />
        <button
          v-if="settings.outputModal.mode === 'custom'"
          class="btn ghost"
          id="btn-output-dir-pick"
          @click="settings.pickOutputDir()"
        >
          浏览…
        </button>
      </div>

      <p class="hint" id="output-modal-hint">
        默认目录：<code class="mono">{{ toSlash(settings.defaultOutputDir) || 'output' }}</code>
      </p>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-output-dir-cancel" @click="settings.closeOutputModal()">取消</button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-output-dir-save" @click="settings.saveOutputModal()">保存并生效</button>
      </div>
    </template>
  </Modal>
</template>
