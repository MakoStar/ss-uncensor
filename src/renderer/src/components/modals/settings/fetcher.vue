<script setup lang="ts">
import { useSettingsStore, CHANNEL_SHORT } from '../../../stores/settings';
import Modal from '../../ui/modal.vue';

const settings = useSettingsStore();

const badge = (channel: string) => CHANNEL_SHORT[channel] || channel;
</script>

<template>
  <Modal
    id="version-modal"
    v-show="settings.versionModal.open"
    title="抓取器版本"
    @close="settings.versionModal.open = false"
  >
    <div class="ver-compare">
      <div class="ver-box">
        <div class="ver-box-head">
          <b>本地</b>
          <span
            v-if="settings.versionModal.localChannel"
            class="ver-badge"
            :class="settings.versionModal.localChannel"
            id="ver-local-badge"
            >{{ badge(settings.versionModal.localChannel) }}</span
          >
        </div>
        <span class="mono ver-num" id="ver-local">{{ settings.versionModal.local }}</span>
      </div>

      <div class="ver-arrow">→</div>

      <div
        class="ver-box"
        :class="{
          latest: settings.versionModal.latest && !settings.fetcherInfo?.updateAvailable,
          outdated: settings.fetcherInfo?.updateAvailable
        }"
      >
        <div class="ver-box-head">
          <b>远程最新</b>
          <span
            v-if="settings.versionModal.latestChannel"
            class="ver-badge"
            :class="settings.versionModal.latestChannel"
            id="ver-latest-badge"
            >{{ badge(settings.versionModal.latestChannel) }}</span
          >
        </div>
        <span class="mono ver-num" id="ver-latest">{{ settings.versionModal.latest }}</span>
      </div>
    </div>

    <p class="modal-note" id="ver-note">{{ settings.versionModal.note }}</p>

    <div
      class="modal-progress"
      id="ver-progress"
      v-show="settings.fetcherJob.busy && settings.fetcherJob.kind !== 'rollback'"
    >
      <div class="bar"><i id="ver-bar" :style="{ width: `${settings.fetcherJob.pct}%` }"></i></div>
      <span class="mono" id="ver-progress-text">{{ settings.fetcherJob.text }}</span>
    </div>

    <p class="modal-error" v-if="settings.versionModal.error">{{ settings.versionModal.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <button
          v-if="settings.fetcherJob.busy"
          class="btn ghost danger"
          id="btn-ver-abort"
          @click="settings.cancelFetcherJob()"
        >
          中断
        </button>
        <button
          v-else
          class="btn ghost"
          id="btn-ver-skip"
          :disabled="settings.channelEmpty"
          :title="settings.channelEmpty ? '请切换通道' : ''"
          @click="settings.skipVersion()"
        >
          跳过此版本
        </button>
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-ver-cancel" @click="settings.versionModal.open = false">取消</button>
        <button
          class="btn ghost"
          id="btn-ver-install"
          :disabled="settings.fetcherJob.busy || settings.channelEmpty"
          :title="settings.channelEmpty ? '请切换通道' : ''"
          @click="settings.reinstall()"
        >
          {{ settings.fetcherJob.busy && settings.fetcherJob.kind === 'reinstall' ? '下载中…' : '重装最新版' }}
        </button>
        <button
          v-if="settings.canUpdate"
          class="btn primary"
          id="btn-ver-update"
          :disabled="settings.fetcherJob.busy || settings.channelEmpty"
          :title="`更新到 ${settings.fetcherInfo?.latest || ''}`"
          @click="settings.updateFetcher()"
        >
          {{ settings.fetcherJob.busy && settings.fetcherJob.kind === 'update' ? '下载中…' : '更新' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
