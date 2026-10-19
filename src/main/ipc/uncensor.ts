'use strict';

const fs = require('fs');
const path = require('path');
const { DIRS, platform, setPlatform, fetcher } = require('../../core/config/paths');
const { versionFileName, diffListName } = require('../../core/config');
const { fetchedRegions } = require('../../core/network/fetcher');
const { genPath } = require('../../core/config/paths');
const { runDiff } = require('../../core/manifest/diff');
const { buildRegion } = require('../../core/manifest/build');
const uncensor = require('../../core/uncensor/download');
const { resolveUncensorDirs } = require('../../core/uncensor/dirs');
const runner = require('../services/runner');
const { measure } = require('../services/file');
const appConfig = require('../services/config');
const settings = require('../../core/config/settings');
const { stamp, relToCwd } = require('../services/file');

const handlers = {
  /* 返回可选的基础与目标名单列表 */
  'diff-lists'(_event: any, payload: any = {}) {

    const dir = path.resolve(process.cwd(), payload.dir || DIRS.generated);

    const walk = (current) => {
      const found = [];
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (err) {
        return found;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (/_diff_files\.json$/i.test(entry.name)) found.push(full);
      }
      return found;
    };

    const lists = walk(dir).map((file) => {
      let info: any = {};
      try {
        info = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        info = {};
      }
      return {
        file,
        name: path.basename(file),
        region: info.region || '',
        platform: info.platform || '',
        count: Array.isArray(info.files) ? info.files.length : 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return { lists, platform: platform() };
  },

  /* 保存自定义名单文件 */
  'write-custom-list'(_event: any, payload: any = {}) {
    const region = String(payload.region || '').trim().toUpperCase();
    const plat = String(payload.platform || platform()).trim();
    const files = (Array.isArray(payload.files) ? payload.files : [])
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (!region) return { ok: false, error: '请填写目标区域' };
    if (!files.length) return { ok: false, error: 'files 为空，没有要下载的文件' };

    const file = path.resolve(process.cwd(), DIRS.customList, `custom_${region}_${plat}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ region, platform: plat, files }, null, 2)}\n`, 'utf8');
    return { ok: true, file, region, platform: plat, count: files.length };
  },

  /* 执行反和谐资源包下载 */
  uncensor(event: any, payload: any = {}) {
    const exe = fetcher();
    if (!exe) {
      return Promise.resolve({ ok: false, needFetcher: true, error: '未找到 ResourceFetcher' });
    }

    const merged = { ...appConfig.current(), ...payload, ...{ uncensor: { ...appConfig.current().uncensor, ...(payload.uncensor || {}) } } };

    const official = Boolean(payload.official);

    let listPath = merged.uncensor.list || '';
    let plat = payload.listPlatform || merged.platform;
    let base = String(payload.base || '');
    let target = String(payload.target || '');

    if (payload.custom) {
      const saved = handlers['write-custom-list'](event, payload.custom);
      if (!saved.ok) return Promise.resolve({ ok: false, error: saved.error });
      listPath = saved.file;
      plat = saved.platform;
      base = String(payload.custom.base || '');
      target = String(payload.custom.target || '');
    }

    if (!base || !target) {
      const pair = path.basename(listPath || '').match(/^([A-Za-z0-9]+)2([A-Za-z0-9]+)_gen_/i);
      if (pair) {
        base = base || pair[1].toUpperCase();
        target = target || pair[2].toUpperCase();
      }
    }

    setPlatform(plat);
    const region = payload.custom ? payload.custom.region : merged.uncensor.region;

    const isCustom = Boolean(payload.custom);
    const { pairName, dir, produced } = resolveUncensorDirs({
      official,
      custom: isCustom,
      region,
      platform: plat,
      base,
      target,
      resourceRoot: path.resolve(process.cwd(), merged.uncensor.dir || DIRS.resource),
      uncensorDefault: DIRS.uncensorDefault,
    });

    const moveAside = () => {
      if (official || dir === produced || merged.uncensor.dir || !fs.existsSync(dir)) return;
      fs.mkdirSync(produced, { recursive: true });
      for (const entry of fs.readdirSync(dir)) {
        fs.renameSync(path.join(dir, entry), path.join(produced, entry));
      }
    };
    const moveBack = () => {
      if (official || dir === produced || merged.uncensor.dir || !fs.existsSync(produced)) return;
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(produced, dir);

      const parent = path.dirname(produced);
      if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmSync(parent, { recursive: true, force: true });
    };

    const args = official
      ? uncensor.buildArgs({
        platform: plat,
        default: true,
        defaultDir: DIRS.uncensorDefault,
        timeout: merged.uncensor.timeout,
        retries: merged.uncensor.retries,
      })
      : uncensor.buildArgs({
        platform: plat,
        region,
        path: listPath || undefined,
        dir: merged.uncensor.dir || undefined,
        timeout: merged.uncensor.timeout,
        retries: merged.uncensor.retries,
      });

    return (async () => {
      runner.resetCancelled();
      runner.setBusy(true);
      moveAside();

      const { code } = await runner.streamCommand(event, exe, args, official ? 'uncensor 官方 (-d)' : `uncensor ${region}`);
      moveBack();
      const stat = fs.existsSync(dir) ? measure(dir) : { files: 0, bytes: 0 };
      runner.setBusy(false);
      if (runner.wasCancelled()) return { ok: false, aborted: true, official, custom: isCustom, region, pair: pairName, dir, files: stat.files, bytes: stat.bytes, platform: plat };
      return { ok: code === 0, official, custom: isCustom, region, pair: pairName, dir, files: stat.files, bytes: stat.bytes, platform: plat };
    })();
  },

  /* 对比两个区域的清单差异 */
  diff(_event: any, payload: any = {}) {
    const merged = { ...appConfig.current(), ...payload };
    const base = merged.base || 'CN';
    const target = merged.target || 'TW';
    const fetched = fetchedRegions(platform());

    const rebuilt = [];
    for (const region of [base, target]) {
      if (!fetched.includes(region)) {
        return { error: `${region} 还没有清单，请先在「抓取清单」里抓取` };
      }
      if (!fs.existsSync(genPath(region))) {

        buildRegion(region, { mode: merged.mode || 'snapshot' });
        rebuilt.push(region);
      }
    }

    const { report, outFile, listFile } = runDiff({
      baseRegion: base,
      targetRegion: target,
      preview: true,
    });
    return {
      summary: report.summary,
      config: { base: report.base.config, target: report.target.config },
      ext: report.ext,
      outFile,
      listFile,
      rebuilt,
      files: report.items.map((item) => item.file),
      items: report.items,

      same: report.sameItems || [],
    };
  },

  /* 读取已保存的差异结果 */
  'diff-result'(_event: any, payload: any = {}) {
    const config = appConfig.current() || settings.load();
    const base = payload.base || config.base || 'CN';
    const target = payload.target || config.target || 'TW';
    setPlatform(payload.platform || platform());

    const { runDiff: diffRun } = require('../../core/manifest/diff');
    for (const region of [base, target]) {
      if (!fetchedRegions(platform()).includes(region)) {
        return { error: `${region} 还没有清单，请先在「抓取清单」里抓取` };
      }
      if (!fs.existsSync(genPath(region))) buildRegion(region, { mode: 'snapshot' });
    }

    const { report, outFile, listFile } = diffRun({ baseRegion: base, targetRegion: target, preview: true });

    return {
      summary: report.summary,
      config: { base: report.base.config, target: report.target.config },
      ext: report.ext,
      items: report.items,
      same: report.sameItems || [],
      files: report.items.map((item) => item.file),

      list: report.items.map((item) => item.file),
      rebuilt: [],
      outFile,
      listFile,
      platform: platform(),
      baseRegion: base,
      targetRegion: target,

      reportJson: JSON.stringify({ ...report, sameItems: undefined }, null, 2),
    };
  },

  /* 读取 json 文件内容供界面预览 */
  'read-json'(_event: any, payload: any = {}) {
    const file = path.resolve(process.cwd(), String(payload.file || ''));
    if (!file.endsWith('.json')) return { file, error: '只支持 .json 文件' };
    if (!fs.existsSync(file)) return { file, error: '文件不存在' };

    const stat = fs.statSync(file);
    if (stat.size > 8 * 1024 * 1024) return { file, error: `文件太大（${(stat.size / 1048576).toFixed(1)}MB）` };

    return { file, size: stat.size, text: fs.readFileSync(file, 'utf8') };
  },

  /* 校验并写回 json 文件 */
  'write-json'(_event: any, payload: any = {}) {
    const file = path.resolve(process.cwd(), String(payload.file || ''));
    if (!file.endsWith('.json')) return { ok: false, error: '只支持 .json 文件' };

    let text = String(payload.text || '');
    try {
      text = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    } catch (err) {
      return { ok: false, error: `JSON 格式有误：${err.message}` };
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    return { ok: true, file, bytes: fs.statSync(file).size };
  },

  /* 保存编辑后的反和谐下载名单 */
  'save-diff-list'(_event: any, payload: any = {}) {
    const merged = { ...appConfig.current(), ...payload };
    const base = payload.base || 'CN';
    const target = payload.target || 'TW';
    const file = path.join(DIRS.generatedDiff, diffListName(base, target, platform()));
    const files = (Array.isArray(payload.list) ? payload.list : [])
      .map((item) => String(item).trim())
      .filter(Boolean);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ region: target, platform: platform(), files }, null, 2)}\n`, 'utf8');
    return { ok: true, file, count: files.length };
  },

  /* 分页查询清单里的条目供浏览预览 */
  'manifest-files'(_event: any, query: any) {
    const plat = query.platform || platform();
    setPlatform(plat);
    const source = query.source === 'resource' ? 'resource' : 'patch';
    const file = path.join(DIRS.manifest, query.region, `${plat}_${source}_manifest.json`);

    if (!fs.existsSync(file)) {
      return { file, total: 0, page: 1, pages: 0, items: [], error: '清单不存在，先抓取' };
    }

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const keyword = String(query.query || '').trim().toLowerCase();
    const order = query.order === 'Version' ? 'Version' : query.order === 'Hash' ? 'Hash' : 'FileName';
    const dir = query.dir === 'desc' ? -1 : 1;

    let names = Object.keys(data);
    if (keyword) names = names.filter((name) => name.toLowerCase().includes(keyword));

    names.sort((a, b) => {
      const va = order === 'Version' ? Number(data[a].Version) || 0 : order === 'Hash' ? String(data[a].Hash || '') : a;
      const vb = order === 'Version' ? Number(data[b].Version) || 0 : order === 'Hash' ? String(data[b].Hash || '') : b;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    const pageSize = 200;
    const pages = Math.max(1, Math.ceil(names.length / pageSize));
    const page = Math.min(Math.max(1, Number(query.page) || 1), pages);
    const start = (page - 1) * pageSize;
    const items = names.slice(start, start + pageSize).map((name) => ({
      file: name,
      version: data[name].Version,
      hash: data[name].Hash,
      extra: data[name].AdditionalPath || '',
    }));

    return { file, total: names.length, page, pages, items };
  },

};

module.exports = handlers;
