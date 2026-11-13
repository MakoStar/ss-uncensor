<script setup lang="ts">
import { useReplaceStore } from '../../../stores/replace';
import { useBackupStore } from '../../../stores/backup';
import Modal from '../../ui/modal.vue';

const replace = useReplaceStore();
const backup = useBackupStore();
</script>

<template>
  <Modal id="remove-modal" v-show="replace.remove.open" title="移除反和谐" @close="replace.remove.open = false">
    <p class="modal-note">
      挑一条替换记录，再用备份包把对应目录的文件还原回去；
      <strong>有同标签的按包备份会自动预选</strong>，没有就手动挑。留空表示不还原该目录。
    </p>

    <div class="dest-picker">
      <div class="scope-label">替换记录</div>
      <div class="scope-package">
        <select id="remove-record" v-model="replace.remove.record" @change="replace.syncRemoveSelection()">
          <option v-if="!replace.recordOptions.length" value="">（还没有替换记录，先用「替换资源」应用一个包）</option>
          <option v-for="item in replace.recordOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </div>
      <div class="record-tools">
        <button class="btn ghost" id="btn-records-view" @click="replace.openRecords('view')">查看记录</button>
        <button class="btn ghost" id="btn-records-edit" @click="replace.openRecords('edit')">编辑记录</button>
        <button class="btn ghost danger" id="btn-records-clear" @click="replace.clearRecords()">清除记录</button>
      </div>
    </div>

    <div class="restore-row">
      <span class="path-label">Persistent_Store</span>
      <select id="remove-persistent" v-model="replace.remove.persistent">
        <option v-for="item in backup.restoreOptions('persistent')" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>
    <div class="restore-row">
      <span class="path-label">InstallResource</span>
      <select id="remove-install" v-model="replace.remove.install">
        <option v-for="item in backup.restoreOptions('install')" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>
    <div class="restore-row">
      <span class="path-label">Patch_Store</span>
      <select id="remove-patch" v-model="replace.remove.patch">
        <option v-for="item in backup.restoreOptions('patch')" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>

    <div class="progress" id="remove-progress" v-show="replace.remove.progress.visible">
      <div class="progress-bar">
        <span id="remove-progress-fill" :style="{ width: `${replace.remove.progress.pct}%` }"></span>
      </div>
      <span class="progress-text" id="remove-progress-text">{{ replace.remove.progress.text }}</span>
    </div>

    <template #actions>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-remove-cancel" @click="replace.remove.open = false">取消</button>
        <button class="btn primary" id="btn-remove-run" :disabled="replace.remove.running" @click="replace.runRemove()">
          {{ replace.remove.running ? '移除中…' : '开始移除' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
