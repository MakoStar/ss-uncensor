const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');
const { DIRS, relative, platform, setPlatform, fetcher } = require('../core/config/paths');
const { PLATFORMS, SERVER_REGIONS, platformOf, versionFileName } = require('../core/config');
const { fetchedRegions, reconcileVersions } = require('../core/network/fetcher');
const { mirrorOptions } = require('../core/config/mirrors');
const log = require('../core/log/log');
const fetcherInstall = require('../services/install');
const appConfig = require('../services/config');
const settings = require('../core/config/settings');
const { STARTUP_LOG, relToCwd, readVersion, mergeVersionFile } = require('../services/file');

/** 判断是否为免安装的解压版 */
function portableMode(): boolean {
  if (!app.isPackaged) return false;
  const dir = path.dirname(app.getPath('exe'));
  try {
    return !fs.readdirSync(dir).some((item) => /^Uninstall.*\.exe$/i.test(item));
  } catch (err) {
    return true;
  }
}

/** 免安装版就地删除整个应用目录 */
function uninstallPortable(): Record<string, any> {
  const exe = app.getPath('exe');
  const dir = path.dirname(exe);
  const staged = `${exe}.removing`;
  try {
    fs.renameSync(exe, staged);
  } catch (err) {
    return { ok: false, error: `无法标记主程序：${err.message}` };
  }
  try {
    const line = `ping -n 5 127.0.0.1 > nul & rd /s /q "${dir}"`;
    spawn('cmd', ['/c', line], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  setTimeout(() => app.quit(), 600);
  return { ok: true, portable: true };
}

/** 启动安装目录里的卸载程序 */
function uninstallApp(): Record<string, any> {
  if (!app.isPackaged) return { ok: false, error: '开发模式没有安装包，直接删掉仓库目录即可' };
  const dir = path.dirname(app.getPath('exe'));
  let name = null;
  try {
    name = fs.readdirSync(dir).find((item) => /^Uninstall.*\.exe$/i.test(item)) || null;
  } catch (err) {
    name = null;
  }
  if (!name) return uninstallPortable();
  try {
    spawn(path.join(dir, name), ['/currentuser'], { detached: true, stdio: 'ignore' }).unref();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  setTimeout(() => app.quit(), 800);
  return { ok: true, uninstaller: name };
}

/** 汇总平台版本与目录信息 */
function meta(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  if (payload.platform) setPlatform(payload.platform);
  try {
    reconcileVersions(platform());
  } catch (err) {
    log.debu(`version reconcile skipped: ${err.message}`);
  }
  return {
    platform: platform(),
    platforms: Object.keys(PLATFORMS),
    portable: portableMode(),
    regions: SERVER_REGIONS,

    fetched: fetchedRegions(platform()),
    fetcher: fetcher() ? relative(fetcher()) : '(missing)',

    fetcherOk: Boolean(fetcher()),
    fetcherTarget: fetcherInstall.targetDir ? relative(fetcherInstall.targetDir()) : '',

    versionFile: relative(path.join(DIRS.manifest, versionFileName(platform()))),
    releases: fetcherInstall.RELEASES_PAGE,
    fetcherMirrors: mirrorOptions(),

    cwd: process.cwd(),
    dirs: {
      appDir: DIRS.appDir,
      output: DIRS.output,
      manifest: DIRS.manifest,
      metadata: DIRS.metadata,
      generated: DIRS.generated,
      generatedMani: DIRS.generatedMani,
      generatedDiff: DIRS.generatedDiff,
      resource: DIRS.resource,
      package: DIRS.package
    },
    config: appConfig.current(),
    settingsFile: settings.filePath(),
    node: process.version,
    electron: process.versions.electron
  };
}

/** 读取版本文件内容 */
function version(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const plat = payload.platform || platform();
  setPlatform(plat);

  const defaultFile = path.join(DIRS.manifest, versionFileName(plat));
  const wanted = String(payload.file || '').trim();
  const file = wanted ? path.resolve(process.cwd(), wanted) : defaultFile;

  const fetched = fetchedRegions(plat);
  const base = {
    file,
    fileRel: relative(file),
    defaultFile: relative(defaultFile),
    fetched,
    platform: plat,
    regions: {},
    error: null
  };

  if (!fs.existsSync(file)) {
    return { ...base, error: `文件不存在：${relative(file)}` };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ...base, error: `不是合法的 JSON：${err.message}` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ...base, error: '内容不是「区域 → 版本」的对象' };
  }

  const regions = {};
  for (const name of SERVER_REGIONS) {
    if (data[name]) regions[name] = data[name];
  }

  for (const [name, info] of Object.entries(data)) {
    if (!regions[name]) regions[name] = info;
  }
  return { ...base, regions };
}

/** 返回平台对应的基础标识 */
function baseName(_event: Electron.IpcMainInvokeEvent, { platform: plat }: { platform: string }): string {
  return platformOf(plat).base;
}

/** 读取启动日志尾部内容 */
function diag(): { log: string; tail: string } {
  const tail = fs.existsSync(STARTUP_LOG)
    ? fs.readFileSync(STARTUP_LOG, 'utf8').split(/\r?\n/).slice(-40).join('\n')
    : '(无日志)';
  return { log: STARTUP_LOG, tail };
}

/** 注册元信息相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('uninstall-app', uninstallApp);
  handle('meta', meta);
  handle('version', version);
  handle('base-name', baseName);
  handle('diag', diag);
}

module.exports = { register, meta };
