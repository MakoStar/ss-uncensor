<script setup lang="ts">
import { computed } from 'vue';
import { useBackupStore } from '../../../stores/backup';
import { relPath } from '../../../utils/format';
import Modal from '../../ui/modal.vue';

const backup = useBackupStore();

const rawDest = computed(() => (backup.backup.destMode === 'custom' ? backup.backup.dest : backup.defaultDest));

const shownDest = computed(() => {
  const raw = String(rawDest.value || '');
  if (!raw) return '';
  return relPath(raw) || raw;
});
</script>

<template>
  <Modal id="backup-modal" v-show="backup.backup.open" title="备份资源包" @close="backup.backup.open = false">
    <p class="modal-note">把选中的目录打包成 zip 保存；勾几个就各生成一份（TAG：PS / PT / IR）。</p>

    <div class="backup-opts">
      <label class="opt-card">
        <input type="checkbox" id="backup-persistent" v-model="backup.backup.persistent" />
        <span class="opt-text"><b>Persistent_Store</b><i>PS · Persistent_Store/AssetBundles</i></span>
      </label>
      <label class="opt-card">
        <input type="checkbox" id="backup-install" v-model="backup.backup.install" />
        <span class="opt-text"><b>InstallResource</b><i>IR · xtlr_Data/StreamingAssets/InstallResource</i></span>
      </label>
      <label class="opt-card">
        <input type="checkbox" id="backup-patch" v-model="backup.backup.patch" />
        <span class="opt-text"><b>Patch_Store</b><i>PT · Patch_Store/AssetBundles</i></span>
      </label>
    </div>

    <div class="dest-picker">
      <div class="scope-label">备份范围</div>
      <div class="dest-opts">
        <label class="opt-card">
          <input type="radio" name="backup-scope" value="full" v-model="backup.backup.scope" />
          <span class="opt-text"><b>完整目录</b><i>整个目录全量备份</i></span>
        </label>
        <label class="opt-card">
          <input type="radio" name="backup-scope" value="package" v-model="backup.backup.scope" />
          <span class="opt-text"><b>按反和谐资源包</b><i>只备该包覆盖的文件</i></span>
        </label>
      </div>
      <div class="scope-package" id="scope-package-row" v-show="backup.backup.scope === 'package'">
        <select id="backup-package" v-model="backup.backup.packageFile" @change="backup.refreshPackageHint()">
          <option v-for="item in backup.packageOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <p class="scope-hint" :class="{ bad: backup.backup.hintBad }" id="backup-package-hint">
          {{ backup.backup.hint }}
        </p>
      </div>
    </div>

    <div class="dest-picker">
      <div class="scope-label">保存位置</div>
      <div class="dest-opts">
        <label class="opt-card">
          <input type="radio" name="backup-dest-mode" value="default" v-model="backup.backup.destMode" />
          <span class="opt-text"><b>使用默认</b><i>保存到默认备份目录</i></span>
        </label>
        <label class="opt-card">
          <input type="radio" name="backup-dest-mode" value="custom" v-model="backup.backup.destMode" />
          <span class="opt-text"><b>自定义位置</b><i>选择一个保存目录</i></span>
        </label>
      </div>
      <div class="dest-custom" id="dest-path-row">
        <input
          type="text"
          id="backup-dest"
          class="path-input"
          :placeholder="backup.backup.destMode === 'custom' ? '尚未选择保存目录' : '正在读取默认目录…'"
          readonly
          :value="shownDest"
          :title="rawDest"
        />
        <button
          v-if="backup.backup.destMode === 'custom'"
          class="btn ghost"
          id="btn-backup-dest"
          @click="backup.pickDest()"
        >
          浏览…
        </button>
      </div>
    </div>

    <div class="progress" id="backup-progress" v-show="backup.backup.progress.visible">
      <div class="progress-bar">
        <span id="backup-progress-fill" :style="{ width: `${backup.backup.progress.pct}%` }"></span>
      </div>
      <span class="progress-text" id="backup-progress-text">{{ backup.backup.progress.text }}</span>
    </div>

    <template #actions>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-backup-cancel" @click="backup.backup.open = false">取消</button>
        <button class="btn primary" id="btn-backup-run" @click="backup.runBackup()">
          {{ backup.backup.running ? '中断' : '开始备份' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
