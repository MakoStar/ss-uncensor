<script setup lang="ts">
import Modal from '../../ui/modal.vue';
import { useSettingsStore } from '../../../stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <Modal id="bg-modal" v-show="settings.bgModal.open" title="启动器背景" @close="settings.closeBgModal()">
    <div class="dialog-body">
      <div class="bg-tabs" id="bg-tabs">
        <button
          class="btn ghost tab-btn"
          :class="{ on: settings.bgModal.tab === 'current' }"
          id="bg-tab-current"
          @click="settings.openBgModal('current')"
        >
          当前背景
        </button>
        <button
          class="btn ghost tab-btn"
          :class="{ on: settings.bgModal.tab === 'history' }"
          id="bg-tab-history"
          @click="settings.openBgModal('history')"
        >
          历史背景
        </button>
      </div>

      <div v-if="settings.bgModal.tab === 'current'" class="bg-current">
        <div v-if="settings.bgModal.loading" class="dim bg-loading" id="bg-loading">正在获取背景…</div>
        <template v-else>
          <div v-if="settings.bgModal.error" class="dialog-text error" id="bg-error">{{ settings.bgModal.error }}</div>
          <img
            v-if="settings.bgModal.image"
            id="bg-preview"
            class="bg-preview"
            :src="settings.bgModal.image"
            alt="启动器背景"
          />
          <div class="vr-folder bg-url-row" v-if="settings.bgModal.url">
            <code class="mono vr-path" id="bg-url" :title="settings.bgModal.url">{{ settings.bgModal.url }}</code>
          </div>
        </template>
      </div>

      <div v-else class="bg-history">
        <div v-if="settings.bgHistoryLoading" class="dim bg-loading">正在读取缓存…</div>
        <div v-else-if="!settings.bgHistory.length" class="dim bg-loading" id="bg-history-empty">
          本机还没有缓存过历史背景；点「刷新背景」换过图之后，这里就能看到历代背景。
        </div>
        <template v-else>
          <p class="hint" id="bg-history-hint">
            ！ 服务器接口只下发当前背景、没有历史列表，历史图来自本机缓存（每台电脑看到的不一样）。
          </p>
          <div class="bg-grid" id="bg-grid">
            <figure v-for="item in settings.bgHistory" :key="item.hash" class="bg-item">
              <img class="bg-thumb" :src="item.base64" :alt="item.hash" loading="lazy" />
              <figcaption class="bg-hash mono" :title="item.hash">{{ item.hash }}</figcaption>
              <button class="btn tiny ghost" @click="settings.useBgHash(item.hash)">应用</button>
            </figure>
          </div>
        </template>
      </div>
    </div>

    <template #actions>
      <div class="modal-actions">
        <template v-if="settings.bgModal.tab === 'current'">
          <button class="btn ghost" id="btn-bg-copy" :disabled="!settings.bgModal.url" @click="settings.copyBgUrl()">
            复制 URL
          </button>
          <button
            class="btn ghost"
            id="btn-bg-download"
            :disabled="settings.bgSaving || !settings.bgModal.url"
            @click="settings.saveBg()"
          >
            {{ settings.bgSaving ? '保存中…' : '下载背景' }}
          </button>
        </template>
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-bg-close" @click="settings.closeBgModal()">关闭</button>
      </div>
    </template>
  </Modal>
</template>
