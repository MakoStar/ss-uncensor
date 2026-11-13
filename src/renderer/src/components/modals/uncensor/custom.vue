<script setup lang="ts">
import { useUncensorStore } from '../../../stores/uncensor';
import { useMetaStore } from '../../../stores/meta';
import Modal from '../../ui/modal.vue';

const uncensor = useUncensorStore();
const meta = useMetaStore();
</script>

<template>
  <Modal
    id="custom-modal"
    v-show="uncensor.custom.open"
    title="自定义下载名单"
    wide
    @close="uncensor.custom.open = false"
  >
    <div class="modal-note">
      按 <code>diff_files.json</code> 的格式定义：<code>region</code> 下载哪个区域、
      <code>platform</code> 哪个平台、<code>files</code> 要哪些文件。
    </div>

    <div class="custom-head">
      <label>
        区域
        <select id="custom-region" v-model="uncensor.custom.region">
          <option v-for="item in meta.regions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label>
        平台
        <select id="custom-platform" v-model="uncensor.custom.platform">
          <option v-for="item in meta.platforms" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <button class="btn ghost" id="btn-custom-from-list" @click="uncensor.loadCustomFromSelection()">
        载入当前选择
      </button>
      <span class="total" id="custom-count">
        {{ uncensor.custom.files.length }} 项{{
          uncensor.custom.query ? ` · 过滤出 ${uncensor.customRows.length}` : ''
        }}
      </span>
    </div>

    <div class="row">
      <input
        type="search"
        id="custom-search"
        placeholder="搜索文件"
        :value="uncensor.custom.query"
        @input="uncensor.custom.query = $event.target.value"
      />
      <button class="btn ghost" id="btn-custom-add" @click="uncensor.addCustomFile()">+ 新增一行</button>
      <button class="btn ghost" id="btn-custom-clear" @click="uncensor.clearCustomFiles()">清空</button>
    </div>

    <div class="edit-list" id="custom-list">
      <div class="list-head"><span class="idx">#</span><span>文件名</span><span class="op">操作</span></div>
      <div v-if="!uncensor.customRows.length" class="rule-empty" style="padding: 10px">
        {{ uncensor.custom.files.length ? '没有匹配的文件' : '还没有文件，点「+ 新增一行」或「载入当前选择」' }}
      </div>
      <div v-for="row in uncensor.customRows" :key="row.index" class="edit-row">
        <span class="idx">{{ row.index + 1 }}</span>
        <input type="text" class="path-input mono" v-model="uncensor.custom.files[row.index]" />
        <button class="btn ghost tiny" @click="uncensor.removeCustomFile(row.index)">删除</button>
      </div>
    </div>

    <p class="modal-error" v-if="uncensor.custom.error">{{ uncensor.custom.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-custom-cancel" @click="uncensor.custom.open = false">取消</button>
        <button class="btn ghost" id="btn-custom-save" @click="uncensor.saveCustom()">保存模板</button>
        <button class="btn primary" id="btn-custom-run" @click="uncensor.downloadCustom()">开始下载</button>
      </div>
    </template>
  </Modal>
</template>
