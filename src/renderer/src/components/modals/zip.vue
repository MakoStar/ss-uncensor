<script setup lang="ts">
import { useResourcesStore } from '../../stores/resources';
import Modal from '../ui/modal.vue';

const res = useResourcesStore();
</script>

<template>
  <Modal id="zip-modal" v-show="res.zip.open" title="正在打包" @close="res.closeZipProgress()">
    <div class="modal-note">{{ res.zip.file }}</div>
    <div class="modal-progress">
      <div class="bar"><i id="zip-bar" :style="{ width: `${res.zipPercent}%` }"></i></div>
      <span class="mono" id="zip-text">{{ res.zipText }}</span>
    </div>
    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" @click="res.closeZipProgress()">隐藏</button>
      </div>
    </template>
  </Modal>
</template>
