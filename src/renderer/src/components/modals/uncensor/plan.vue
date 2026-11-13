<script setup lang="ts">
import { computed } from 'vue';
import { useUncensorStore } from '../../../stores/uncensor';
import { relPath } from '../../../utils/format';
import Modal from '../../ui/modal.vue';

const uncensor = useUncensorStore();

const rows = computed(() => {
  const info = uncensor.plan.info;
  if (!info) return [];
  return [
    { key: '名单配置', value: info.name },
    { key: '基准', value: info.base || '—' },
    { key: '目标', value: info.target || '—' },
    { key: '平台', value: info.platform || '—' },
    {
      key: '待下载文件数',
      value: info.fileCount === null ? '官方默认包（按服务端清单）' : `${info.fileCount} 个文件`
    },
    { key: '输出文件夹', value: relPath(info.outputDir) || info.outputDir },
    { key: '目录内已有', value: `${info.existing} 个文件` }
  ];
});

const isOfficial = computed(() => uncensor.plan.mode === 'official');

const hasList = computed(() => {
  const info = uncensor.plan.info;
  return Boolean(info && (info.listFile || (Array.isArray(info.files) && info.files.length)));
});
</script>

<template>
  <Modal id="dl-plan-modal" v-show="uncensor.plan.open" title="确认下载" @close="uncensor.cancelDownloadPlan()">
    <div class="dl-plan">
      <div v-if="uncensor.plan.loading" class="rule-empty">读取下载信息…</div>
      <div v-else-if="uncensor.plan.error" class="modal-error">{{ uncensor.plan.error }}</div>
      <template v-else>
        <div class="dl-plan-row" v-for="row in rows" :key="row.key">
          <span>{{ row.key }}</span>
          <code class="mono" :title="row.value">{{ row.value }}</code>
        </div>

        <div class="dl-plan-hint">
          <b>清空并下载</b>：产物与下载缓存全清，全部重新联网下载<br />
          <b>覆盖并下载</b>：产物强制重写（官方默认包无独立缓存，会重新下载）<br />
          <b>按配置下载</b>：增量下载，哈希一致的文件跳过<template v-if="!isOfficial"
            ><br />
            <b>按清单同步</b>：比对清单与输出目录，列出缺失／匹配／多余文件</template
          >
        </div>
      </template>
    </div>

    <template #actions>
      <div class="modal-actions">
        <template v-if="!isOfficial">
          <button
            class="btn ghost"
            id="btn-plan-sync"
            :title="hasList ? '按清单比对输出目录' : '没有可用的比对清单，点击了解原因'"
            @click="uncensor.openSync()"
          >
            按清单同步
          </button>
          <span class="spacer"></span>
        </template>
        <button class="btn ghost" id="btn-plan-cancel" @click="uncensor.cancelDownloadPlan()">取消</button>
        <button
          class="btn ghost danger"
          id="btn-plan-clear"
          :disabled="!uncensor.plan.info"
          @click="uncensor.confirmDownloadPlan('clear')"
        >
          清空并下载
        </button>
        <button
          class="btn ghost"
          id="btn-plan-overwrite"
          :disabled="!uncensor.plan.info"
          @click="uncensor.confirmDownloadPlan('overwrite')"
        >
          覆盖并下载
        </button>
        <button
          class="btn primary"
          id="btn-plan-config"
          :disabled="!uncensor.plan.info"
          @click="uncensor.confirmDownloadPlan('config')"
        >
          按配置下载
        </button>
      </div>
    </template>
  </Modal>
</template>
