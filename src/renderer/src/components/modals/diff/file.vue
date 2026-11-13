<script setup lang="ts">
import { computed } from 'vue';
import Modal from '../../ui/modal.vue';
import { useDiffStore, DIFF_KIND_TEXT } from '../../../stores/diff';
import { exactSize, sizeText } from '../../../utils/format';

const diff = useDiffStore();

const item = computed<any>(() => diff.fileModal.item);
const baseRegion = computed(() => (diff.result ? diff.result.baseRegion : '基准'));
const targetRegion = computed(() => (diff.result ? diff.result.targetRegion : '目标'));

const base = computed(() => (item.value ? item.value.base : null));
const target = computed(() => (item.value ? item.value.target : null));

const tags = computed(() => {
  const kinds = (item.value && item.value.diff) || [];
  return kinds.map((kind: string) => DIFF_KIND_TEXT[kind] || kind);
});

const sizeDelta = computed(() => {
  if (!base.value || !target.value) return '—（仅一侧存在）';
  const delta = Number(target.value.size || 0) - Number(base.value.size || 0);
  if (!delta) return '与基准一致';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(delta).toLocaleString('en-US')} B`;
});

const sizeCell = (snapshot: any) => (snapshot ? `${exactSize(snapshot.size)}（${sizeText(snapshot.size)}）` : '—');
</script>

<template>
  <Modal v-show="diff.fileModal.open" id="diff-file-modal" title="文件明细" @close="diff.closeFile()">
    <div class="dialog-body">
      <p class="dialog-text diff-file-name mono" id="diff-file-title">{{ item ? item.file : '' }}</p>
      <p v-if="tags.length" class="diff-file-tags">
        <span v-for="tag in tags" :key="tag" class="diff-tag">{{ tag }}</span>
      </p>

      <div class="diff-file-scroll">
        <table class="diff-file-table" id="diff-file-table">
          <thead>
            <tr>
              <th></th>
              <th>{{ baseRegion }}</th>
              <th>{{ targetRegion }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>大小</th>
              <td class="mono">{{ sizeCell(base) }}</td>
              <td class="mono">{{ sizeCell(target) }}</td>
            </tr>
            <tr>
              <th>哈希</th>
              <td class="mono hash">{{ base ? base.hash || '—' : '—' }}</td>
              <td class="mono hash">{{ target ? target.hash || '—' : '—' }}</td>
            </tr>
            <tr>
              <th>类型</th>
              <td class="mono">{{ base ? base.fileType || '—' : '—' }}</td>
              <td class="mono">{{ target ? target.fileType || '—' : '—' }}</td>
            </tr>
            <tr>
              <th>体积差</th>
              <td colspan="2" class="mono">{{ sizeDelta }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="dialog-text dim diff-file-note">
        数据来自本次对比的清单快照（{{ diff.platform }}），未读取磁盘上的实际文件。
      </p>
      <p v-if="diff.fileLocation" class="dialog-text dim diff-file-note diff-file-loc">
        <span :class="{ warn: !diff.locationIsResource }">{{ diff.locationHint }}</span>
        <code class="mono" id="diff-file-location">{{ diff.fileLocation }}</code>
      </p>
    </div>
    <template #actions>
      <div class="modal-actions dialog-actions">
        <button class="btn ghost" id="btn-diff-file-open" @click="diff.openFileLocation()">打开文件位置</button>
        <button class="btn primary" id="btn-diff-file-close" @click="diff.closeFile()">关闭</button>
      </div>
    </template>
  </Modal>
</template>
