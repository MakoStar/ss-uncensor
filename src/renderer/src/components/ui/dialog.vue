<script setup lang="ts">
import { useDialogStore } from '../../stores/dialog';
import Modal from './modal.vue';

const dialog = useDialogStore();

async function openLog() {
  try {
    const res: any = await window.api.diag();
    const file = res && res.log;
    if (file) await window.api.openPath(file);
  } catch {}
  dialog.closeError();
}
</script>

<template>
  <Modal v-show="dialog.error.open" :title="dialog.error.title" @close="dialog.closeError()">
    <div class="dialog-body">
      <p class="dialog-text">{{ dialog.error.text }}</p>
      <p v-if="dialog.error.detail" class="dialog-detail">
        <span class="dialog-detail-label">{{ dialog.error.detail.label }}</span>
        <code class="dialog-detail-value">{{ dialog.error.detail.value }}</code>
      </p>
    </div>
    <template #actions>
      <div class="modal-actions dialog-actions">
        <button v-if="dialog.error.showLog" class="btn ghost" id="btn-open-log" @click="openLog">打开日志</button>
        <button class="btn primary" @click="dialog.closeError()">知道了</button>
      </div>
    </template>
  </Modal>

  <Modal v-show="dialog.confirm.open" :title="dialog.confirm.title" @close="dialog.settleConfirm(false)">
    <div class="dialog-body">
      <p class="dialog-text">{{ dialog.confirm.text }}</p>
    </div>
    <template #actions>
      <div class="modal-actions dialog-actions">
        <button class="btn ghost" id="btn-confirm-cancel" @click="dialog.settleConfirm(false)">取消</button>
        <button
          class="btn"
          :class="dialog.confirm.tone === 'primary' ? 'primary' : 'danger'"
          id="btn-confirm-ok"
          @click="dialog.settleConfirm(true)"
        >
          {{ dialog.confirm.okLabel }}
        </button>
      </div>
    </template>
  </Modal>

  <Modal v-show="dialog.choice.open" :title="dialog.choice.title" @close="dialog.settleChoice(null)">
    <div class="dialog-body">
      <p class="dialog-text">{{ dialog.choice.text }}</p>
    </div>
    <template #actions>
      <div class="modal-actions dialog-actions">
        <button class="btn ghost" @click="dialog.settleChoice(null)">取消</button>
        <button
          v-for="opt in dialog.choice.options.filter((o) => !o.primary)"
          :key="opt.value"
          class="btn ghost"
          @click="dialog.settleChoice(opt.value)"
        >
          {{ opt.label }}
        </button>
        <button
          v-for="opt in dialog.choice.options.filter((o) => o.primary)"
          :key="opt.value"
          class="btn primary"
          @click="dialog.settleChoice(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </template>
  </Modal>
</template>
