<script setup lang="ts">
import { useFetchStore } from '../../../stores/fetch';
import Modal from '../../ui/modal.vue';

const fetch = useFetchStore();
</script>

<template>
  <Modal
    id="fetcher-modal"
    v-show="fetch.fetcherModal.open"
    title="需要 ResourceFetcher"
    @close="fetch.fetcherModal.open = false"
  >
    <p>
      没有检测到 <code id="fetcher-modal-path">{{ fetch.fetcherModal.path }}</code
      >，暂时无法抓取清单。
    </p>
    <p class="modal-reason" id="fetcher-reason" v-show="fetch.fetcherModal.reason">{{ fetch.fetcherModal.reason }}</p>
    <p class="modal-note">
      可从 GitHub Releases 自动下载并解压到 <code id="fetcher-modal-dir">{{ fetch.fetcherModal.dir }}</code
      >（约 6MB，需要能访问 github.com）。 已有旧版本时会先自动备份再替换，中途失败自动回滚。
    </p>

    <div class="modal-progress" id="fetcher-progress" v-show="fetch.fetcherModal.progress.visible">
      <div class="bar"><i id="fetcher-bar" :style="{ width: `${fetch.fetcherModal.progress.pct}%` }"></i></div>
      <span class="mono" id="fetcher-progress-text">{{ fetch.fetcherModal.progress.text }}</span>
    </div>

    <p class="modal-error" id="fetcher-error" v-if="fetch.fetcherModal.error">{{ fetch.fetcherModal.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-fetcher-later" @click="fetch.fetcherModal.open = false">稍后</button>
        <button class="btn ghost" id="btn-fetcher-open" @click="fetch.openReleases()">打开发布页</button>
        <button
          class="btn primary"
          id="btn-fetcher-download"
          :disabled="fetch.fetcherModal.busy"
          @click="fetch.downloadFetcher()"
        >
          {{ fetch.fetcherModal.busy ? '下载中…' : '自动下载' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
