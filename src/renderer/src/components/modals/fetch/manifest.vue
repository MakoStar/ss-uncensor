<script setup lang="ts">
import { useFetchStore } from '../../../stores/fetch';
import { fmtSize } from '../../../utils/format';
import Modal from '../../ui/modal.vue';

const fetch = useFetchStore();

const stamp = (ms: number) => {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
</script>

<template>
  <Modal
    id="manifest-modal"
    v-show="fetch.manifestModal.open"
    title="查看目录"
    wide
    @close="fetch.manifestModal.open = false"
  >
    <div class="modal-note" id="manifest-note">{{ fetch.manifestModal.rel }}</div>

    <div class="mani-tree" id="manifest-tree">
      <p v-if="!fetch.manifestModal.regions.length" class="mani-empty">这个平台还没有抓到清单</p>
      <section v-for="region in fetch.manifestModal.regions" :key="region.region" class="mani-region">
        <header class="mani-head">
          <span class="mani-name">{{ region.region }}</span>
          <span class="mani-count">{{ region.files.length }} 个文件</span>
          <button class="btn ghost mani-open" @click="fetch.openManifestDir(region.dir)">打开文件夹</button>
        </header>
        <button
          v-for="file in region.files"
          :key="file.path"
          class="mani-file"
          :title="file.rel"
          @click="fetch.openManifestFile(file.path)"
        >
          <span class="mani-file-name">{{ file.name }}</span>
          <span class="mani-file-meta">{{ fmtSize(file.bytes) }} · {{ stamp(file.mtime) }}</span>
        </button>
      </section>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-manifest-root" @click="fetch.openManifestDir(fetch.manifestModal.root)">
          打开根目录
        </button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-manifest-close" @click="fetch.manifestModal.open = false">关闭</button>
      </div>
    </template>
  </Modal>
</template>
