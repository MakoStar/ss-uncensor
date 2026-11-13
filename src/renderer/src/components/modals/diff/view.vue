<script setup lang="ts">
import Modal from '../../ui/modal.vue';
import { useDiffStore } from '../../../stores/diff';
import { basename, relPath, sizeText } from '../../../utils/format';

const diff = useDiffStore();

function kindOf(name: string) {
  if (name.endsWith('_unity3d_diff.json')) return '差异 JSON';
  if (name.endsWith('_diff_files.json')) return '结果 JSON';
  return '其它';
}

function isCurrent(f: any) {
  return f.path === diff.viewResultModal.listFile || f.path === diff.viewResultModal.outFile;
}
</script>

<template>
  <Modal
    v-show="diff.viewResultModal.open"
    id="view-result-modal"
    title="查看生成结果"
    wide
    @close="diff.closeViewResult()"
  >
    <div class="dialog-body">
      <div class="vr-region">
        <span class="vr-chip"
          >平台 <b>{{ diff.viewResultModal.platform }}</b></span
        >
        <span class="vr-chip"
          >基准 <b>{{ diff.viewResultModal.base }}</b></span
        >
        <span class="vr-chip"
          >目标 <b>{{ diff.viewResultModal.target }}</b></span
        >
      </div>

      <div class="vr-folder">
        <code class="mono vr-path" :title="diff.viewResultModal.dir">{{
          relPath(diff.viewResultModal.dir) || diff.viewResultModal.dir
        }}</code>
        <button class="btn ghost" id="btn-vr-open-dir" @click="diff.openResultDir()">打开目录</button>
        <button
          class="btn ghost danger"
          id="btn-vr-clear"
          :disabled="!diff.viewResultModal.files.length"
          title="删除 output/Generated/diff 下的全部结果文件"
          @click="diff.clearResultFiles()"
        >
          清空结果
        </button>
      </div>

      <div class="sec-title">文件列表</div>

      <div v-if="diff.viewResultModal.loading" class="rule-empty vr-state">读取中…</div>
      <div v-else-if="diff.viewResultModal.error" class="dialog-text error">{{ diff.viewResultModal.error }}</div>
      <div v-else-if="!diff.viewResultModal.files.length" class="rule-empty vr-state">
        output/Generated/diff 下还没有生成结果，点「生成结果」才会落盘。
      </div>

      <div v-else class="vr-files">
        <div
          v-for="f in diff.viewResultModal.files"
          :key="f.path"
          class="vr-file"
          :class="{ 'vr-current': isCurrent(f) }"
          :id="`vr-file-${f.name}`"
          :title="`点击用系统默认程序打开：${f.name}`"
          @click="diff.openResultFile(f.path)"
        >
          <span class="vr-kind">{{ kindOf(f.name) }}</span>
          <span class="vr-name mono">{{ f.name }}</span>
          <span class="vr-size dim">{{ sizeText(f.size) }}</span>
          <span class="vr-open">打开 »</span>
          <button
            class="btn ghost danger vr-del"
            :id="`vr-del-${f.name}`"
            :title="`删除 ${f.name}`"
            @click.stop="diff.deleteResultFile(f)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="modal-actions dialog-actions">
        <button class="btn primary" id="btn-vr-close" @click="diff.closeViewResult()">关闭</button>
      </div>
    </template>
  </Modal>
</template>
