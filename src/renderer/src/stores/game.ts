import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guard } from '../app/api';
import { state } from '../app/state';
import { toast } from '../utils/toast';
import { useMetaStore } from './meta';
import { detectGameChannel, toSlash } from '@shared/utils';

export const BACKUP_TARGETS: Record<string, string> = {
  persistent: 'Persistent_Store',
  patch: 'Patch_Store',
  install: 'InstallResource'
};
export const BACKUP_TARGET_KEYS = ['persistent', 'patch', 'install'] as const;

export const useGameStore = defineStore('game', () => {
  const meta = useMetaStore();

  const currentGameDir = ref('');
  const paths = ref<any>({ persistentStore: null, patchStore: null, installResource: null, launcher: null });
  const launcherOpen = ref(false);
  const pinning = ref(false);

  const channel = computed(() => detectGameChannel(currentGameDir.value));

  /** 读取配置并探测游戏目录 */
  async function load(): Promise<void> {
    const dir = (state.settings && state.settings.gameDir) || '';
    currentGameDir.value = dir;
    await detect(dir);
  }

  /** 按新配置应用游戏目录 */
  function applyConfig(next: any): void {
    if (!next) return;
    const dir = String(next.gameDir || '');
    if (dir === currentGameDir.value) return;
    currentGameDir.value = dir;
    void detect(dir);
  }

  /** 探测目录下各游戏路径 */
  async function detect(dir: string): Promise<void> {
    if (!dir) {
      paths.value = { persistentStore: null, patchStore: null, installResource: null, launcher: null };
      return;
    }
    const result = await guard(() => window.api.detectGamePaths({ dir }));
    if (!result) return;
    paths.value = result;
  }

  /** 校验并保存游戏目录配置 */
  async function persistDir(): Promise<void> {
    if (!currentGameDir.value) return;
    if (!paths.value.persistentStore || !paths.value.installResource) {
      toast({
        key: 'game-dir',
        kind: 'warn',
        title: '游戏目录错误',
        text: `未找到 ${paths.value.persistentStore ? 'InstallResource' : 'Persistent_Store'}，未写入配置`,
        timeout: 6000
      });
      return;
    }
    const result = await guard(() => window.api.saveGameDir({ path: currentGameDir.value }));
    if (!result) return;
    if (result.ok) {
      state.settings = { ...(state.settings || {}), ...(result.config || {}), gameDir: currentGameDir.value };
      if (result.meta) meta.applyMeta(result.meta);
      toast({
        key: 'game-dir',
        kind: 'ok',
        title: `已写入配置 · ${channel.value.label}`,
        text: toSlash(currentGameDir.value),
        timeout: 4000
      });
    } else {
      toast({ key: 'game-dir', kind: 'warn', title: '游戏目录错误', text: result.error || '', timeout: 6000 });
    }
  }

  /** 弹窗选择游戏目录并保存 */
  async function selectDir(): Promise<void> {
    const last = currentGameDir.value || (state.settings && state.settings.gameDir) || '';
    const result = await guard(() =>
      window.api.selectDirectory({
        title: '选择游戏安装目录',
        defaultPath: last
      })
    );
    if (!result || !result.path) return;
    currentGameDir.value = result.path;
    await detect(result.path);
    await persistDir();
  }

  /** 保存当前游戏目录 */
  async function saveDir(): Promise<void> {
    if (!currentGameDir.value) {
      toast({ key: 'game-dir', kind: 'warn', title: '未选择目录', text: '请先选择游戏目录', timeout: 3000 });
      return;
    }
    await persistDir();
  }

  /** 打开指定类型的目录或文件 */
  async function openPath(target: string): Promise<void> {
    let path2open: any = '';
    if (target === 'game') path2open = currentGameDir.value;
    else if (target === 'launcher') path2open = paths.value.launcher;
    else if (target === 'persistent') path2open = paths.value.persistentStore;
    else if (target === 'patch') path2open = paths.value.patchStore;
    else path2open = paths.value.installResource;

    if (!path2open) {
      toast({
        key: `open-${target}`,
        kind: 'warn',
        title: target === 'launcher' ? '未找到启动器' : '目录不存在',
        text: target === 'launcher' ? '游戏目录里没有搜到 xtlr.exe' : '请先选择有效的游戏目录',
        timeout: 3000
      });
      return;
    }
    if (target === 'launcher') await guard(() => window.api.openDir(path2open));
    else await guard(() => window.api.openPath(path2open));
  }

  /** 检查关键目录是否齐全 */
  function requireGamePaths(): boolean {
    if (paths.value.persistentStore && paths.value.installResource) return true;
    toast({
      key: 'game-paths',
      kind: 'warn',
      title: '游戏目录错误',
      text: `未找到 ${paths.value.persistentStore ? 'InstallResource' : 'Persistent_Store'}`,
      timeout: 6000
    });
    return false;
  }

  /** 检查启动器路径是否存在 */
  function requireLauncher(): boolean {
    if (paths.value.launcher) return true;
    toast({
      key: 'launcher',
      kind: 'warn',
      title: '未找到启动器',
      text: '游戏目录里没有搜到 xtlr.exe，先确认游戏目录',
      timeout: 5000
    });
    return false;
  }

  /** 校验后打开启动器面板 */
  function openLauncher(): void {
    if (!requireGamePaths()) return;
    if (!requireLauncher()) return;
    launcherOpen.value = true;
  }

  /** 用启动器标识弹出提示 */
  const notify = (kind: string, title: string, text: string, timeout: number = 5000): string =>
    toast({ key: 'launcher', kind, title, text, timeout });

  /** 为启动器创建桌面快捷方式 */
  async function shortcutDesktop(): Promise<void> {
    const result = await guard(() => window.api.launcherShortcut({ kind: 'desktop' }));
    if (result && result.ok) {
      notify('ok', '已创建桌面快捷方式', `${result.name || '启动器'} · ${toSlash(result.path)}`);
      launcherOpen.value = false;
    } else if (result) {
      notify('err', '创建失败', result.error || '未知错误');
    }
  }

  /** 把启动器加到开始菜单 */
  async function pinStartMenu(): Promise<void> {
    pinning.value = true;
    const result = await guard(() => window.api.pinStartMenu());
    pinning.value = false;
    if (!result) return;
    if (!result.ok) {
      notify('err', '添加失败', result.error || '未知错误', 8000);
      return;
    }
    const name = result.name || '启动器';
    if (result.pinned) {
      notify('ok', '已添加到开始菜单并固定', `${name} · ${toSlash(result.path)}`, 7000);
    } else if (result.win11Unsupported) {
      notify(
        'warn',
        '已加入开始菜单，需手动固定一步',
        `${name} 已出现在「所有应用」。Win11 不允许程序固定到「已固定」区：` +
          `在打开的开始菜单文件夹里右键「${name}」→ 固定到开始屏幕即可（或按 Win 搜索「${name}」右键固定）。`,
        12000
      );
    } else {
      notify(
        'warn',
        '已加入开始菜单，固定未成功',
        `${name} 可在「所有应用」里找到；已打开文件夹，右键「${name}」→ 固定到开始屏幕。${result.detail || ''}`,
        10000
      );
    }
    launcherOpen.value = false;
  }

  /** 启动游戏主程序 */
  async function launchGame(): Promise<void> {
    const result = await guard(() => window.api.launchGame());
    if (result && result.ok) {
      notify('ok', '已启动游戏', toSlash(result.file));
      launcherOpen.value = false;
    } else if (result) {
      notify('err', '启动失败', result.error || '未知错误');
    }
  }

  return {
    currentGameDir,
    paths,
    launcherOpen,
    pinning,
    channel,
    load,
    applyConfig,
    detect,
    selectDir,
    saveDir,
    persistDir,
    openPath,
    requireGamePaths,
    requireLauncher,
    openLauncher,
    shortcutDesktop,
    pinStartMenu,
    launchGame
  };
});
