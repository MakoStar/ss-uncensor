<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useBrowseStore } from '../../stores/browse';
import { useMetaStore } from '../../stores/meta';
import { useUiStore } from '../../stores/ui';
import Dropdown from '../ui/dropdown.vue';
import ViewFileModal from '../modals/browse/view.vue';

const browse = useBrowseStore();
const meta = useMetaStore();
const ui = useUiStore();

const editing = ref(false);
const editEl = ref<HTMLInputElement>();

async function startEdit() {
  editing.value = true;
  await nextTick();
  const el = editEl.value;
  if (el) {
    el.focus();
    el.select();
  }
}

function commitPageInput(event: Event) {
  if (!editing.value) return;
  const el = event.target as HTMLInputElement;
  const text = String(el.value || '').trim();
  editing.value = false;
  if (text) browse.jumpTo(text);
}

function cancelEdit() {
  editing.value = false;
}

const sourceOptions = [
  { value: 'patch', label: '补丁清单 patch_manifest' },
  { value: 'resource', label: '资源清单 resource_manifest' }
];
const orderOptions = [
  { value: 'FileName', label: '文件名' },
  { value: 'Version', label: '版本' },
  { value: 'Hash', label: '哈希' }
];
const dirOptions = [
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' }
];

onMounted(() => {
  if (!browse.platform) browse.platform = meta.platform;
  if (!browse.region) browse.region = browse.regionOptions[0] || '';
});

watch(
  () => browse.regionOptions.join(','),
  () => {
    if (!browse.regionOptions.includes(browse.region)) {
      browse.region = browse.regionOptions[0] || '';
    }
  }
);
</script>

<template>
  <section class="panel" id="panel-browse" :class="{ active: ui.activeTab === 'browse' }">
    <div class="card controls browse-ops">
      <div class="row">
        <label>
          平台
          <Dropdown
            shape="rect"
            :model-value="browse.platform"
            :options="meta.platforms"
            @update:model-value="browse.setPlatform($event)"
          />
          <select id="browse-platform" class="platform-select" :value="browse.platform" hidden>
            <option v-for="item in meta.platforms" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          区域
          <Dropdown
            shape="rect"
            :model-value="browse.region"
            :options="browse.regionOptions"
            @update:model-value="browse.setRegion($event)"
          />
          <select id="browse-region" :value="browse.region" hidden>
            <option v-for="item in browse.regionOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          来源
          <Dropdown
            shape="rect"
            :model-value="browse.source"
            :options="sourceOptions"
            @update:model-value="browse.setSource($event)"
          />
          <select id="browse-source" :value="browse.source" hidden>
            <option v-for="item in sourceOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label>
          排序
          <Dropdown
            shape="rect"
            :model-value="browse.order"
            :options="orderOptions"
            @update:model-value="browse.setOrder($event)"
          />
          <select id="browse-order" :value="browse.order" hidden>
            <option v-for="item in orderOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label>
          方向
          <Dropdown
            shape="rect"
            :model-value="browse.dir"
            :options="dirOptions"
            @update:model-value="browse.setDir($event)"
          />
          <select id="browse-dir" :value="browse.dir" hidden>
            <option v-for="item in dirOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <div class="browse-ops-actions">
          <button class="btn ghost" id="btn-browse" @click="browse.reload()">刷新列表</button>
          <button class="btn ghost browse-view-file" id="btn-view-file" @click="browse.openViewFile()">查看清单</button>
        </div>
      </div>
    </div>

    <div class="card table-card" id="browse-card" :class="{ 'is-loading': browse.loading }">
      <div class="refresh-bar"></div>
      <div class="browse-head">
        <input
          type="search"
          id="browse-query"
          class="browse-search"
          :value="browse.query"
          placeholder="搜索文件名，如 char_2d_ / .unity3d"
          @input="
            browse.query = $event.target.value;
            browse.applyQuery();
          "
          @keydown.enter="browse.reload()"
        />
        <span class="total" id="browse-total">{{ browse.totalText }}</span>
      </div>

      <div class="grid-head-wrap">
        <table class="grid grid-head">
          <colgroup>
            <col style="width: 68px" />
            <col />
            <col style="width: 76px" />
            <col style="width: 270px" />
            <col style="width: 270px" />
            <col style="width: 96px" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>文件名</th>
              <th>版本</th>
              <th>哈希</th>
              <th>附加路径</th>
              <th class="col-copy">URL</th>
            </tr>
          </thead>
        </table>
      </div>

      <div class="grid-wrap">
        <table class="grid" id="browse-table">
          <colgroup>
            <col style="width: 68px" />
            <col />
            <col style="width: 76px" />
            <col style="width: 270px" />
            <col style="width: 270px" />
            <col style="width: 96px" />
          </colgroup>
          <tbody>
            <tr
              v-for="(item, index) in browse.items"
              :key="`${browse.renderKey}-${item.file}-${index}`"
              :style="{ animationDelay: `${Math.min(index, 14) * 14}ms` }"
            >
              <td class="mono">{{ (browse.page - 1) * 100 + index + 1 }}</td>
              <td>{{ item.file }}</td>
              <td class="mono">{{ item.version }}</td>
              <td class="mono">{{ item.hash }}</td>
              <td class="mono">{{ item.extra }}</td>
              <td class="col-copy">
                <button
                  class="btn ghost tiny copy-url"
                  :title="browse.resourceUrl(item)"
                  @click.stop="browse.copyResourceUrl(item)"
                >
                  复制
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="list-empty" id="browse-empty" v-if="browse.empty.text">
          <b>{{ browse.empty.text }}</b>
          <span>{{ browse.empty.tip }}</span>
        </div>
      </div>

      <div class="pager" v-show="browse.pagerVisible">
        <button class="btn" id="btn-prev" :disabled="browse.page <= 1" @click="browse.turn(browse.page - 1)">
          上一页
        </button>
        <button
          v-if="!editing"
          class="pager-page-static"
          id="pager-page-num"
          type="button"
          :title="`点击输入页码（共 ${browse.pages} 页）`"
          @click="startEdit"
        >
          {{ browse.page }}/{{ browse.pages }}
        </button>

        <span v-else class="pager-page-edit" id="pager-info">
          <input
            class="pager-page-input"
            id="pager-page-input"
            ref="editEl"
            type="number"
            min="1"
            :max="browse.pages"
            :value="browse.page"
            @keydown.enter.prevent="commitPageInput"
            @keydown.esc.prevent="cancelEdit"
            @blur="commitPageInput"
          />
          <span class="pager-page-hint">/ {{ browse.pages }}</span>
        </span>
        <button class="btn" id="btn-next" :disabled="browse.page >= browse.pages" @click="browse.turn(browse.page + 1)">
          下一页
        </button>
      </div>
    </div>

    <ViewFileModal />
  </section>
</template>
