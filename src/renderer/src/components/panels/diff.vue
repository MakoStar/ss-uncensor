<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useDiffStore, DIFF_KIND_TEXT } from '../../stores/diff';
import { useMetaStore } from '../../stores/meta';
import { useUiStore } from '../../stores/ui';
import { exactSize } from '../../utils/format';
import Dropdown from '../ui/dropdown.vue';
import ResultModal from '../modals/diff/result.vue';
import JsonModal from '../modals/diff/json.vue';
import FileModal from '../modals/diff/file.vue';
import ViewResultModal from '../modals/diff/view.vue';

const diff = useDiffStore();
const meta = useMetaStore();
const ui = useUiStore();

const listEl = ref<HTMLElement>();
function onListScroll() {
  const el = listEl.value;
  if (!el || !diff.moreCount) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) diff.loadMore();
}

watch(
  () => [diff.filter, diff.query],
  async () => {
    await nextTick();
    if (listEl.value) listEl.value.scrollTop = 0;
  }
);

const cell = (snapshot: any, file: string, kinds: string[], missingClass: string, missingText: string) => {
  if (!snapshot) {
    return { missing: true, cls: missingClass, text: missingText, file: '', meta: '', tags: [] as string[] };
  }
  const hash = String(snapshot.hash || '').slice(0, 8);
  return {
    missing: false,
    cls: '',
    text: '',
    file,
    meta: `${exactSize(snapshot.size)}${hash ? ` · ${hash}` : ''}`,
    tags: (kinds || []).map((kind) => DIFF_KIND_TEXT[kind] || kind)
  };
};

onMounted(() => {
  diff.init();
  void diff.refreshManifests();
});
watch(
  () => meta.regions.join(','),
  () => diff.init()
);

watch(
  () => ui.activeTab,
  (tab, prev) => {
    if (tab === 'diff' && tab !== prev) void diff.refreshManifests();
  }
);

const rows = computed(() =>
  diff.shownRows.map((item: any) => ({
    item,
    base: cell(item.base, item.file, item.diff, item.base ? '' : 'only-target', '仅目标有（基准缺失）'),
    target: cell(item.target, item.file, item.diff, item.target ? '' : 'only-base', '仅基准有（目标缺失）')
  }))
);
</script>

<template>
  <section class="panel" id="panel-diff" :class="{ active: ui.activeTab === 'diff' }">
    <div class="card controls">
      <div class="toolbar">
        <div class="tool-group">
          <span class="tool-label">平台</span>
          <Dropdown
            :model-value="diff.platform"
            :options="meta.platforms"
            @update:model-value="diff.setPlatform($event)"
          />
          <span class="tool-label">基准</span>
          <Dropdown :model-value="diff.base" :options="meta.regions" @update:model-value="diff.setBase($event)" />
          <span class="tool-label">目标</span>
          <Dropdown :model-value="diff.target" :options="meta.regions" @update:model-value="diff.setTarget($event)" />
        </div>
        <div class="actions">
          <button class="tip-icon" type="button" aria-label="差异对比说明">
            ?
            <span class="tip-body">
              <span class="tip-note">「对比差异」只预览、不写文件</span>
              <span class="tip-note">「生成结果」才会把 output/Generated/diff/ 下的 JSON 与名单写出来</span>
            </span>
          </button>
          <button class="btn primary" id="btn-diff" :disabled="diff.comparing" @click="diff.compare()">
            {{ diff.comparing ? '对比中…' : '对比差异' }}
          </button>
          <button class="btn" id="btn-diff-result" @click="diff.openResult()">生成结果</button>
          <button class="btn" id="btn-rebuild-mani" :disabled="diff.rebuilding" @click="diff.rebuildSnapshots()">
            {{ diff.rebuilding ? '重建中…' : '重建快照' }}
          </button>
          <button class="btn" id="btn-view-result" @click="diff.openViewResult()">查看结果</button>
        </div>
      </div>
      <div class="hint" id="diff-tip" v-show="diff.outText">
        <span class="dim" id="diff-out">{{ diff.outText }}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>差异摘要</h2>
      </div>
      <div class="summary" id="diff-summary">
        <template v-if="diff.result">
          <div
            v-for="(tile, index) in diff.summaryTiles"
            :key="index"
            class="stat"
            :class="{ clickable: !!tile.filter, on: !!tile.filter && tile.filter === diff.filter }"
            :title="tile.filter ? '点击筛选该类文件' : ''"
            @click="tile.filter && diff.setFilter(tile.filter)"
          >
            <b>{{ tile.value }}</b
            ><span>{{ tile.label }}</span>
          </div>
        </template>
        <template v-else>{{ diff.summaryText }}</template>
      </div>
    </div>

    <div class="card grow" id="diff-files-card" v-show="diff.filesVisible">
      <div class="card-head diff-files-head">
        <h2>差异文件</h2>
        <div class="diff-heads">
          <span
            >基准 <b id="diff-base-name">{{ diff.result ? diff.result.baseRegion : '—' }}</b></span
          >
          <span class="arrow">→</span>
          <span
            >目标 <b id="diff-target-name">{{ diff.result ? diff.result.targetRegion : '—' }}</b></span
          >
        </div>
        <input
          type="search"
          class="browse-search diff-search"
          id="diff-query"
          placeholder="搜索文件名，如 char_2d_ / .unity3d"
          :value="diff.query"
          @input="diff.query = ($event.target as HTMLInputElement).value"
        />
      </div>
      <div class="diff-grid" id="diff-files" ref="listEl" @scroll.passive="onListScroll">
        <div v-if="!rows.length" class="rule-empty">
          {{ diff.query ? `没有匹配「${diff.query}」的文件` : `没有${diff.rows.label}` }}
        </div>
        <div
          v-for="row in rows"
          :key="row.item.file"
          class="diff-row"
          :class="{ changed: diff.rows.changed }"
          role="button"
          tabindex="0"
          title="点击查看该文件的明细"
          @click="diff.openFile(row.item)"
          @keydown.enter.prevent="diff.openFile(row.item)"
        >
          <div class="diff-cell" :class="row.base.cls">
            <span v-if="row.base.missing" class="none">{{ row.base.text }}</span>
            <template v-else>
              <button
                type="button"
                class="f mono diff-file"
                :title="row.base.file"
                @click.stop="diff.openFile(row.item)"
              >
                {{ row.base.file }}
              </button>
              <span class="m">{{ row.base.meta }}</span>
              <span v-for="tag in row.base.tags" :key="tag" class="diff-tag">{{ tag }}</span>
            </template>
          </div>
          <div class="diff-cell" :class="row.target.cls">
            <span v-if="row.target.missing" class="none">{{ row.target.text }}</span>
            <template v-else>
              <button
                type="button"
                class="f mono diff-file"
                :title="row.target.file"
                @click.stop="diff.openFile(row.item)"
              >
                {{ row.target.file }}
              </button>
              <span class="m">{{ row.target.meta }}</span>
              <span v-for="tag in row.target.tags" :key="tag" class="diff-tag">{{ tag }}</span>
            </template>
          </div>
        </div>
        <div v-if="diff.moreCount" class="rule-empty diff-more">
          已显示 {{ diff.shownRows.length }} / {{ diff.rows.list.length }} · 继续下滑自动加载
        </div>
      </div>
    </div>

    <ResultModal />
    <JsonModal />
    <FileModal />
    <ViewResultModal />
  </section>
</template>
