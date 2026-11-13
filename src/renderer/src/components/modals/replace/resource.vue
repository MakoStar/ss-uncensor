<script setup lang="ts">
import { useReplaceStore } from '../../../stores/replace';
import Modal from '../../ui/modal.vue';

const replace = useReplaceStore();
</script>

<template>
  <Modal id="replace-modal" v-show="replace.replace.open" title="替换资源" @close="replace.replace.open = false">
    <p class="modal-note">
      用反和谐资源包覆盖游戏目录里的对应文件；
      <strong>替换前建议先「备份资源包」</strong>，方便随时还原。
    </p>

    <div class="backup-opts">
      <label class="opt-card">
        <input type="checkbox" id="replace-persistent" v-model="replace.replace.persistent" />
        <span class="opt-text"><b>Persistent_Store</b><i>PS · Persistent_Store/AssetBundles</i></span>
      </label>
      <label class="opt-card">
        <input type="checkbox" id="replace-install" v-model="replace.replace.install" />
        <span class="opt-text"><b>InstallResource</b><i>IR · xtlr_Data/StreamingAssets/InstallResource</i></span>
      </label>
      <label class="opt-card">
        <input type="checkbox" id="replace-patch" v-model="replace.replace.patch" />
        <span class="opt-text"><b>Patch_Store</b><i>PT · Patch_Store/AssetBundles</i></span>
      </label>
    </div>

    <div class="dest-picker">
      <div class="scope-label">反和谐资源包</div>
      <div class="scope-package">
        <select id="replace-package" v-model="replace.replace.packageFile" @change="replace.refreshHint()">
          <option v-for="item in replace.packageOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <p class="scope-hint" :class="{ bad: replace.replace.hintBad }" id="replace-package-hint">
          {{ replace.replace.hint }}
        </p>
      </div>
    </div>

    <div class="progress" id="replace-progress" v-show="replace.replace.progress.visible">
      <div class="progress-bar">
        <span id="replace-progress-fill" :style="{ width: `${replace.replace.progress.pct}%` }"></span>
      </div>
      <span class="progress-text" id="replace-progress-text">{{ replace.replace.progress.text }}</span>
    </div>

    <template #actions>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-replace-cancel" @click="replace.replace.open = false">取消</button>
        <button class="btn primary" id="btn-replace-run" @click="replace.runReplace()">
          {{ replace.replace.running ? '中断' : '开始替换' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
