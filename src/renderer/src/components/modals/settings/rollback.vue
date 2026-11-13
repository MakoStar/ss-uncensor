<script setup lang="ts">
import { useSettingsStore } from '../../../stores/settings';
import Modal from '../../ui/modal.vue';

const settings = useSettingsStore();
</script>

<template>
  <Modal
    id="rollback-modal"
    v-show="settings.rollback.open"
    title="抓取器版本回退"
    @close="settings.rollback.open = false"
  >
    <div class="modal-note">
      会重新下载并覆盖本地 <code>ResourceFetcher.exe</code>。<br />
      方括号是通道（Stable / RC / Beta / Alpha），预发布版可能不稳定。
    </div>

    <div v-if="settings.rollback.note" class="hint" id="rollback-note">{{ settings.rollback.note }}</div>

    <label
      >目标版本
      <select
        id="rollback-version"
        v-model="settings.rollback.tag"
        :disabled="!settings.rollback.versions.length || settings.fetcherJob.busy"
      >
        <option v-if="!settings.rollback.versions.length" value="">加载中…</option>
        <option v-for="item in settings.rollback.versions" :key="item.tag" :value="item.tag">{{ item.label }}</option>
      </select>
    </label>

    <div
      class="modal-progress"
      id="rollback-progress"
      v-show="settings.fetcherJob.busy && settings.fetcherJob.kind === 'rollback'"
    >
      <div class="bar"><i id="rollback-bar" :style="{ width: `${settings.fetcherJob.pct}%` }"></i></div>
      <span class="mono" id="rollback-progress-text">{{ settings.fetcherJob.text }}</span>
    </div>

    <p class="modal-error" v-if="settings.rollback.error">{{ settings.rollback.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <button
          v-if="settings.fetcherJob.busy && settings.fetcherJob.kind === 'rollback'"
          class="btn ghost danger"
          id="btn-rollback-abort"
          @click="settings.cancelFetcherJob()"
        >
          中断
        </button>
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-rollback-cancel" @click="settings.rollback.open = false">取消</button>
        <button
          class="btn primary"
          id="btn-rollback-ok"
          :disabled="settings.fetcherJob.busy || !settings.rollback.tag"
          @click="settings.doRollback()"
        >
          {{ settings.fetcherJob.busy && settings.fetcherJob.kind === 'rollback' ? '回退中…' : '回退' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
