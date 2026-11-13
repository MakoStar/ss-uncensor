<script setup lang="ts">
import { useBackupStore } from '../../../stores/backup';
import Modal from '../../ui/modal.vue';

const backup = useBackupStore();
</script>

<template>
  <Modal id="restore-modal" v-show="backup.restore.open" title="还原备份" @close="backup.restore.open = false">
    <p class="modal-note">
      为每个目录挑一份备份；方括号里是这份备份的范围：
      <strong>[完整]</strong> 会先清空目标目录再解压，
      <strong>[反和谐包]</strong> 只覆盖包内的那几个文件，其余文件不动。 留空表示不还原该目录。
    </p>

    <div class="restore-row">
      <span class="path-label">Persistent_Store</span>
      <select id="restore-persistent" v-model="backup.restore.persistent">
        <option v-for="item in backup.restoreOptions('persistent')" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>
    <div class="restore-row">
      <span class="path-label">InstallResource</span>
      <select id="restore-install" v-model="backup.restore.install">
        <option v-for="item in backup.restoreOptions('install')" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>
    <div class="restore-row">
      <span class="path-label">Patch_Store</span>
      <select id="restore-patch" v-model="backup.restore.patch">
        <option v-for="item in backup.restoreOptions('patch')" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>

    <p class="modal-error" v-if="backup.restore.error">{{ backup.restore.error }}</p>

    <div class="progress" id="restore-progress" v-show="backup.restore.progress.visible">
      <div class="progress-bar">
        <span id="restore-progress-fill" :style="{ width: `${backup.restore.progress.pct}%` }"></span>
      </div>
      <span class="progress-text" id="restore-progress-text">{{ backup.restore.progress.text }}</span>
    </div>

    <template #actions>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-restore-cancel" @click="backup.restore.open = false">取消</button>
        <button
          class="btn primary"
          id="btn-restore-run"
          :disabled="backup.restore.running"
          @click="backup.runRestore()"
        >
          {{ backup.restore.running ? '还原中…' : '开始还原' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
