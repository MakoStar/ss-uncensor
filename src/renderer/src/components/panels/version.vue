<script setup lang="ts">
import { useVersionStore } from '../../stores/version';
import { useMetaStore } from '../../stores/meta';
import { useUiStore } from '../../stores/ui';
import Dropdown from '../ui/dropdown.vue';

const version = useVersionStore();
const meta = useMetaStore();
const ui = useUiStore();
</script>

<template>
  <section class="panel" id="panel-version" :class="{ active: ui.activeTab === 'version' }">
    <div class="card controls">
      <div class="toolbar">
        <div class="tool-group">
          <span class="tool-label">平台</span>
          <Dropdown
            :model-value="meta.platform"
            :options="meta.platforms"
            @update:model-value="meta.setPlatform($event)"
          />
          <select id="version-platform" class="platform-select" :value="meta.platform" hidden>
            <option v-for="item in meta.platforms" :key="item" :value="item">{{ item }}</option>
          </select>
          <label class="path-field">
            <span>版本文件</span>
            <input
              type="text"
              id="version-path"
              class="path-input mono"
              spellcheck="false"
              placeholder="output/Manifest/win_version.json"
              :value="meta.versionPath"
              @input="meta.versionPath = $event.target.value"
              @keydown.enter="version.load()"
            />
          </label>
        </div>
        <div class="actions">
          <button class="btn ghost" id="btn-version-dir" @click="version.openDir()">打开目录</button>
          <button class="btn primary" id="btn-version" @click="version.load()">读取</button>
        </div>
      </div>
      <div class="hint" id="version-status">{{ version.status }}</div>
    </div>

    <div class="card table-card" id="version-card" :class="{ 'is-loading': version.loading }">
      <div class="refresh-bar"></div>
      <table class="grid" id="version-table">
        <thead>
          <tr>
            <th>区域</th>
            <th>client_ver</th>
            <th>game_ver</th>
            <th>patch_num</th>
            <th>version_str</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="version.errorText">
            <td colspan="5" class="dim">未读取到版本记录</td>
          </tr>
          <tr v-else-if="!version.rows.length">
            <td colspan="5">没有版本登记，先抓取</td>
          </tr>
          <template v-else>
            <tr
              v-for="(row, index) in version.rows"
              :key="`${version.renderKey}-${row.region}`"
              :style="{ animationDelay: `${Math.min(index, 14) * 14}ms` }"
            >
              <td>{{ row.region }}</td>
              <template v-if="row.missing">
                <td class="mono dim" colspan="4">清单已抓取，但没有版本记录</td>
              </template>
              <template v-else>
                <td class="mono">{{ row.clientVer }}</td>
                <td class="mono">{{ row.gameVer }}</td>
                <td class="mono">{{ row.patchNum }}</td>
                <td class="mono">{{ row.versionStr }}</td>
              </template>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
