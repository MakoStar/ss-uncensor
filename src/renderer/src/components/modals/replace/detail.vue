<script setup lang="ts">
import { computed } from 'vue';
import Modal from '../../ui/modal.vue';
import { useBackupStore } from '../../../stores/backup';
import { basename } from '../../../utils/format';
import { fmtBytes, fmtTime, toSlash } from '@shared/utils';

const backup = useBackupStore();
const item = computed(() => backup.detail.item);
</script>

<template>
  <Modal id="backup-detail-modal" v-show="backup.detail.open" title="备份包详情" @close="backup.closeDetail()">
    <div class="dialog-body" v-if="item">
      <div class="bk-detail">
        <div class="bk-row">
          <span class="bk-key">备份包名</span>
          <span class="bk-val mono" id="bk-detail-name">{{ item.name }}</span>
        </div>
        <div class="bk-row">
          <span class="bk-key">渠道</span>
          <span class="bk-val">
            <span class="bk-channel" :class="`bk-channel-${item.channel || 'unknown'}`" id="bk-detail-channel">
              {{ backup.channelLabel(item.channel) }}
            </span>
          </span>
        </div>
        <div class="bk-row">
          <span class="bk-key">目标来源</span>
          <span class="bk-val" id="bk-detail-target">{{ backup.targetLabel(item.target) }}</span>
        </div>
        <div class="bk-row">
          <span class="bk-key">大小</span>
          <span class="bk-val mono" id="bk-detail-size">{{ fmtBytes(item.bytes) }}</span>
        </div>
        <div class="bk-row">
          <span class="bk-key">时间</span>
          <span class="bk-val mono" id="bk-detail-time">{{ fmtTime(item.time) }}</span>
        </div>
        <div class="bk-row">
          <span class="bk-key">备份范围</span>
          <span class="bk-val" id="bk-detail-scope">
            {{ item.scope === 'package' ? '按反和谐包（只含包内文件）' : '完整目录（整目录打包）' }}
          </span>
        </div>
        <div class="bk-row">
          <span class="bk-key">来自反和谐包</span>
          <span class="bk-val" id="bk-detail-package">
            <span v-if="item.scope === 'package' && item.tag" class="bk-pkg">
              <span class="tag-cell">{{ item.tag }}</span>
              <span class="bk-pkg-name mono" id="bk-detail-pkg-name" :title="toSlash(item.packageFile)">
                {{ basename(item.packageFile) || '（原始资源包路径未登记）' }}
              </span>
            </span>
            <span v-else class="dim">完整目录备份，不来自某个反和谐包</span>
          </span>
        </div>
        <div class="bk-row">
          <span class="bk-key">完整路径</span>
          <span class="bk-val mono bk-path" id="bk-detail-path">{{ toSlash(item.file) }}</span>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" id="btn-bk-detail-dir" @click="backup.openDir(item)">打开目录</button>
        <button class="btn ghost" id="btn-bk-detail-file" @click="backup.openFile(item)">打开文件</button>
        <button class="btn ghost danger" id="btn-bk-detail-delete" @click="backup.deleteBackup(item)">删除</button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-bk-detail-close" @click="backup.closeDetail()">关闭</button>
      </div>
    </template>
  </Modal>
</template>
