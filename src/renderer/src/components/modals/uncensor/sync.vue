<script setup lang="ts">
import { computed } from 'vue';
import { useUncensorStore } from '../../../stores/uncensor';
import { relPath } from '../../../utils/format';
import Modal from '../../ui/modal.vue';

const uncensor = useUncensorStore();

const busy = computed(() => ['scan', 'clean', 'cleaned'].includes(uncensor.sync.phase));

const pct = computed(() => {
  const state = uncensor.sync;
  if (state.phase === 'cleaned' && !state.total) return 100;
  return state.total ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0;
});

const phaseText = computed(() => {
  const state = uncensor.sync;
  if (state.phase === 'clean') return '正在清理…';
  if (state.phase === 'cleaned')
    return state.removed ? `清理完成 · 已删除 ${state.removed} 个文件` : '无需清理 · 即将下载';
  if (state.phase === 'done') return '扫描完成';
  if (state.phase === 'error') return '出错';
  return '正在扫描…';
});

const progressText = computed(() => {
  const state = uncensor.sync;
  if (state.phase === 'cleaned' && !state.total) return `${phaseText.value}`;
  return `${phaseText.value} ${pct.value}% · ${state.done}/${state.total}`;
});

const columns = computed(() => [
  {
    key: 'missing',
    label: '不存在',
    hint: '清单里有，输出目录没有',
    items: uncensor.sync.missing.map((n) => String(n))
  },
  {
    key: 'matched',
    label: '匹配文件',
    hint: '清单与输出目录都有',
    items: uncensor.sync.matched.map((n) => String(n))
  },
  {
    key: 'extra',
    label: '需要清理',
    hint: '输出目录有，清单没有',
    items: uncensor.sync.extra.map((f) => f.rel || f.name)
  }
]);
</script>

<template>
  <Modal id="dl-sync-modal" v-show="uncensor.sync.open" title="按清单同步" wide @close="uncensor.ignoreSync()">
    <div class="sync-summary">
      <span>输出目录</span>
      <code class="mono" :title="uncensor.sync.outputDir">{{
        relPath(uncensor.sync.outputDir) || uncensor.sync.outputDir
      }}</code>
      <span v-if="uncensor.sync.source" class="sync-source" :title="`比对清单来源：${uncensor.sync.source}`"
        >清单 · {{ uncensor.sync.source }}</span
      >
    </div>

    <div class="modal-progress">
      <div class="bar"><i :style="{ width: `${pct}%` }"></i></div>
      <span class="mono">{{ progressText }}</span>
    </div>

    <div v-if="uncensor.sync.error" class="modal-error">{{ uncensor.sync.error }}</div>

    <div class="sync-cols">
      <div v-for="col in columns" :key="col.key" class="sync-col" :class="`sync-${col.key}`">
        <div class="sync-col-head">
          <b>{{ col.label }}</b>
          <span>{{ col.items.length }}</span>
        </div>
        <div class="sync-col-hint">{{ col.hint }}</div>
        <div class="sync-list">
          <div v-if="!col.items.length" class="sync-empty">无</div>
          <div v-for="(item, i) in col.items" :key="`${col.key}-${i}`" class="sync-item mono" :title="item">
            {{ item }}
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button
          class="btn ghost"
          id="btn-sync-cancel"
          title="取消本次下载，不清理也不下载"
          @click="uncensor.cancelSync()"
        >
          取消
        </button>
        <button
          class="btn ghost danger"
          id="btn-sync-clean"
          :disabled="busy"
          :title="
            uncensor.sync.extra.length ? '先删掉多余的旧文件，再按配置下载' : '当前没有需要清理的文件，直接按配置下载'
          "
          @click="uncensor.cleanSync()"
        >
          清理并下载
        </button>
        <button
          class="btn ghost"
          id="btn-sync-ignore"
          :disabled="busy"
          title="保留现有文件，直接按配置下载"
          @click="uncensor.ignoreAndDownload()"
        >
          忽略并下载
        </button>
      </div>
    </template>
  </Modal>
</template>
