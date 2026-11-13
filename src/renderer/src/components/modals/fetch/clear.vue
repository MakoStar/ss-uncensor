<script setup lang="ts">
import { useFetchStore } from '../../../stores/fetch';
import { fmtSize } from '../../../utils/format';
import Modal from '../../ui/modal.vue';

const fetch = useFetchStore();
</script>

<template>
  <Modal
    id="clear-modal"
    v-show="fetch.clearModal.open"
    :title="fetch.clearModal.title"
    @close="fetch.clearModal.open = false"
  >
    <p class="clear-sub" id="clear-sub">{{ fetch.clearModal.sub }}</p>
    <ul class="clear-list" id="clear-list">
      <li v-for="(row, index) in fetch.clearModal.list" :key="index">
        <span>{{ row.name }}</span>
        <b v-if="row.bytes !== null && row.bytes !== undefined">{{ fmtSize(row.bytes) }}</b>
        <b v-else>—</b>
      </li>
    </ul>
    <p class="modal-note">清除后需要重新抓取该区域；只影响当前平台的产物，其它区域与平台不受影响。</p>
    <p class="modal-error" v-if="fetch.clearModal.error">{{ fetch.clearModal.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-clear-cancel" @click="fetch.clearModal.open = false">取消</button>
        <button
          class="btn danger"
          id="btn-clear-confirm"
          :disabled="!fetch.clearModal.removable"
          @click="fetch.confirmClear()"
        >
          确认清除
        </button>
      </div>
    </template>
  </Modal>
</template>
