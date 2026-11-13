const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const settings = require('../core/config/settings');
const appConfig = require('../services/config');
const windowService = require('../services/window');
const { measure } = require('../services/file');
const { TARGETS } = require('../core/config/targets');

/** 合并并保存设置项 */
function saveSettings(event: Electron.IpcMainInvokeEvent, next: any): Record<string, any> {
  try {
    const current = settings.load();
    const saved = settings.save({ ...current, ...(next || {}) });
    appConfig.update(saved);
    broadcast(event, saved);
    return { ok: true, config: saved, meta: require('./meta').meta() };
  } catch (err) {
    return { ok: false, error: `写入配置失败：${err.message}` };
  }
}

/** 把设置恢复成默认值 */
function resetSettings(event: Electron.IpcMainInvokeEvent): Record<string, any> {
  try {
    const current = settings.load();
    const saved = settings.save({ ...settings.DEFAULTS, backups: current.backups, replaces: current.replaces });
    appConfig.update(saved);
    broadcast(event, saved);
    return { ok: true, config: saved, meta: require('./meta').meta() };
  } catch (err) {
    return { ok: false, error: `恢复默认失败：${err.message}` };
  }
}

/** 把新配置推给所有窗口 */
function broadcast(event: Electron.IpcMainInvokeEvent, config: Record<string, any>): void {
  try {
    if (event && event.sender && !event.sender.isDestroyed()) {
      event.sender.send('config:changed', { config, silent: true });
    }
  } catch (err) {}
}

/** 读取配置文件原文 */
function readConfigFile(): Record<string, any> {
  const file = settings.filePath();
  try {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return { ok: true, file, text };
  } catch (err) {
    return { ok: false, file, error: `读取失败：${err.message}` };
  }
}

/** 校验并写入配置文件 */
function writeConfigFile(event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const file = settings.filePath();
  const text = String(payload.text || '');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, file, error: '配置必须是一个 JSON 对象' };
    }
  } catch (err) {
    return { ok: false, file, error: `JSON 不合法：${err.message}` };
  }

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  } catch (err) {
    return { ok: false, file, error: `写入失败：${err.message}` };
  }

  const next = settings.load();
  try {
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (err) {
    return { ok: false, file, error: `写入失败：${err.message}` };
  }
  appConfig.update(next);
  broadcast(event, next);
  return { ok: true, file, text: fs.readFileSync(file, 'utf8'), config: next, meta: require('./meta').meta() };
}

/** 弹出对话框选择目录 */
async function selectDirectory(
  _event: Electron.IpcMainInvokeEvent,
  payload: any = {}
): Promise<{ path: string | null }> {
  const win = windowService.get();
  if (!win) return { path: null };

  const raw = String((payload && payload.defaultPath) || '').trim();
  let defaultPath;
  if (raw) {
    let candidate = path.resolve(process.cwd(), raw);
    while (candidate && !fs.existsSync(candidate)) {
      const parent = path.dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
    }
    if (fs.existsSync(candidate)) defaultPath = candidate;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: (payload && payload.title) || '选择游戏安装目录',
    ...(defaultPath ? { defaultPath } : {})
  });
  return { path: canceled || !filePaths || !filePaths.length ? null : filePaths[0] };
}

/** 弹出对话框选择文件 */
async function selectFile(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<{ path: string | null }> {
  const win = windowService.get();
  if (!win) return { path: null };

  const raw = String((payload && payload.defaultPath) || '').trim();
  let defaultPath;
  if (raw) {
    let candidate = path.resolve(process.cwd(), raw);
    while (candidate && !fs.existsSync(candidate)) {
      const parent = path.dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
    }
    if (fs.existsSync(candidate)) defaultPath = candidate;
  }

  const filters =
    Array.isArray(payload && payload.filters) && payload.filters.length
      ? payload.filters
      : [{ name: '可执行文件', extensions: ['exe'] }];

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    title: (payload && payload.title) || '选择文件',
    filters,
    ...(defaultPath ? { defaultPath } : {})
  });
  return { path: canceled || !filePaths || !filePaths.length ? null : filePaths[0] };
}

/** 校验并保存游戏目录 */
function saveGameDir(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const dir = (payload && payload.path) || '';
  if (dir) {
    const detected = detectGamePaths(_event, { dir });
    if (!detected.persistentStore || !detected.installResource) {
      return {
        ok: false,
        path: dir,
        error:
          '游戏目录无效：未找到 Persistent_Store/AssetBundles 或 xtlr_Data/StreamingAssets/InstallResource（Patch_Store 为可选）',
        detected
      };
    }
  }
  const current = settings.load();
  current.gameDir = dir;
  const saved = settings.save(current);
  appConfig.update(saved);
  return { ok: true, path: dir, config: saved, meta: require('./meta').meta() };
}

/** 探测游戏目录下的子目录 */
function detectGamePaths(
  _event: Electron.IpcMainInvokeEvent,
  payload: any = {}
): {
  persistentStore: string | null;
  patchStore: string | null;
  installResource: string | null;
  launcher: string | null;
} {
  const dir = (payload && payload.dir) || '';
  const empty = { persistentStore: null, patchStore: null, installResource: null, launcher: null };
  if (!dir) return empty;

  const exists = (rel: string): string | null => {
    const full = path.join(dir, ...rel.split('/'));
    return fs.existsSync(full) ? full : null;
  };

  let launcher = null;

  const findLauncher = (parent: string, depth: number): void => {
    if (launcher || depth > 2 || !fs.existsSync(parent)) return;
    let list = [];
    try {
      list = fs.readdirSync(parent, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of list) {
      const full = path.join(parent, entry.name);
      if (entry.isFile() && /^xtlr\.exe$/i.test(entry.name)) {
        launcher = full;
        return;
      }
      if (
        entry.isDirectory() &&
        !['Persistent_Store', 'Patch_Store'].includes(entry.name) &&
        !entry.name.startsWith('xtlr_Data')
      ) {
        findLauncher(full, depth + 1);
      }
    }
  };
  if (fs.existsSync(path.join(dir, 'xtlr.exe'))) launcher = path.join(dir, 'xtlr.exe');
  else findLauncher(dir, 1);

  return {
    persistentStore: exists(TARGETS.persistent.rel),
    patchStore: exists(TARGETS.patch.rel),
    installResource: exists(TARGETS.install.rel),
    launcher
  };
}

/** 按目标类型取对应游戏目录 */
function gameDirOf(target: string): string | null {
  const detected = detectGamePaths({} as Electron.IpcMainInvokeEvent, { dir: settings.load().gameDir });
  if (target === 'persistent') return detected.persistentStore;
  if (target === 'patch') return detected.patchStore;
  if (target === 'install') return detected.installResource;
  return null;
}

/** 注册设置相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('save-settings', saveSettings);
  handle('reset-settings', resetSettings);
  handle('config-text', readConfigFile);
  handle('config-write', writeConfigFile);
  handle('select-directory', selectDirectory);
  handle('select-file', selectFile);
  handle('save-game-dir', saveGameDir);
  handle('detect-game-paths', detectGamePaths);
}

module.exports = { register, detectGamePaths, gameDirOf };
