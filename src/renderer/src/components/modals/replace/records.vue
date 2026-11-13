<script setup lang="ts">
import Modal from '../../ui/modal.vue';
import { useReplaceStore } from '../../../stores/replace';
import { BACKUP_TARGETS } from '../../../stores/game';
import { fmtBytes, fmtTime, toSlash } from '@shared/utils';

const replace = useReplaceStore();

function targetsText(item: any) {
  const list = Array.isArray(item.targets) ? item.targets : [];
  if (!list.length) return '—';
  return list.map((t: string) => `${BACKUP_TARGETS[t] || t} ${item.counts?.[t] || 0} 个`).join(' · ');
}
</script>

<template>
  <Modal id="records-modal" v-show="replace.records.open" title="替换记录" wide @close="replace.closeRecords()">
    <div class="dialog-body">
      <div class="records-head">
        <span class="dim">
          共 {{ replace.records.items.length }} 条
          <template v-if="replace.records.items.some((i) => i.missing)">
            · 其中 {{ replace.records.items.filter((i) => i.missing).length }} 条的资源包已丢失
          </template>
        </span>
        <span class="spacer"></span>
        <button class="btn ghost danger" id="btn-records-clear-all" @click="replace.clearRecords()">清空全部</button>
        <button
          v-if="replace.records.mode === 'view'"
          class="btn ghost"
          id="btn-records-toggle-edit"
          @click="replace.setRecordsMode('edit')"
        >
          编辑记录
        </button>
        <button v-else class="btn ghost" id="btn-records-cancel-edit" @click="replace.setRecordsMode('view')">
          取消编辑
        </button>
      </div>

      <template v-if="replace.records.mode === 'view'">
        <div v-if="!replace.records.items.length" class="rule-empty" id="records-empty">
          还没有替换记录。应用过一次「替换资源」后才会出现。
        </div>
        <div v-else class="records-list" id="records-list">
          <div v-for="item in replace.records.items" :key="item.time" class="record-row" :title="toSlash(item.file)">
            <span class="record-tag mono">{{ item.tag || '(无标签)' }}</span>
            <span class="record-targets">{{ targetsText(item) }}</span>
            <span class="record-size mono">{{ fmtBytes(item.bytes) }}</span>
            <span class="record-time mono dim">{{ fmtTime(item.time) }}</span>
            <span v-if="item.missing" class="bk-missing-tag">文件缺失</span>
            <span class="spacer"></span>
            <button class="btn ghost" :disabled="item.missing" @click="replace.openRecordFile(item)">打开位置</button>
            <button class="btn ghost danger" :id="`btn-record-del-${item.time}`" @click="replace.deleteRecord(item)">
              删除
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="modal-note">直接编辑 JSON 数组；保存时先校验格式，字段不全的条目会被丢弃。</p>
        <textarea
          id="records-editor"
          class="config-editor records-editor"
          spellcheck="false"
          :value="replace.records.text"
          @input="replace.records.text = ($event.target as HTMLTextAreaElement).value"
        ></textarea>
      </template>

      <div v-if="replace.records.error" class="dialog-text error" id="records-error">
        {{ replace.records.error }}
      </div>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-records-close" @click="replace.closeRecords()">关闭</button>
        <span class="spacer"></span>
        <button
          v-if="replace.records.mode === 'edit'"
          class="btn primary"
          id="btn-records-save"
          :disabled="replace.records.busy"
          @click="replace.saveRecords()"
        >
          {{ replace.records.busy ? '保存中…' : '保存记录' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
