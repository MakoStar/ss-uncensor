<script setup lang="ts">
import { useMetaStore } from '../../stores/meta';
import { useFetchStore } from '../../stores/fetch';
import { useUiStore } from '../../stores/ui';
import { useBrowseStore } from '../../stores/browse';
import { state } from '../../app/state';
import { toastConfig } from '../../utils/toast';
import { toSlash } from '@shared/utils';
import Dropdown from '../ui/dropdown.vue';
import ClearModal from '../modals/fetch/clear.vue';
import FetcherModal from '../modals/fetch/fetcher.vue';
import ManifestModal from '../modals/fetch/manifest.vue';

const meta = useMetaStore();
const fetch = useFetchStore();
const ui = useUiStore();
const browse = useBrowseStore();

async function onPlatform(name: string) {
  await meta.setPlatform(name);
  toastConfig();
}

function openReleases() {
  window.api.openUrl(meta.meta.releases);
}

function startFetch() {
  if (!meta.meta?.fetcherOk) {
    fetch.applyFetcherState(state.meta, { reason: '点击「开始抓取」时发现抓取器不可用' });
    fetch.fetcherModal.open = true;
    return;
  }
  fetch.start([...meta.effectiveRegions]);
}

function openBrowse(region: string) {
  browse.openAt(meta.platform, region);
  ui.setTab('browse');
}
</script>

<template>
  <section class="panel" id="panel-fetch" :class="{ active: ui.activeTab === 'fetch' }">
    <div class="notice" id="fetcher-notice" v-if="meta.meta && !meta.meta.fetcherOk">
      <span class="notice-icon">!</span>
      <span class="notice-text" id="fetcher-notice-text">
        未找到抓取器 {{ toSlash(meta.meta.fetcherTarget) }}，抓取清单前需要先下载。
      </span>
      <span class="notice-actions">
        <button class="btn ghost" id="btn-fetcher-releases" @click="openReleases">打开发布页</button>
        <button class="btn primary" id="btn-fetcher-install" @click="fetch.downloadFetcher()">自动下载</button>
      </span>
    </div>

    <div class="card controls">
      <div class="toolbar">
        <div class="tool-group">
          <span class="tool-label">平台</span>
          <Dropdown :model-value="meta.platform" :options="meta.platforms" @update:model-value="onPlatform" />
          <select id="fetch-platform" class="platform-select" :value="meta.platform" hidden>
            <option v-for="item in meta.platforms" :key="item" :value="item">{{ item }}</option>
          </select>
          <span class="tool-label">区域</span>
          <div class="regions" id="fetch-regions">
            <button class="chip all" :class="{ on: meta.allPicked }" @click="meta.pickAll()">全部区域</button>
            <button
              v-for="region in meta.regions"
              :key="region"
              class="chip"
              :class="{ on: meta.picked.has(region), fetched: meta.fetched.includes(region) }"
              :title="meta.fetched.includes(region) ? `${region}：本地已有清单` : `${region}：尚未抓取`"
              @click="meta.toggleRegion(region)"
              @contextmenu.prevent="fetch.openClear(region)"
            >
              {{ region }}
            </button>
          </div>
        </div>
        <div class="actions">
          <button class="tip-icon" type="button" aria-label="抓取参数说明">
            ?
            <span class="tip-body">
              <span class="tip-note">全部区域 = 一次调用抓完</span>
              <span class="tip-note">勾选具体区域 = 逐个抓</span>
              <span class="tip-note">绿点 = 该平台已有清单</span>
              <span class="tip-note">蓝底 = 本次选中</span>
              <span class="tip-note">超时、重试在「设置」里改</span>
            </span>
          </button>
          <button
            class="btn ghost"
            id="btn-ping"
            :class="{ busy: fetch.pingBusy }"
            :disabled="fetch.running"
            :title="fetch.pingBusy ? '测试中，再点一次中断' : '测试各区域连通性'"
            @click="fetch.ping()"
          >
            {{ fetch.pingBusy ? '测试中' : '测试 ping' }}
          </button>
          <button class="btn ghost" id="btn-command" @click="fetch.toggleCommand()">
            {{ fetch.commandOpen ? '收起命令' : '查看命令' }}
          </button>
          <button v-if="!fetch.running" class="btn primary" id="btn-fetch" @click="startFetch">开始抓取</button>
          <button v-else class="btn danger" id="btn-abort" @click="fetch.abort()">中断抓取</button>
          <button v-if="meta.hasManifests" class="btn ghost" id="btn-open-manifest" @click="fetch.openManifest()">
            查看目录
          </button>
        </div>
      </div>
      <pre class="command" id="fetch-command" v-show="fetch.commandOpen">{{ fetch.commandText }}</pre>
    </div>

    <div class="card grow">
      <div class="card-head">
        <h2>运行日志</h2>
        <button class="btn ghost" id="btn-clear-log" @click="fetch.clearLog()">清空</button>
      </div>
      <div class="log" id="run-log"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>抓取结果</h2>
      </div>
      <div class="regions-summary" id="fetch-summary">
        <template v-if="meta.fetched.length">
          <button
            v-for="region in meta.fetched"
            :key="region"
            class="stat"
            type="button"
            :title="`左键：在「清单预览」中查看 ${meta.platform} · ${region}｜右键：清除该区域清单`"
            @click="openBrowse(region)"
            @contextmenu.prevent="fetch.openClear(region)"
          >
            {{ region }}
          </button>
          <button
            v-for="region in fetch.retries"
            :key="`retry-${region}`"
            class="btn primary"
            :data-retry="region"
            @click="fetch.start([region])"
          >
            重试 {{ region }}
          </button>
        </template>
        <span v-else>尚未抓取</span>
      </div>
    </div>

    <ClearModal />
    <FetcherModal />
    <ManifestModal />
  </section>
</template>
