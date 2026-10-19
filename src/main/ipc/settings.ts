'use strict';

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const settings = require('../../core/config/settings');
const appConfig = require('../services/config');
const windowService = require('../services/window');
const { measure } = require('../services/file');

const handlers = {
  /* 按部分更新语义保存界面配置 */
  'save-settings'(_event: any, next: any) {

    const current = settings.load();
    const saved = settings.save({ ...current, ...(next || {}) });
    appConfig.update(saved);
    return { config: saved, meta: require('./meta').meta() };
  },

  /* 恢复默认配置但保留备份与替换登记 */
  'reset-settings'() {
    const current = settings.load();
    const saved = settings.save({ ...settings.DEFAULTS, backups: current.backups, replaces: current.replaces });
    appConfig.update(saved);
    return { config: saved, meta: require('./meta').meta() };
  },

  /* 弹出系统目录选择器返回所选目录 */
  async 'select-directory'(_event: any, payload: any = {}) {
    const win = windowService.get();
    if (!win) return { path: null };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: (payload && payload.title) || '选择游戏安装目录',
    });
    return { path: canceled || !filePaths || !filePaths.length ? null : filePaths[0] };
  },

  /* 校验并持久化游戏目录 */
  'save-game-dir'(_event: any, payload: any = {}) {
    const dir = (payload && payload.path) || '';
    if (dir) {

      const detected = handlers['detect-game-paths'](_event, { dir });
      if (!detected.persistentStore || !detected.installResource) {
        return {
          ok: false,
          path: dir,
          error: '游戏目录无效：未找到 Persistent_Store/AssetBundles 或 xtlr_Data/StreamingAssets/InstallResource',
          detected,
        };
      }
    }
    const current = settings.load();
    current.gameDir = dir;
    const saved = settings.save(current);
    return { ok: true, path: dir, config: saved };
  },

  /* 在游戏目录里搜索两个资源子目录与启动器 */
  'detect-game-paths'(_event: any, payload: any = {}) {
    const dir = (payload && payload.dir) || '';
    if (!dir) return { persistentStore: null, installResource: null, launcher: null };
    const persistentStore = path.join(dir, 'Persistent_Store', 'AssetBundles');
    const installResource = path.join(dir, 'xtlr_Data', 'StreamingAssets', 'InstallResource');

    let launcher = null;
    const findLauncher = (parent, depth) => {
      if (launcher || depth > 2 || !fs.existsSync(parent)) return;
      let list = [];
      try { list = fs.readdirSync(parent, { withFileTypes: true }); } catch { return; }
      for (const entry of list) {
        const full = path.join(parent, entry.name);
        if (entry.isFile() && /^xtlr\.exe$/i.test(entry.name)) {
          launcher = full;
          return;
        }
        if (entry.isDirectory() && entry.name !== 'Persistent_Store' && !entry.name.startsWith('xtlr_Data')) {
          findLauncher(full, depth + 1);
        }
      }
    };
    if (fs.existsSync(path.join(dir, 'xtlr.exe'))) launcher = path.join(dir, 'xtlr.exe');
    else findLauncher(dir, 1);

    return {
      persistentStore: fs.existsSync(persistentStore) ? persistentStore : null,
      installResource: fs.existsSync(installResource) ? installResource : null,
      launcher,
    };
  },

  /* 按目标返回对应的游戏资源目录 */
  gameDirOf(target) {
    const detected = handlers['detect-game-paths']({}, { dir: settings.load().gameDir });
    return target === 'persistent' ? detected.persistentStore : detected.installResource;
  },

};

function gameDirOf(target) {
  const detected = handlers['detect-game-paths']({}, { dir: settings.load().gameDir });
  return target === 'persistent' ? detected.persistentStore : detected.installResource;
}

module.exports = { ...handlers, gameDirOf };
