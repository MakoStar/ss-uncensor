<script setup lang="ts">
import { useUncensorStore } from '../../stores/uncensor';
import { useMetaStore } from '../../stores/meta';
import { useUiStore } from '../../stores/ui';
import CustomModal from '../modals/uncensor/custom.vue';
import DlDoneModal from '../modals/uncensor/done.vue';
import PlanModal from '../modals/uncensor/plan.vue';
import SyncModal from '../modals/uncensor/sync.vue';

const uncensor = useUncensorStore();
const meta = useMetaStore();
const ui = useUiStore();

function clearLog() {
  const box = document.getElementById('dl-log');
  if (box) box.textContent = '';
}
</script>

<template>
  <section class="panel" id="panel-uncensor" :class="{ active: ui.activeTab === 'uncensor' }">
    <div class="card controls">
      <div class="row">
        <label>
          平台
          <select
            id="uncensor-platform"
            :value="uncensor.listPlatform"
            @change="uncensor.setListPlatform($event.target.value)"
          >
            <option v-for="opt in uncensor.platformOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label>
          下载名单
          <select
            id="uncensor-list"
            :value="uncensor.listIndex"
            @change="uncensor.listIndex = Number($event.target.value)"
          >
            <option v-if="!uncensor.listOptions.length" value="0">
              {{ uncensor.listPlatform ? '（该平台没有 diff_files.json）' : '（还没有 diff_files.json）' }}
            </option>
            <option v-for="(item, index) in uncensor.listOptions" :key="item.value" :value="index">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label
          >超时(秒)
          <input
            type="number"
            id="uncensor-timeout"
            v-model.number="uncensor.timeout"
            min="30"
            step="30"
            placeholder="900"
        /></label>
        <label
          >重试
          <input type="number" id="uncensor-retries" v-model.number="uncensor.retries" min="0" max="20" placeholder="3"
        /></label>
        <div class="dl-actions">
          <button class="tip-icon" type="button" aria-label="下载说明">
            ?
            <span class="tip-body">
              <span class="tip-note">
                <span class="tip-line"><b>按选择下载</b> · output/Generated/diff/ 下的名单</span>
                <span class="tip-line"><b>按官方下载</b> · 等价于 ResourceFetcher uncensor -d</span>
                <span class="tip-line"><b>按自定义下载</b> · 自己填 region / platform / files</span>
                <span class="tip-line"><b>提示</b> · 哈希一致的文件会跳过，中断后重跑只补缺的</span>
              </span>
            </span>
          </button>

          <button v-if="uncensor.runningMode === 'list'" class="btn danger" id="btn-uncensor" @click="uncensor.abort()">
            中断
          </button>
          <button
            v-else
            class="btn primary"
            id="btn-uncensor"
            :disabled="uncensor.running"
            @click="uncensor.downloadByList()"
          >
            按选择下载
          </button>

          <button
            v-if="uncensor.runningMode === 'official'"
            class="btn danger"
            id="btn-uncensor-official"
            @click="uncensor.abort()"
          >
            中断
          </button>
          <button
            v-else
            class="btn"
            id="btn-uncensor-official"
            :disabled="uncensor.running"
            @click="uncensor.downloadOfficial()"
          >
            按官方下载
          </button>

          <button
            v-if="uncensor.runningMode === 'custom'"
            class="btn danger"
            id="btn-uncensor-run-custom"
            @click="uncensor.abort()"
          >
            中断
          </button>
          <button
            v-else
            class="btn"
            id="btn-uncensor-run-custom"
            :disabled="uncensor.running"
            @click="uncensor.openCustomDialog()"
          >
            按自定义下载
          </button>
        </div>
      </div>
    </div>

    <div class="card grow">
      <div class="card-head">
        <h2>运行日志</h2>
        <button class="btn ghost" id="btn-clear-dl-log" @click="clearLog">清空</button>
      </div>
      <div class="log" id="dl-log"></div>
    </div>

    <CustomModal />
    <DlDoneModal />
    <PlanModal />
    <SyncModal />
  </section>
</template>
