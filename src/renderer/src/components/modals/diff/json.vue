<script setup lang="ts">
import { useDiffStore } from '../../../stores/diff';
import Modal from '../../ui/modal.vue';

const diff = useDiffStore();
</script>

<template>
  <Modal
    id="json-modal"
    v-show="diff.jsonModal.open"
    :title="diff.jsonModal.title"
    wide
    @close="diff.jsonModal.open = false"
  >
    <div class="modal-note" id="json-file">{{ diff.jsonModal.file }}</div>
    <textarea
      class="json-view"
      id="json-body"
      spellcheck="false"
      :readonly="!diff.jsonModal.editable"
      v-model="diff.jsonModal.text"
    ></textarea>
    <p class="modal-error" v-if="diff.jsonModal.error">{{ diff.jsonModal.error }}</p>
    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-json-copy" @click="diff.copyJson()">复制到剪贴板</button>
        <button class="btn ghost" id="btn-json-save" v-show="diff.jsonModal.editable" @click="diff.saveJson()">
          保存修改
        </button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-json-close" @click="diff.jsonModal.open = false">关闭</button>
      </div>
    </template>
  </Modal>
</template>
