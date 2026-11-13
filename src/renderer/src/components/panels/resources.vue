<script setup lang="ts">
import { computed } from 'vue'
import { useResourcesStore } from '../../stores/resources'
import { useUiStore } from '../../stores/ui'
import { relPath } from '../../utils/format'
import { fmtBytes } from '@shared/utils'

const res = useResourcesStore()
const ui = useUiStore()

const sumBytes = (items: any[]) => items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0)

const packTotal = computed(() => {
  const groups = res.packGroups
  const count = groups.reduce((sum, group) => sum + group.items.length, 0)
  const bytes = groups.reduce((sum, group) => sum + sumBytes(group.items), 0)
  return `${count} 个包 · ${fmtBytes(bytes)}`
})

const packBreakdown = computed(() =>
  res.packGroups.map((group) => `${group.short} ${group.items.length} 个包 · ${fmtBytes(sumBytes(group.items))}`).join(' ｜ ')
)
</script>

<template>
  <section class="panel" id="panel-resources" :class="{ active: ui.activeTab === 'resources' }">
    <div class="card controls">
      <div class="row">
        <div class="actions">
          <button
            class="btn ghost"
            id="btn-res-refresh"
            :class="{ busy: res.loading }"
            :disabled="res.loading"
            @click="res.refresh()"
          >{{ res.loading ? '刷新中…' : '刷新' }}</button>
          <button class="btn ghost" id="btn-res-open-root" @click="res.openRoot()">打开资源根目录</button>
        </div>
        <span class="total res-total res-head-total" :class="{ 'is-loading': res.loading }">{{ res.summary ? `${res.summary.totals.files} 个文件 · ${fmtBytes(res.summary.totals.bytes)}` : '' }}</span>
      </div>
      <div class="res-paths">
        <div>
          <span>资源根目录</span>
          <code id="res-root" :title="res.summary ? res.summary.root : ''">{{ res.summary ? relPath(res.summary.root) : '—' }}</code>
        </div>
        <div>
          <span>已下载资源</span>
          <code id="res-files" title="形如 output/Uncensor/Resource/CN2JP/and/">{{ res.summary ? `${relPath(res.summary.root)}/<A>2<B>/<平台>/` : '—' }}</code>
        </div>
        <div>
          <span>压缩包目录</span>
          <code id="res-pack" :title="res.summary ? res.summary.packageDir : ''">{{ res.summary ? `${relPath(res.summary.packageDir)}/` : '—' }}</code>
        </div>
      </div>
    </div>

    <div class="card table-card" :class="{ 'is-loading': res.loading }">
      <div class="refresh-bar"></div>
      <div class="card-head">
        <h2>已下载资源</h2>
        <span class="total res-total" id="res-total" :class="{ 'is-loading': res.loading }">{{ res.summary ? `${res.summary.totals.files} 个文件 · ${fmtBytes(res.summary.totals.bytes)}` : '' }}</span>
      </div>
      <table class="grid" id="res-table">
        <thead>
          <tr>
            <th>标签</th>
            <th>平台</th>
            <th>文件数</th>
            <th>占用空间</th>
            <th>目录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!res.summary || !res.summary.regions.length">
            <td colspan="6">还没有下载任何资源</td>
          </tr>
          <template v-else>
            <tr
              v-for="(item, index) in res.summary.regions"
              :key="`${res.renderKey}-${item.pair}-${item.platform}-${index}`"
              :style="{ animationDelay: `${Math.min(index, 14) * 14}ms` }"
            >
              <td>{{ item.pair }}</td>
              <td class="mono">{{ item.platform }}</td>
              <td class="mono">{{ item.files }}</td>
              <td class="mono">{{ fmtBytes(item.bytes) }}</td>
              <td class="mono dim" :title="relPath(item.dir)">{{ relPath(item.dir) }}</td>
              <td class="ops">
                <button class="btn ghost tiny" @click="res.openDir(item)">查看目录</button>
                <button class="btn ghost tiny" @click="res.repackage(item)">重新打包</button>
                <button class="btn danger tiny" @click="res.removeResource(item)">删除</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div class="card table-card" :class="{ 'is-loading': res.loading }">
      <div class="refresh-bar"></div>
      <div class="card-head pack-head">
        <div class="pack-head-row">
          <h2>已打包资源</h2>
          <span class="total res-total pack-total" :class="{ 'is-loading': res.loading }">{{ packTotal }}</span>
        </div>
        <div class="pack-head-row">
          <div class="pack-chips" role="group" aria-label="按平台筛选">
            <button
              v-for="opt in res.packagePlatformOptions"
              :key="opt.value"
              type="button"
              class="chip"
              :class="{ on: res.packPlatform === opt.value, all: !opt.value }"
              :data-value="opt.value"
              :aria-pressed="res.packPlatform === opt.value"
              @click="res.setPackPlatform(opt.value)"
            >
              {{ opt.label }}
              <span class="chip-count">{{ opt.count }}</span>
            </button>
          </div>
          <span
            class="total res-total pack-breakdown"
            :class="{ 'is-loading': res.loading }"
            :title="packBreakdown"
          >{{ packBreakdown }}</span>
        </div>
      </div>

      <div v-for="group in res.packGroups" :key="group.key" class="pack-group">
        <div class="pack-group-head">
          <h3>{{ group.title }}</h3>
        </div>
        <table class="grid res-pack-table" :id="group.id">
          <thead>
            <tr>
              <th>压缩包</th>
              <th>平台</th>
              <th>大小</th>
              <th>生成时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!group.items.length">
              <td colspan="5">{{ res.packPlatform ? `该平台没有${group.title}` : group.empty }}</td>
            </tr>
            <template v-else>
              <tr
                v-for="(item, index) in group.items"
                :key="`${res.renderKey}-pack-${group.key}-${item.name}-${index}`"
                :style="{ animationDelay: `${Math.min(index, 14) * 14}ms` }"
              >
                <td class="mono">{{ item.name }}</td>
                <td class="mono"><span class="plat-chip">{{ item.platform || '—' }}</span></td>
                <td class="mono">{{ fmtBytes(item.bytes) }}</td>
                <td class="mono dim">{{ new Date(item.mtime).toLocaleString('sv-SE') }}</td>
                <td class="ops">
                  <button class="btn ghost tiny" @click="res.openPackageFolder(item)">打开目录</button>
                  <button class="btn ghost tiny" @click="res.openPackageFile(item)">打开文件</button>
                  <button class="btn danger tiny" @click="res.removePackage(item)">删除</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>