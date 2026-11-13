<script setup lang="ts">
import { useUncensorStore } from '../../../stores/uncensor';
import { relPath } from '../../../utils/format';
import { fmtBytes } from '@shared/utils';
import Modal from '../../ui/modal.vue';

const uncensor = useUncensorStore();

const rows = () => {
  const done = uncensor.done;
  if (!done) return [];
  return [
    { key: '标签', value: done.label },
    { key: '区域', value: done.official ? '官方' : done.region },
    { key: '平台', value: done.platform },
    { key: '文件数', value: done.files },
    { key: '占用空间', value: fmtBytes(done.bytes) }
  ];
};
</script>

<template>
  <Modal id="dl-modal" v-show="!!uncensor.done" title="下载完成" @close="uncensor.done = null">
    <div class="modal-note" id="dl-done-file">{{ uncensor.done ? relPath(uncensor.done.dir) : '' }}</div>
    <div class="kv-tiles" id="dl-done-kv">
      <div v-for="row in rows()" :key="row.key" class="kv-tile">
        <b>{{ row.key }}</b
        ><span>{{ row.value }}</span>
      </div>
    </div>
    <p class="modal-error" v-if="uncensor.done && uncensor.done.error">{{ uncensor.done.error }}</p>
    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-dl-open" @click="uncensor.openDoneDir()">查看目录</button>
        <button class="btn ghost" id="btn-dl-zip" :disabled="uncensor.zipping" @click="uncensor.zipDone()">
          {{ uncensor.zipping ? '打包中…' : '打包压缩' }}
        </button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-dl-close" @click="uncensor.done = null">关闭</button>
      </div>
    </template>
  </Modal>
</template>
