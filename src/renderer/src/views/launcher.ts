import { guard } from '../app/api'
import { $ } from '../utils/dom'
import { say } from '../utils/format'
import { state } from '../app/state'
import { toast } from '../utils/toast'
import { effectiveRegions } from './fetch'
import { toSlash } from '@shared/utils'

export let currentGameDir = '';

export let gameDirPaths: any = { persistentStore: null, installResource: null };

/* 从配置载入游戏目录并刷新路径显示 */
export async function loadGameDir() {
  const dir = (state.settings && state.settings.gameDir) || '';
  currentGameDir = dir;
  if (dir) {
    setPathLine('game-dir', dir);
    detectGamePaths(dir);
  } else {
    setPathLine('game-dir', null, '（未选择游戏目录）');
    detectGamePaths('');
  }
}

/* 探测游戏目录里的两个资源目录与启动器 */
export async function detectGamePaths(dir) {
  if (!dir) {
    gameDirPaths = { persistentStore: null, installResource: null, launcher: null };
    setPathLine('persistent-store-path', null);
    setPathLine('install-resource-path', null);
    setPathLine('launcher-path', null, '（未找到启动器 xtlr.exe）');
    return;
  }
  const result = await guard(() => window.api.detectGamePaths({ dir }));
  if (!result) return;
  gameDirPaths = result;
  setPathLine('persistent-store-path', result.persistentStore);
  setPathLine('install-resource-path', result.installResource);
  setPathLine('launcher-path', result.launcher, '（未找到启动器 xtlr.exe）');
}

/* 按是否找到更新一行路径显示 */
export function setPathLine(id, foundPath, emptyText = '（未找到对应文件夹）') {
  const el = $(id);
  if (foundPath) {
    el.textContent = toSlash(foundPath);
    el.title = foundPath;
    el.classList.remove('missing');
  } else {
    el.textContent = emptyText;
    el.title = '';
    el.classList.add('missing');
  }
}

$('btn-select-game').addEventListener('click', async () => {
  const result = await guard(() => window.api.selectDirectory({ title: '选择游戏安装目录' }));
  if (!result || !result.path) return;
  currentGameDir = result.path;
  setPathLine('game-dir', currentGameDir);
  detectGamePaths(currentGameDir);
});

$('btn-save-game-dir').addEventListener('click', async () => {
  if (!currentGameDir) {
    toast({ key: 'game-dir', kind: 'warn', title: '未选择目录', text: '请先选择游戏目录', timeout: 3000 });
    return;
  }

  if (!gameDirPaths.persistentStore || !gameDirPaths.installResource) {
    toast({
      key: 'game-dir',
      kind: 'warn',
      title: '游戏目录错误',
      text: `未找到 ${gameDirPaths.persistentStore ? 'InstallResource' : 'Persistent_Store'}，不写入配置`,
      timeout: 6000,
    });
    return;
  }
  const result = await guard(() => window.api.saveGameDir({ path: currentGameDir }));
  if (result && result.ok) {
    state.settings = { ...(state.settings || {}), gameDir: currentGameDir };
    toast({ key: 'game-dir', kind: 'ok', title: '已写入配置', text: toSlash(currentGameDir), timeout: 4000 });
  } else if (result && !result.ok) {
    toast({ key: 'game-dir', kind: 'warn', title: '游戏目录错误', text: result.error || '', timeout: 6000 });
  }
});

document.querySelectorAll('#panel-replace .btn-open-dir').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = button.dataset.target;
    let path2open;
    if (target === 'game') path2open = currentGameDir;
    else if (target === 'launcher') path2open = gameDirPaths.launcher;
    else path2open = gameDirPaths[`${target === 'persistent' ? 'persistentStore' : 'installResource'}`];
    if (!path2open) {
      toast({
        key: `open-${target}`,
        kind: 'warn',
        title: target === 'launcher' ? '未找到启动器' : '目录不存在',
        text: target === 'launcher' ? '游戏目录里没有搜到 xtlr.exe' : '请先选择有效的游戏目录',
        timeout: 3000,
      });
      return;
    }

    if (target === 'launcher') await guard(() => window.api.openDir(path2open));
    else await guard(() => window.api.openPath(path2open));
  });
});

/* 启动器相关操作的统一通知 */
export const launcherNotify = (kind, title, text, timeout = 5000) =>
  toast({ key: 'launcher', kind, title, text, timeout });

/* 确认已找到启动器否则提示 */
export function requireLauncher() {
  if (gameDirPaths.launcher) return true;
  launcherNotify('warn', '未找到启动器', '游戏目录里没有搜到 xtlr.exe，先确认游戏目录');
  return false;
}

$('btn-launcher-modal').addEventListener('click', () => {
  if (!requireGamePaths()) return;
  if (!requireLauncher()) return;
  $('launcher-modal').hidden = false;
});

$('btn-launcher-close').addEventListener('click', () => {
  $('launcher-modal').hidden = true;
});

$('btn-shortcut-desktop').addEventListener('click', async () => {
  const result = await guard(() => window.api.launcherShortcut({ kind: 'desktop' }));
  if (result && result.ok) {
    launcherNotify('ok', '已创建桌面快捷方式', toSlash(result.path));
    $('launcher-modal').hidden = true;
  } else if (result) {
    launcherNotify('err', '创建失败', result.error || '未知错误');
  }
});

$('btn-shortcut-startmenu').addEventListener('click', async () => {
  const result = await guard(() => window.api.launcherShortcut({ kind: 'start-menu' }));
  if (result && result.ok) {
    const extra = result.paths && result.paths.length > 1 ? `（同时写入了 ${result.paths.length} 个位置）` : '';
    launcherNotify('ok', '已添加到开始菜单', `${toSlash(result.path)}${extra} · 已打开文件夹；开始菜单列表若有延迟，按 Win 键搜索「星塔」`, 8000);
    $('launcher-modal').hidden = true;
  } else if (result) {
    launcherNotify('err', '添加失败', result.error || '未知错误', 8000);
  }
});

$('btn-pin-startmenu').addEventListener('click', async () => {
  const button = $('btn-pin-startmenu');
  button.disabled = true;
  button.textContent = '固定中…';
  const result = await guard(() => window.api.pinStartMenu());
  button.disabled = false;
  button.textContent = '固定到开始菜单';
  if (!result) return;
  if (result.ok) {
    launcherNotify('ok', '已固定到开始菜单', `名称「星塔启动器」来自快捷方式文件名：${toSlash(result.path)}`, 7000);
    $('launcher-modal').hidden = true;
    return;
  }

  launcherNotify('warn', '需要手动固定一步', result.error || '系统未提供固定接口', 9000);
});

$('btn-launch-game').addEventListener('click', async () => {
  const result = await guard(() => window.api.launchGame());
  if (result && result.ok) {
    launcherNotify('ok', '已启动游戏', toSlash(result.file));
    $('launcher-modal').hidden = true;
  } else if (result) {
    launcherNotify('err', '启动失败', result.error || '未知错误');
  }
});

export const BACKUP_TARGETS = { persistent: 'Persistent_Store', install: 'InstallResource' };

/* 确认两个游戏资源目录都有效否则提示 */
export function requireGamePaths() {
  if (gameDirPaths.persistentStore && gameDirPaths.installResource) return true;
  toast({
    key: 'game-paths',
    kind: 'warn',
    title: '游戏目录错误',
    text: `未找到 ${gameDirPaths.persistentStore ? 'InstallResource' : 'Persistent_Store'}`,
    timeout: 6000,
  });
  return false;
}

$('btn-ping').addEventListener('click', async () => {
  const button = $('btn-ping');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = '测试中…';

  const result = await guard(() => window.api.ping({
    platform: $('fetch-platform').value,
    regions: effectiveRegions(),
  }));

  button.disabled = false;
  button.textContent = '测试 ping';

  if (result && !result.ok) say('TIPS', '有区域不可达，可以先只勾可用的区域抓，或稍后重试');
});
