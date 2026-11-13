<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useMetaStore } from '../../stores/meta';
import { useUiStore } from '../../stores/ui';
import { useSoundStore } from '../../stores/sound';
import { relPath } from '../../utils/format';
import FetcherVersionModal from '../modals/settings/fetcher.vue';
import RollbackModal from '../modals/settings/rollback.vue';
import ConfigModal from '../modals/settings/config.vue';
import OutputModal from '../modals/settings/output.vue';
import PatternsModal from '../modals/settings/patterns.vue';
import BackgroundModal from '../modals/settings/background.vue';

const settings = useSettingsStore();
const meta = useMetaStore();
const ui = useUiStore();
const sound = useSoundStore();

const fetcherMirrors = computed(() => (meta.meta && (meta.meta as any).fetcherMirrors) || []);

onMounted(() => {
  settings.fillForm();
  settings.checkFetcherUpdate({ silent: true });
});

function openRepo(url: string): void {
  void window.api.openUrl(url);
}
</script>

<template>
  <section class="panel" id="panel-settings" :class="{ active: ui.activeTab === 'settings' }">
    <div class="card">
      <div class="card-head">
        <h2>
          抓取配置
          <button
            class="tip-icon"
            type="button"
            aria-label="抓取配置说明"
            id="fetch-config-tip"
            style="margin-left: 8px"
          >
            ?
            <span class="tip-body">
              <span class="tip-note">这页的参数改完要点「保存并生效」才会套用到后续抓取</span>
              <span class="tip-note">输出根目录决定 Manifest / Metadata / Uncensor / Generated 的落点</span>
              <span class="tip-note">资源白名单每行一条正则，保存时合并成 ["…"] 写入配置</span>
              <span class="tip-note">也可以点「查看配置」直接看 / 改最终的 config.json</span>
            </span>
          </button>
        </h2>
        <div class="card-head-actions">
          <button class="btn ghost" id="btn-view-config" @click="settings.openConfig()">查看配置</button>
          <button class="btn ghost" id="btn-reset-settings" @click="settings.reset()">恢复默认</button>
          <button class="btn primary" id="btn-save-settings" @click="settings.saveWithConfirm()">保存并生效</button>
        </div>
      </div>

      <div class="grid-form cols-4">
        <label>
          平台
          <select id="set-platform" v-model="settings.form.platform">
            <option v-for="item in meta.platforms" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <div class="field">
          <span class="field-label">输出根目录</span>
          <button
            class="btn ghost field-btn"
            id="btn-output-dir"
            :title="settings.form.outputRoot || settings.defaultOutputDir"
            @click="settings.openOutputModal()"
          >
            <span class="field-btn-text">{{ settings.outputDirLabel }}</span>
            <span class="field-tag">选择…</span>
          </button>
        </div>

        <label
          >请求超时(秒)
          <input type="number" id="set-timeout" v-model.number="settings.form.timeout" min="30" step="30" />
        </label>

        <label
          >网络重试次数
          <input type="number" id="set-retries" v-model.number="settings.form.retries" min="0" max="20" />
        </label>

        <label
          >失败自动重跑次数
          <input type="number" id="set-autoretry" v-model.number="settings.form.autoRetry" min="0" max="5" />
        </label>

        <label
          >日志级别
          <select id="set-loglevel" v-model="settings.form.logLevel">
            <option>off</option>
            <option>error</option>
            <option>warn</option>
            <option>info</option>
            <option>debug</option>
            <option>trace</option>
          </select>
        </label>

        <div class="field">
          <span class="field-label">资源白名单</span>
          <button
            class="btn ghost field-btn"
            id="btn-res-patterns"
            :title="settings.patternsPreview || '（空，不过滤）'"
            @click="settings.openPatternsModal()"
          >
            <span class="field-btn-text">配置资源名单</span>
            <span class="field-tag" id="res-patterns-count">{{ settings.form.resPatternList.length }} 条</span>
          </button>
        </div>
      </div>

      <div class="check-grid">
        <label class="check">
          <input type="checkbox" id="set-useregex" v-model="settings.form.useResourceRegex" /> 启用资源正则
        </label>
        <label class="check">
          <input type="checkbox" id="set-filter" v-model="settings.form.filterOutdated" /> 过滤已下线的过时补丁
        </label>
        <label class="check">
          <input type="checkbox" id="set-merge" v-model="settings.form.mergePatch" /> 抓取器合并补丁
        </label>
        <label class="check">
          <input type="checkbox" id="set-overwrite" v-model="settings.form.overwrite" /> 覆盖已下载文件
        </label>
        <label class="check">
          <input type="checkbox" id="set-autofetcher" v-model="settings.form.autoDownloadFetcher" />
          抓取器缺失时提示下载
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>
          应用配置
          <button class="tip-icon" type="button" aria-label="应用配置说明" id="app-config-tip" style="margin-left: 8px">
            ?
            <span class="tip-body">
              <span class="tip-note">背景图 / 音效勾选后立即生效，不用点「保存并生效」</span>
              <span class="tip-note">背景图缓存在应用数据库，不落项目目录</span>
            </span>
          </button>
        </h2>
        <div class="card-head-actions">
          <button
            v-if="settings.form.background"
            class="btn ghost"
            id="btn-background-refresh"
            type="button"
            @click="settings.refreshBackground()"
          >
            刷新背景
          </button>
          <button
            v-if="settings.form.background"
            class="btn ghost"
            id="btn-background-view"
            type="button"
            @click="settings.openBgModal('current')"
          >
            查看背景
          </button>
          <button
            v-if="settings.form.background"
            class="btn ghost"
            id="btn-background-history"
            type="button"
            @click="settings.openBgModal('history')"
          >
            历史背景
          </button>
        </div>
      </div>

      <div class="check-row" id="app-config-checks">
        <label class="check">
          <input
            type="checkbox"
            id="set-background"
            :checked="settings.form.background"
            @change="settings.setBackground(($event.target as HTMLInputElement).checked)"
          />
          显示启动器背景图
        </label>
        <label class="check">
          <input
            type="checkbox"
            id="set-sound"
            :checked="sound.enabled"
            @change="sound.set(($event.target as HTMLInputElement).checked)"
          />
          启用操作音效
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>
          ResourceFetcher 抓取器
          <button
            class="tip-icon"
            type="button"
            aria-label="抓取器说明"
            id="fetcher-config-tip"
            style="margin-left: 8px"
          >
            ?
            <span class="tip-body">
              <span v-for="(note, index) in settings.fetcherTips" :key="index" class="tip-note">{{ note }}</span>
            </span>
          </button>
        </h2>
        <div class="card-head-actions">
          <button
            class="btn ghost"
            id="btn-fetcher-check"
            :disabled="settings.fetcherJob.busy || settings.checking"
            @click="settings.openVersion()"
          >
            {{ settings.checking ? '检查中…' : '检查更新' }}
          </button>
          <button
            class="btn primary"
            id="btn-fetcher-update"
            :disabled="settings.updateDisabled"
            @click="settings.updateFetcher()"
          >
            {{ settings.fetcherJob.busy && settings.fetcherJob.kind === 'update' ? '更新中…' : settings.updateLabel }}
          </button>
          <button
            class="btn ghost"
            id="btn-fetcher-rollback"
            :disabled="settings.fetcherJob.busy"
            @click="settings.openRollback()"
          >
            回退版本
          </button>
        </div>
      </div>

      <div class="grid-form cols-3" id="fetcher-form">
        <div class="field">
          <span class="field-label">抓取器路径</span>
          <div class="path-row">
            <input
              type="text"
              id="set-fetcher"
              v-model="settings.form.fetcher"
              :placeholder="settings.fetcherPlaceholder"
              :title="settings.fetcherPathTitle"
            />
            <button
              class="btn ghost path-pick"
              id="btn-fetcher-pick"
              type="button"
              title="选择 ResourceFetcher.exe"
              @click="settings.pickFetcher()"
            >
              选择…
            </button>
          </div>
        </div>

        <label
          >更新通道
          <select
            id="set-fetcher-channel"
            :value="settings.form.fetcherChannel"
            @change="settings.setChannel(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in settings.channelOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label
          >下载镜像（GitHub 加速）
          <select
            id="set-mirror"
            :value="settings.form.fetcherMirror"
            :title="(fetcherMirrors.find((m) => m.value === settings.form.fetcherMirror) || {}).note || ''"
            @change="settings.setMirror(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in fetcherMirrors" :key="item.value" :value="item.value" :title="item.note">
              {{ item.label }}
            </option>
          </select>
        </label>
      </div>

      <div
        class="modal-progress fetcher-job"
        id="fetcher-job"
        v-if="settings.fetcherJob.busy || settings.fetcherJob.error"
      >
        <span class="fetcher-job-title">{{ settings.fetcherJob.title || '抓取器任务' }}</span>
        <div class="bar" v-if="settings.fetcherJob.busy">
          <i id="fetcher-job-bar" :style="{ width: `${settings.fetcherJob.pct}%` }"></i>
        </div>
        <span class="mono" id="fetcher-job-text">{{
          settings.fetcherJob.busy ? settings.fetcherJob.text : settings.fetcherJob.error
        }}</span>
        <button
          v-if="settings.fetcherJob.busy"
          class="btn ghost tiny fetcher-job-abort"
          id="btn-fetcher-abort"
          type="button"
          @click="settings.cancelFetcherJob()"
        >
          中断
        </button>
      </div>

      <div class="kv" id="fetcher-kv">
        <template v-for="row in settings.fetcherRows" :key="row.key">
          <dt>{{ row.key }}</dt>
          <dd>
            <span class="mono">{{ row.value }}</span>
            <span v-if="row.short" class="ver-badge" :class="row.channel">{{ row.short }}</span>
          </dd>
        </template>
      </div>
      <div v-if="settings.fetcherHint" class="hint" id="fetcher-hint">{{ settings.fetcherHint }}</div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>环境</h2>
        <div class="repo-bar">
          <button class="repo-link" id="repo-uncensor" title="github.com/MakoStar/ss-uncensor" @click="openRepo('https://github.com/MakoStar/ss-uncensor')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.545-1.32-1.875-.45-.24-1.11-.84-.015-.855.765-.015 1.305.705 1.485 1.005.87 1.485 2.265 1.065 2.82.815.09-.63.45-1.065.825-1.305-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.465.405.87 1.185.87 2.405 0 1.785-.015 3.22-.015 3.675 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
              />
            </svg>
            <span class="repo-name">ss-uncensor</span>
            <span class="repo-tag">应用源码</span>
          </button>

          <button class="repo-link" id="repo-fetcher" title="github.com/MakoStar/ss-resource-fetcher" @click="openRepo('https://github.com/MakoStar/ss-resource-fetcher')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.545-1.32-1.875-.45-.24-1.11-.84-.015-.855.765-.015 1.305.705 1.485 1.005.87 1.485 2.265 1.065 2.82.815.09-.63.45-1.065.825-1.305-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.465.405.87 1.185.87 2.405 0 1.785-.015 3.22-.015 3.675 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
              />
            </svg>
            <span class="repo-name">ss-resource-fetcher</span>
            <span class="repo-tag">资源获取器</span>
          </button>
        </div>
        <div class="card-head-actions">
          <button class="btn ghost" id="btn-open-log" @click="settings.openLog()">打开启动日志</button>
          <button class="btn danger" id="btn-uninstall" @click="settings.uninstall()">卸载应用</button>
        </div>
      </div>
      <div class="kv" id="env-kv">
        <template v-for="row in settings.envRows" :key="row[0]">
          <dt>{{ row[0] }}</dt>
          <dd>{{ row[1] }}</dd>
        </template>
      </div>
      <pre class="command" id="diag-tail">{{ settings.diagTail }}</pre>
    </div>

    <FetcherVersionModal />
    <RollbackModal />
    <ConfigModal />
    <OutputModal />
    <PatternsModal />
    <BackgroundModal />
  </section>
</template>
