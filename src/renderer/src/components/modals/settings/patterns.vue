<script setup lang="ts">
import Modal from '../../ui/modal.vue';
import { useSettingsStore } from '../../../stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <Modal
    id="patterns-modal"
    v-show="settings.patternsModal.open"
    title="配置资源名单"
    @close="settings.closePatternsModal()"
  >
    <div class="dialog-body">
      <p class="modal-note">每行一条正则，只下载匹配的资源；列表为空表示不做过滤（下载全部）。</p>

      <div class="pattern-rows" id="patterns-modal-rows">
        <div v-for="(item, index) in settings.patternsModal.rows" :key="index" class="pattern-row">
          <input
            type="text"
            class="pattern-input"
            :id="`patterns-modal-${index}`"
            v-model="settings.patternsModal.rows[index]"
            placeholder="例如 \.mani$"
            spellcheck="false"
          />
          <button
            class="btn ghost danger"
            :id="`btn-patterns-modal-del-${index}`"
            @click="settings.removeModalPattern(index)"
          >
            删除
          </button>
        </div>
        <div v-if="!settings.patternsModal.rows.length" class="dim pattern-empty" id="patterns-modal-empty">
          还没有规则，点「添加」新增。
        </div>
      </div>

      <p class="hint" id="patterns-modal-preview">
        保存后写入：{{ settings.patternsModalPreview || '（空，不过滤）' }}
      </p>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-patterns-modal-add" @click="settings.addModalPattern()">添加</button>
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-patterns-modal-cancel" @click="settings.closePatternsModal()">取消</button>
        <button class="btn primary" id="btn-patterns-modal-save" @click="settings.savePatternsModal()">
          保存并生效
        </button>
      </div>
    </template>
  </Modal>
</template>
