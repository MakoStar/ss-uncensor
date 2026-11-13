<script setup lang="ts">
import { useGameStore } from '../../../stores/game';
import Modal from '../../ui/modal.vue';

const game = useGameStore();
</script>

<template>
  <Modal id="launcher-modal" v-show="game.launcherOpen" title="启动测试" @close="game.launcherOpen = false">
    <p class="modal-note">
      对搜索到的启动器 <strong>xtlr.exe</strong> 做快捷方式或启动测试。<br />
      快捷方式名称按渠道区分：官服「星塔启动器」、B服「哔哩启动器」。
    </p>

    <div class="launcher-actions">
      <button class="btn ghost" id="btn-shortcut-desktop" @click="game.shortcutDesktop()">创建桌面快捷方式</button>
      <button class="btn ghost" id="btn-shortcut-startmenu" :disabled="game.pinning" @click="game.pinStartMenu()">
        {{ game.pinning ? '处理中…' : '添加固定到开始菜单' }}
      </button>
      <button class="btn primary" id="btn-launch-game" @click="game.launchGame()">启动游戏</button>
    </div>

    <template #actions>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button class="btn ghost" id="btn-launcher-close" @click="game.launcherOpen = false">关闭</button>
      </div>
    </template>
  </Modal>
</template>
