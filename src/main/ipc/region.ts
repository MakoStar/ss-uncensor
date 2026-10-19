'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const { DIRS, platform, setPlatform } = require('../../core/config/paths');
const { trace } = require('../services/file');
const { describeRegion } = require('../services/file');

const handlers = {
  /* 返回某区域已下载的清单缓存与版本登记 */
  'region-info'(_event: any, payload: any = {}) {
    const plat = payload.platform || platform();
    setPlatform(plat);
    return describeRegion(payload.region, plat);
  },

  /* 清理某区域已下载的清单缓存与版本登记 */
  'clear-region'(_event: any, payload: any = {}) {
    const plat = payload.platform || platform();
    setPlatform(plat);
    const info = describeRegion(payload.region, plat);
    if (!info.removable) return { ok: true, ...info, removed: 0 };

    const outputRoot = path.resolve(DIRS.output);
    const inside = (target) => path.resolve(target).startsWith(outputRoot + path.sep);
    let removed = 0;

    for (const item of info.manifests) {
      const target = path.join(info.paths.manifest, item.name);
      if (!inside(target)) continue;
      fs.rmSync(target, { force: true });
      removed += 1;
    }

    if (fs.existsSync(info.paths.manifest) && inside(info.paths.manifest)) {
      if (fs.readdirSync(info.paths.manifest).length === 0) {
        fs.rmSync(info.paths.manifest, { recursive: true, force: true });
      }
    }

    if (info.cache && inside(info.cache.path)) {
      fs.rmSync(info.cache.path, { recursive: true, force: true });
      removed += info.cache.files;

      const parent = path.dirname(info.cache.path);
      if (fs.existsSync(parent) && inside(parent) && fs.readdirSync(parent).length === 0) {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    }

    if (info.versionEntry) {
      try {
        const data = JSON.parse(fs.readFileSync(info.paths.version, 'utf8'));
        delete data[info.region];
        if (Object.keys(data).length === 0) fs.rmSync(info.paths.version, { force: true });
        else fs.writeFileSync(info.paths.version, JSON.stringify(data, null, 2));
      } catch (err) {
        trace(`clear version entry failed: ${err.message}`);
      }
    }

    return { ok: true, ...info, removed };
  },

  /* 用系统浏览器打开外部链接 */
  'open-url'(_event: any, url: any) {
    const target = String(url || '').trim();
    if (!/^https?:\/\//i.test(target)) return { ok: false, reason: 'unsupported' };
    shell.openExternal(target);
    return { ok: true, url: target };
  },

};

module.exports = handlers;
