<script setup lang="ts">
import { computed, watch } from 'vue';
import { useGameStore } from '../../stores/game';
import { useBackupStore } from '../../stores/backup';
import { useReplaceStore } from '../../stores/replace';
import { useUiStore } from '../../stores/ui';
import { fmtBytes, fmtTime, toSlash } from '@shared/utils';
import BackupModal from '../modals/replace/backup.vue';
import BackupDetailModal from '../modals/replace/detail.vue';
import RestoreModal from '../modals/replace/restore.vue';
import ReplaceModal from '../modals/replace/resource.vue';
import RemoveModal from '../modals/replace/remove.vue';
import RecordsModal from '../modals/replace/records.vue';
import LauncherModal from '../modals/replace/launcher.vue';

const game = useGameStore();
const backup = useBackupStore();
const replace = useReplaceStore();
const ui = useUiStore();

watch(
  () => ui.activeTab,
  (tab) => {
    if (tab === 'replace' && backup.backupsVisible) backup.loadBackups(true);
  },
  { immediate: true }
);

const lines = computed(() => [
  {
    id: 'game-dir',
    label: 'GameDirectory',
    path: game.currentGameDir,
    empty: '（未选择游戏目录）',
    target: 'game',
    action: '查看目录'
  },
  {
    id: 'persistent-store-path',
    label: 'Persistent_Store',
    path: game.paths.persistentStore,
    empty: '（未找到对应文件夹）',
    target: 'persistent',
    action: '查看目录'
  },
  {
    id: 'install-resource-path',
    label: 'InstallResource',
    path: game.paths.installResource,
    empty: '（未找到对应文件夹）',
    target: 'install',
    action: '查看目录'
  },
  {
    id: 'patch-store-path',
    label: 'Patch_Store',
    path: game.paths.patchStore,
    empty: '（未找到对应文件夹）',
    target: 'patch',
    action: '查看目录'
  },
  {
    id: 'launcher-path',
    label: 'Launcher',
    path: game.paths.launcher,
    empty: '（未找到启动器 xtlr.exe）',
    target: 'launcher',
    action: '打开位置'
  }
]);
</script>

<template>
  <section class="panel" id="panel-replace" :class="{ active: ui.activeTab === 'replace' }">
    <div class="card">
      <div class="replace-actions">
        <button class="btn primary" id="btn-select-game" @click="game.selectDir()">选择游戏目录</button>
        <span
          v-if="game.currentGameDir"
          class="game-channel"
          :class="`game-channel-${game.channel.key}`"
          id="game-channel-tag"
          :title="game.channel.note"
          >{{ game.channel.label }}</span
        >
        <span class="actions-gap"></span>
        <button class="btn ghost" id="btn-backup-modal" @click="backup.openBackup()">备份资源包</button>
        <button class="btn ghost" id="btn-replace-modal" @click="replace.openReplace()">替换资源</button>
        <button class="btn ghost" id="btn-remove-modal" @click="replace.openRemove()">移除反和谐</button>
        <button class="btn ghost" id="btn-restore-modal" @click="backup.openRestore()">还原备份</button>
        <button class="btn ghost" id="btn-view-backups" @click="backup.toggleBackups()">查看备份</button>
        <button class="btn ghost" id="btn-launcher-modal" @click="game.openLauncher()">启动测试</button>
      </div>

      <div class="replace-paths">
        <div v-for="line in lines" :key="line.id" class="path-row">
          <span class="path-label">{{ line.label }}</span>
          <div class="path-line" :id="line.id" :class="{ missing: !line.path }" :title="line.path || ''">
            {{ line.path ? toSlash(line.path) : line.empty }}
          </div>
          <button class="btn ghost btn-open-dir" @click="game.openPath(line.target)">{{ line.action }}</button>
        </div>
      </div>
    </div>

    <div class="card" id="backup-card" v-show="backup.backupsVisible">
      <div class="backup-head">
        <h3>备份列表</h3>
        <span v-if="backup.missingCount" class="backup-warn" id="backup-missing-hint">
          {{ backup.missingCount }} 条登记的文件已丢失（可点删除清掉登记）
        </span>
        <button
          class="btn ghost"
          id="btn-backup-refresh"
          :class="{ busy: backup.backupsLoading }"
          :disabled="backup.backupsLoading"
          @click="backup.loadBackups(true)"
        >
          {{ backup.backupsLoading ? '刷新中…' : '刷新' }}
        </button>
      </div>
      <table class="grid" id="backup-table">
        <colgroup>
          <col class="col-name" />
          <col class="col-channel" />
          <col class="col-target" />
          <col class="col-package" />
          <col class="col-size" />
          <col class="col-time" />
          <col class="col-ops" />
        </colgroup>
        <thead>
          <tr>
            <th>备份文件</th>
            <th>渠道</th>
            <th>目标</th>
            <th>反和谐包</th>
            <th>大小</th>
            <th>时间</th>
            <th class="col-ops-head">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!backup.backups.length">
            <td colspan="7" class="dim">还没有备份记录</td>
          </tr>
          <template v-else>
            <tr
              v-for="(item, index) in backup.backups"
              :key="`${backup.renderKey}-${item.file}`"
              class="backup-row"
              :class="{ 'backup-missing': item.missing }"
              :style="{ animationDelay: `${Math.min(index, 14) * 14}ms` }"
              :title="`${toSlash(item.file)}\n点击查看完整信息`"
              @click="backup.openDetail(item)"
            >
              <td class="mono">
                <span class="bk-name">{{ item.name }}</span
                ><span v-if="item.missing" class="bk-missing-tag">文件缺失</span>
              </td>
              <td>
                <span class="bk-channel" :class="`bk-channel-${item.channel || 'unknown'}`">{{
                  backup.channelLabel(item.channel)
                }}</span>
              </td>
              <td>{{ backup.targetLabel(item.target) }}</td>
              <td>
                <span
                  class="tag-cell"
                  :class="{ plain: !(item.scope === 'package' && item.tag) }"
                  :title="
                    item.scope === 'package' && item.tag
                      ? `对应反和谐资源包：${item.packageFile || item.tag}`
                      : '完整目录备份（整个目标目录）'
                  "
                >
                  {{ item.scope === 'package' && item.tag ? item.tag : '完整' }}
                </span>
              </td>
              <td class="mono">{{ fmtBytes(item.bytes) }}</td>
              <td class="mono dim">{{ fmtTime(item.time) }}</td>
              <td @click.stop>
                <div class="row-ops">
                  <button class="btn ghost" :disabled="item.missing" @click="backup.openDir(item)">打开目录</button>
                  <button class="btn ghost" :disabled="item.missing" @click="backup.openFile(item)">打开文件</button>
                  <button class="btn ghost danger" @click="backup.deleteBackup(item)">删除</button>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <BackupModal />
    <BackupDetailModal />
    <RestoreModal />
    <ReplaceModal />
    <RemoveModal />
    <RecordsModal />
    <LauncherModal />
  </section>
</template>
