'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');
const { DIRS, relative, platform, setPlatform, fetcher } = require('../../core/config/paths');
const { PLATFORMS, SERVER_REGIONS, platformOf, versionFileName } = require('../../core/config');
const { fetchedRegions } = require('../../core/network/fetcher');
const log = require('../../core/log/log');
const fetcherInstall = require('../services/install');
const appConfig = require('../services/config');
const settings = require('../../core/config/settings');
const { STARTUP_LOG, relToCwd, readVersion, mergeVersionFile } = require('../services/file');

const handlers = {
  /* 调起安装包自带的卸载器，随后退出应用 */
  'uninstall-app'() {
    if (!app.isPackaged) return { ok: false, error: '开发模式没有安装包，直接删掉仓库目录即可' };
    const dir = path.dirname(app.getPath('exe'));
    let name = null;
    try {
      name = fs.readdirSync(dir).find((item) => /^Uninstall.*\.exe$/i.test(item)) || null;
    } catch (err) {
      name = null;
    }
    if (!name) return { ok: false, error: '安装目录里没有卸载程序，可到「设置 → 应用」里卸载' };
    try {
      spawn(path.join(dir, name), ['/currentuser'], { detached: true, stdio: 'ignore' }).unref();
    } catch (err) {
      return { ok: false, error: err.message };
    }
    setTimeout(() => app.quit(), 800);
    return { ok: true, uninstaller: name };
  },

  /* 返回环境信息当前配置与目录布局 */
  meta(_event: any, payload: any = {}) {
    if (payload.platform) setPlatform(payload.platform);
    return {
      platform: platform(),
      platforms: Object.keys(PLATFORMS),
      regions: SERVER_REGIONS,

      fetched: fetchedRegions(platform()),
      fetcher: fetcher() ? relative(fetcher()) : '(missing)',

      fetcherOk: Boolean(fetcher()),
      fetcherTarget: fetcherInstall.targetDir ? relative(fetcherInstall.targetDir()) : '',

      versionFile: relative(path.join(DIRS.manifest, versionFileName(platform()))),
      releases: fetcherInstall.RELEASES_PAGE,

      cwd: process.cwd(),
      dirs: {
        output: DIRS.output,
        manifest: DIRS.manifest,
        metadata: DIRS.metadata,
        generated: DIRS.generated,
        generatedMani: DIRS.generatedMani,
        generatedDiff: DIRS.generatedDiff,
        resource: DIRS.resource,
      },
      config: appConfig.current(),
      settingsFile: settings.filePath(),
      node: process.version,
      electron: process.versions.electron,
    };
  },

  /* 读取或合并版本登记文件 */
  version(_event: any, payload: any = {}) {
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
      error: null,
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
  },

  /* 返回指定平台的清单基准文件名 */
  'base-name'(_event: any, { platform: plat }: any) {
    return platformOf(plat).base;
  },

  /* 返回启动日志路径与末尾若干行 */
  diag() {
    const tail = fs.existsSync(STARTUP_LOG)
      ? fs.readFileSync(STARTUP_LOG, 'utf8').split(/\r?\n/).slice(-40).join('\n')
      : '(无日志)';
    return { log: STARTUP_LOG, tail };
  },
};

module.exports = handlers;
