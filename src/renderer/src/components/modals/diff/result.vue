<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { useDiffStore } from '../../../stores/diff';
import { basename, relPath } from '../../../utils/format';
import Modal from '../../ui/modal.vue';

const diff = useDiffStore();

const pattern = ref('');
const mode = ref('contains');

const listEl = ref<HTMLElement>();
const rowInputs = ref<HTMLInputElement[]>([]);
function setRowInput(el: any, index: number) {
  if (el) rowInputs.value[index] = el;
}

async function onAddRow() {
  diff.addResultFile();
  await nextTick();
  const index = diff.consumeFocus();
  if (index < 0) return;
  const input = rowInputs.value[index];
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus();
  input.select();
}
</script>

<template>
  <Modal id="result-modal" v-show="diff.resultModal.open" title="生成结果" wide @close="diff.resultModal.open = false">
    <div class="modal-note" id="result-file">{{ diff.resultModal.file }}</div>

    <h4 class="sec-title">两侧对比</h4>
    <div class="side-compare">
      <div class="side-col">
        <div class="side-title base">
          <b>基准</b><span id="rc-base-region">{{ diff.resultModal.base }}</span>
        </div>
        <div class="side-rows" id="rc-base-rows">
          <div v-for="row in diff.resultModal.baseRows" :key="row.key" class="side-row">
            <span>{{ row.key }}</span
            ><b>{{ row.value }}</b>
          </div>
        </div>
      </div>
      <div class="side-col">
        <div class="side-title target">
          <b>目标</b><span id="rc-target-region">{{ diff.resultModal.target }}</span>
        </div>
        <div class="side-rows" id="rc-target-rows">
          <div v-for="row in diff.resultModal.targetRows" :key="row.key" class="side-row">
            <span>{{ row.key }}</span
            ><b>{{ row.value }}</b>
          </div>
        </div>
      </div>
    </div>

    <h4 class="sec-title">差异统计</h4>
    <div class="kv-tiles" id="result-kv">
      <div v-for="row in diff.resultModal.kv" :key="row.key" class="kv-tile">
        <b>{{ row.key }}</b
        ><span>{{ row.value }}</span>
      </div>
    </div>

    <h4 class="sec-title">差异 JSON</h4>
    <div class="file-tools">
      <div class="file-chip">
        <code id="res-out-name" :title="relPath(diff.resultModal.outFile)">{{
          diff.resultModal.outFile ? basename(diff.resultModal.outFile) : '—'
        }}</code>
        <button
          class="btn ghost tiny"
          id="btn-out-preview"
          @click="diff.openJson(diff.resultModal.outFile, false, diff.resultModal.reportJson)"
        >
          预览
        </button>
        <button
          class="btn ghost tiny"
          id="btn-out-edit"
          @click="diff.openJson(diff.resultModal.outFile, true, diff.resultModal.reportJson)"
        >
          编辑
        </button>
      </div>
    </div>

    <h4 class="sec-title">结果 JSON</h4>
    <div class="file-tools">
      <div class="file-chip">
        <code id="res-list-name" :title="relPath(diff.resultModal.listFile)">{{
          diff.resultModal.listFile ? basename(diff.resultModal.listFile) : '—'
        }}</code>
        <button
          class="btn ghost tiny"
          id="btn-list-preview"
          @click="diff.openJson(diff.resultModal.listFile, false, diff.listJsonText)"
        >
          预览
        </button>
        <button
          class="btn ghost tiny"
          id="btn-list-edit"
          @click="diff.openJson(diff.resultModal.listFile, true, diff.listJsonText)"
        >
          编辑
        </button>
      </div>
    </div>

    <div class="result-body">
      <div class="rb-left">
        <section class="sub-card">
          <h4 class="sec-title">文件名单（可增删改查）</h4>
          <div class="row">
            <input
              type="search"
              id="result-search"
              placeholder="搜索文件名，如 char_ / npc"
              :value="diff.resultModal.query"
              @input="diff.resultModal.query = $event.target.value"
            />
            <button class="btn ghost" id="btn-result-add" @click="onAddRow">+ 新增一行</button>
          </div>
          <div class="hint" id="result-count">{{ diff.resultCount }}</div>
        </section>

        <section class="sub-card">
          <h4 class="sec-title">排除规则（从名单里移除匹配项）</h4>
          <div class="row">
            <input type="text" id="rule-pattern" v-model="pattern" placeholder="npc / ^npc / npc_xxx.unity3d" />
            <select id="rule-mode" v-model="mode">
              <option value="contains">包含</option>
              <option value="startsWith">开头匹配</option>
              <option value="endsWith">结尾匹配</option>
              <option value="exact">完全相同</option>
              <option value="regex">正则</option>
            </select>
            <button class="btn ghost" id="btn-rule-apply" @click="diff.applyRule(pattern, mode)">移除匹配项</button>
          </div>
          <div class="rule-chips" id="rule-chips">
            <span v-if="!diff.resultModal.rules.length" class="rule-empty">还没有应用排除规则</span>
            <button
              v-for="(rule, index) in diff.resultModal.rules"
              :key="index"
              class="rule-chip"
              type="button"
              title="点击移除这条规则（已移除的文件不会恢复）"
              @click="diff.removeRule(index)"
            >
              {{ rule.label }} ×
            </button>
          </div>
        </section>
      </div>

      <div class="rb-right">
        <h4 class="sec-title">文件列表</h4>
        <div class="edit-list" id="result-list" ref="listEl">
          <div class="list-head"><span class="idx">#</span><span>文件名</span><span class="op">操作</span></div>
          <div v-if="!diff.resultRows.length" class="rule-empty" style="padding: 10px">没有匹配的文件</div>
          <div v-for="row in diff.resultRows" :key="row.index" class="edit-row">
            <span class="idx">{{ row.index + 1 }}</span>
            <input
              type="text"
              class="path-input mono"
              :ref="(el) => setRowInput(el, row.index)"
              v-model="diff.resultModal.list[row.index]"
            />
            <button class="btn ghost tiny" @click="diff.removeResultFile(row.index)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <p class="modal-error" v-if="diff.resultModal.error">{{ diff.resultModal.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <span class="modal-note left" id="result-hint"
          >{{ diff.resultModal.rules.length }} 条排除规则已应用，保存后资源下载按这份名单下载</span
        >
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-result-cancel" @click="diff.resultModal.open = false">取消</button>
        <button class="btn primary" id="btn-result-save" @click="diff.saveResult()">保存结果</button>
      </div>
    </template>
  </Modal>
</template>
