const fs = require('fs');
const path = require('path');
const { DIRS, platform, setPlatform, fetcher } = require('../core/config/paths');
const { versionFileName, diffListName, unity3dDiffName } = require('../core/config');
const { fetchedRegions } = require('../core/network/fetcher');
const { genPath, relative } = require('../core/config/paths');
const { runDiff } = require('../core/manifest/diff');
const { buildRegion } = require('../core/manifest/build');
const uncensor = require('../core/uncensor/download');
const { resolveUncensorDirs } = require('../core/uncensor/dirs');
const runner = require('../services/runner');
const runlog = require('../services/runlog');
const log = require('../core/log/log');
const { measure } = require('../services/file');
const appConfig = require('../services/config');
const settings = require('../core/config/settings');
const { stamp, relToCwd } = require('../services/file');

/** 扫描已生成的差异名单 */
function diffLists(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const dir = path.resolve(process.cwd(), payload.dir || DIRS.generated);

  const walk = (current: string): string[] => {
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

  const lists = walk(dir)
    .map((file) => {
      let info: any = {};
      try {
        info = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        info = {};
      }
      const name = path.basename(file);
      const fromName = name.match(/_([A-Za-z0-9]+)_diff_files\.json$/i);
      return {
        file,
        name,
        region: info.region || '',
        platform: String(info.platform || (fromName ? fromName[1] : '') || '').trim(),
        count: Array.isArray(info.files) ? info.files.length : 0
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { lists, platform: platform() };
}

/** 把自定义名单写成文件 */
function writeCustomList(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const region = String(payload.region || '')
    .trim()
    .toUpperCase();
  const plat = String(payload.platform || platform()).trim();
  const files = (Array.isArray(payload.files) ? payload.files : []).map((item) => String(item).trim()).filter(Boolean);
  if (!region) return { ok: false, error: '请填写目标区域' };
  if (!files.length) return { ok: false, error: 'files 为空，没有要下载的文件' };

  const file = path.resolve(process.cwd(), DIRS.customList, `custom_${region}_${plat}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ region, platform: plat, files }, null, 2)}\n`, 'utf8');
  return { ok: true, file, region, platform: plat, count: files.length };
}

/** 算出资源输出根目录 */
function outputRoots(merged: any): { customRoot: string; resourceRoot: string; officialRoot: string } {
  const customRoot = merged.uncensor.dir ? path.resolve(process.cwd(), merged.uncensor.dir) : '';
  return {
    customRoot,
    resourceRoot: customRoot || DIRS.resource,
    officialRoot: customRoot ? path.join(customRoot, 'Default') : DIRS.uncensorDefault
  };
}

/** 预览反和谐输出目录 */
function uncensorPreview(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const cfg = appConfig.current();
  const merged = { ...cfg, ...payload, ...{ uncensor: { ...cfg.uncensor, ...(payload.uncensor || {}) } } };
  const official = Boolean(payload.official);
  const isCustom = Boolean(payload.custom);
  const plat =
    payload.listPlatform || (isCustom ? String(payload.custom.platform || '').trim() : merged.platform) || platform();
  const region = official
    ? '官方'
    : isCustom
      ? String(payload.custom.region || '')
      : String(merged.uncensor.region || '');
  const { resourceRoot, officialRoot } = outputRoots(merged);

  let listPath = merged.uncensor.list || '';
  let base = String(payload.base || '');
  let target = String(payload.target || '');
  if (isCustom) {
    const regionCode = String(payload.custom.region || '')
      .trim()
      .toUpperCase();
    listPath = path.resolve(process.cwd(), DIRS.customList, `custom_${regionCode}_${plat}.json`);
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

  const { pairName, dir } = resolveUncensorDirs({
    official,
    custom: isCustom,
    region,
    platform: plat,
    base,
    target,
    resourceRoot,
    uncensorDefault: officialRoot
  });

  let name = '官方默认包';
  let fileCount: number | null = null;
  if (isCustom) {
    name = '自定义名单';
    fileCount = (payload.custom.files || []).filter((f) => String(f).trim()).length;
  } else if (!official) {
    name = payload.listName || (listPath ? path.basename(listPath) : '差异名单');
    if (listPath && fs.existsSync(listPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(listPath, 'utf8'));
        fileCount = Array.isArray(data.files) ? data.files.length : Array.isArray(data) ? data.length : null;
      } catch (err) {
        fileCount = null;
      }
    }
  }

  let existing = 0;
  if (fs.existsSync(dir)) {
    try {
      existing = measure(dir).files;
    } catch (err) {
      existing = 0;
    }
  }

  return {
    ok: true,
    name,
    region,
    platform: plat,
    pairName,
    fileCount,
    base: official ? 'CN' : base,
    target: official ? 'default' : target,
    listFile: official ? '' : listPath,
    files: isCustom ? (payload.custom.files || []).map((f) => String(f).trim()).filter(Boolean) : [],
    outputDir: dir,
    resourceRoot,
    existing,
    syncSource: official ? '' : isCustom ? '自定义名单' : '差异名单'
  };
}

/** 扫描输出目录并比对清单 */
function syncScan(event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  if (!String(payload.outputDir || '').trim()) return { ok: false, error: '没有指定输出目录' };
  const outputDir = path.resolve(String(payload.outputDir));

  const send = (phase: string, done: number, total: number, label: string): void => {
    if (event && typeof event.sender?.send === 'function') {
      event.sender.send('sync:progress', { phase, done, total, label });
    }
  };

  let names = [];
  const listed = String(payload.listFile || '').trim();
  if (listed && fs.existsSync(path.resolve(listed))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.resolve(listed), 'utf8'));
      names = (Array.isArray(data.files) ? data.files : Array.isArray(data) ? data : [])
        .map((f) => String(f).trim())
        .filter(Boolean);
    } catch (err) {
      return { ok: false, error: `读取清单失败：${err.message}` };
    }
  } else {
    names = (Array.isArray(payload.files) ? payload.files : []).map((f) => String(f).trim()).filter(Boolean);
  }
  if (!names.length) return { ok: false, error: '清单里没有文件，无法同步' };

  const files = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) files.push({ full, name: entry.name, rel: path.relative(outputDir, full) });
    }
  };
  if (fs.existsSync(outputDir)) walk(outputDir, 0);

  const norm = (name: string): string => path.basename(String(name)).toLowerCase();
  const byName = new Map();
  for (const f of files) {
    const key = norm(f.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(f);
  }

  const total = names.length + files.length;
  const missing = [],
    matched = [],
    extra = [];
  const used = new Set();
  let done = 0;

  const tick = () => {
    done += 1;
    if (done % 20 === 0 || done === total) send('scan', done, total, '比对文件');
  };

  for (const name of names) {
    const hit = (byName.get(norm(name)) || []).find((f) => !used.has(f.full));
    if (hit) {
      used.add(hit.full);
      matched.push(name);
    } else missing.push(name);
    tick();
  }
  for (const f of files) {
    if (!used.has(f.full)) extra.push({ name: f.name, path: f.full, rel: f.rel });
    tick();
  }
  send('scan', total, total, '扫描完成');
  return { ok: true, outputDir, total, missing, matched, extra };
}

/** 清理输出目录里的多余文件 */
function syncClean(event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  if (!String(payload.outputDir || '').trim()) return { ok: false, error: '没有指定输出目录' };
  const root = path.resolve(String(payload.outputDir));
  const list = Array.isArray(payload.files) ? payload.files : [];

  const send = (done: number, total: number, label: string): void => {
    if (event && typeof event.sender?.send === 'function') {
      event.sender.send('sync:progress', { phase: 'clean', done, total, label });
    }
  };

  let removed = 0,
    failed = 0;
  for (let i = 0; i < list.length; i += 1) {
    const target = path.resolve(String(list[i] || ''));
    if (target === root || !target.startsWith(root + path.sep)) {
      failed += 1;
    } else {
      try {
        fs.rmSync(target, { force: true });
        removed += 1;
      } catch (err) {
        failed += 1;
      }
    }
    send(i + 1, list.length, '清理文件');
  }
  return { ok: true, removed, failed };
}

/** 下载反和谐资源并落盘 */
function uncensorHandler(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const exe = fetcher();
  if (!exe) {
    return Promise.resolve({ ok: false, needFetcher: true, error: '未找到 ResourceFetcher' });
  }

  const merged = {
    ...appConfig.current(),
    ...payload,
    ...{ uncensor: { ...appConfig.current().uncensor, ...(payload.uncensor || {}) } }
  };

  const official = Boolean(payload.official);

  let listPath = merged.uncensor.list || '';
  let plat = payload.listPlatform || merged.platform;
  let base = String(payload.base || '');
  let target = String(payload.target || '');

  if (payload.custom) {
    const saved = writeCustomList(event, payload.custom);
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

  const { resourceRoot, officialRoot } = outputRoots(merged);

  const { pairName, dir, produced } = resolveUncensorDirs({
    official,
    custom: isCustom,
    region,
    platform: plat,
    base,
    target,
    resourceRoot,
    uncensorDefault: officialRoot
  });

  const moveAside = (): void => {
    if (official || dir === produced || merged.uncensor.dir || !fs.existsSync(dir)) return;
    fs.mkdirSync(produced, { recursive: true });
    for (const entry of fs.readdirSync(dir)) {
      fs.renameSync(path.join(dir, entry), path.join(produced, entry));
    }
  };

  const moveBack = (): void => {
    if (official || dir === produced || merged.uncensor.dir || !fs.existsSync(produced)) return;
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(produced, dir);

    const parent = path.dirname(produced);
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0)
      fs.rmSync(parent, { recursive: true, force: true });
  };

  const clear = Boolean(payload.clear);
  const overwrite = Boolean(payload.overwrite);

  const cacheDir = official
    ? path.join(officialRoot, 'Metadata')
    : path.join(DIRS.uncensor, 'Metadata', String(region || ''), String(plat || ''));
  const productDir = dir;

  const wipe = (target: string, root: string): void => {
    const resolved = path.resolve(String(target || ''));
    const base = path.resolve(String(root || ''));
    if (!target || (resolved !== base && !resolved.startsWith(base + path.sep))) return;
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    }
  };

  const args = official
    ? uncensor.buildArgs({
        platform: plat,
        default: true,
        defaultDir: officialRoot,
        timeout: merged.uncensor.timeout,
        retries: merged.uncensor.retries,
        overwrite
      })
    : uncensor.buildArgs({
        platform: plat,
        region,
        path: listPath || undefined,
        dir: merged.uncensor.dir || undefined,
        timeout: merged.uncensor.timeout,
        retries: merged.uncensor.retries,
        overwrite
      });

  return (async () => {
    runner.resetCancelled();
    runner.setBusy(true);

    const send = (text: string): void =>
      runlog.push(event, {
        line: log.format('TIPS', text),
        stream: 'out',
        label: 'uncensor',
        scope: 'uncensor',
        at: stamp()
      });

    const countOf = (p: string): number => {
      try {
        return fs.existsSync(p) ? measure(p).files : 0;
      } catch (err) {
        return 0;
      }
    };
    if (clear || overwrite) {
      const productBefore = countOf(productDir) + (official ? 0 : countOf(produced));
      const cacheBefore = clear ? countOf(cacheDir) : 0;
      wipe(productDir, official ? officialRoot : resourceRoot);
      if (!official) wipe(produced, resourceRoot);
      if (clear) wipe(cacheDir, official ? officialRoot : DIRS.uncensor);
      send(
        clear
          ? `清空并下载：已删除 ${productBefore} 个本地资源（${relToCwd(productDir)}）与 ${cacheBefore} 个缓存文件（${relToCwd(cacheDir)}），本次全部重新下载`
          : `覆盖并下载：已删除 ${productBefore} 个本地资源（${relToCwd(productDir)}）强制重写${official ? '（官方默认包无独立缓存，会重新下载）' : '，下载缓存保留'}`
      );
    }
    moveAside();

    const { code } = await runner.streamCommand(
      event,
      exe,
      args,
      official ? 'uncensor 官方 (-d)' : `uncensor ${region}`,
      'uncensor'
    );
    moveBack();
    const stat = fs.existsSync(dir) ? measure(dir) : { files: 0, bytes: 0 };
    runner.setBusy(false);
    if (runner.wasCancelled())
      return {
        ok: false,
        aborted: true,
        official,
        custom: isCustom,
        region,
        pair: pairName,
        dir,
        files: stat.files,
        bytes: stat.bytes,
        platform: plat
      };
    return {
      ok: code === 0,
      official,
      custom: isCustom,
      region,
      pair: pairName,
      dir,
      files: stat.files,
      bytes: stat.bytes,
      platform: plat
    };
  })();
}

/** 检查区域清单是否齐全 */
function manifestStatus(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const plat = payload.platform || platform();
  const fetched = fetchedRegions(plat);
  const regions = Array.isArray(payload.regions) ? payload.regions : [];
  const missing = regions.filter((region) => region && !fetched.includes(region));
  return { ok: true, platform: plat, fetched, missing };
}

/** 重建单个区域的清单文件 */
function reviveRegionMani(
  region: string,
  mode: string = 'snapshot'
): {
  region: string;
  out: string;
  resources: number;
  resVer: string;
  clientVer: string;
  gameVer: string;
  changed: boolean;
} {
  const out = genPath(region);
  const before = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  const built = buildRegion(region, { mode });

  const header = (key: string): string => {
    const hit = built.lines.find((line) => line.startsWith(`$${key}:`));
    return hit ? hit.slice(key.length + 2) : '';
  };
  return {
    region,
    out: relative(out),
    resources: built.lines.filter((line) => !line.startsWith('$')).length,
    resVer: header('RES_VER'),
    clientVer: header('CLIENT_VER'),
    gameVer: header('GAME_VER'),
    changed: before !== built.text
  };
}

/** 批量重建各区域清单 */
function rebuildMani(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  if (payload.platform) setPlatform(payload.platform);
  const plat = platform();
  const fetched = fetchedRegions(plat);
  const wanted = (Array.isArray(payload.regions) && payload.regions.length ? payload.regions : fetched).filter(Boolean);
  const rebuilt = [];
  const missing = [];
  for (const region of wanted) {
    if (!fetched.includes(region)) {
      missing.push(region);
      continue;
    }
    rebuilt.push(reviveRegionMani(region, payload.mode || 'snapshot'));
  }
  return { ok: missing.length === 0, platform: plat, rebuilt, missing };
}

/** 对比两个区域的清单差异 */
function diff(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const merged = { ...appConfig.current(), ...payload };
  const base = merged.base || 'CN';
  const target = merged.target || 'TW';
  const fetched = fetchedRegions(platform());

  const rebuilt = [];
  for (const region of [base, target]) {
    if (!fetched.includes(region)) {
      return { error: `${region} 还没有清单，请先在「抓取清单」里抓取` };
    }
    if (reviveRegionMani(region, merged.mode || 'snapshot').changed) rebuilt.push(region);
  }

  const { report, outFile, listFile } = runDiff({
    baseRegion: base,
    targetRegion: target,
    preview: true
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
    same: report.sameItems || []
  };
}

/** 返回差异结果详情 */
function diffResult(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const config = appConfig.current() || settings.load();
  const base = payload.base || config.base || 'CN';
  const target = payload.target || config.target || 'TW';
  setPlatform(payload.platform || platform());

  const { runDiff: diffRun } = require('../core/manifest/diff');
  const revived = [];
  for (const region of [base, target]) {
    if (!fetchedRegions(platform()).includes(region)) {
      return { error: `${region} 还没有清单，请先在「抓取清单」里抓取` };
    }
    revived.push(reviveRegionMani(region));
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
    outFile,
    listFile,
    rebuilt: revived.filter((item) => item.changed).map((item) => item.region),
    svn: revived,
    platform: platform(),
    baseRegion: base,
    targetRegion: target,
    reportJson: JSON.stringify({ ...report, sameItems: undefined }, null, 2)
  };
}

/** 读取界面请求的 JSON 文件 */
function readJson(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const file = path.resolve(process.cwd(), String(payload.file || ''));
  if (!file.endsWith('.json')) return { file, error: '只支持 .json 文件' };
  if (!fs.existsSync(file)) return { file, error: '文件不存在' };

  const stat = fs.statSync(file);
  if (stat.size > 8 * 1024 * 1024) return { file, error: `文件太大（${(stat.size / 1048576).toFixed(1)}MB）` };
  return { file, size: stat.size, text: fs.readFileSync(file, 'utf8') };
}

/** 校验后写回 JSON 文件 */
function writeJson(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
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
}

/** 把差异文件列表存成名单 */
function saveDiffList(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const merged = { ...appConfig.current(), ...payload };
  const base = payload.base || 'CN';
  const target = payload.target || 'TW';
  if (payload.platform) setPlatform(payload.platform);
  const plat = platform();
  const file = path.join(DIRS.generatedDiff, diffListName(base, target, plat));
  const files = (Array.isArray(payload.list) ? payload.list : []).map((item) => String(item).trim()).filter(Boolean);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ region: target, platform: plat, files }, null, 2)}\n`, 'utf8');
  return { ok: true, file, count: files.length };
}

/** 分页查询清单文件条目 */
function manifestFiles(_event: Electron.IpcMainInvokeEvent, query: Record<string, any>): Record<string, any> {
  const plat = query.platform || platform();
  setPlatform(plat);
  const source = query.source === 'resource' ? 'resource' : 'patch';
  const file = path.join(DIRS.manifest, query.region, `${plat}_${source}_manifest.json`);

  if (!fs.existsSync(file)) {
    return { file, total: 0, page: 1, pages: 0, items: [], error: '清单不存在，先抓取' };
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keyword = String(query.query || '')
    .trim()
    .toLowerCase();
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

  const pageSize = 100;
  const pages = Math.max(1, Math.ceil(names.length / pageSize));
  const page = Math.min(Math.max(1, Number(query.page) || 1), pages);
  const start = (page - 1) * pageSize;
  const items = names.slice(start, start + pageSize).map((name) => ({
    file: name,
    version: data[name].Version,
    hash: data[name].Hash,
    extra: data[name].AdditionalPath || ''
  }));
  return { file, total: names.length, page, pages, items };
}

const VIEW_LIMIT = 32 * 1024 * 1024;

/** 读取清单原文并截断 */
function manifestText(_event: Electron.IpcMainInvokeEvent, query: any = {}): Record<string, any> {
  const plat = query.platform || platform();
  const source = query.source === 'resource' ? 'resource' : 'patch';
  const file = path.join(DIRS.manifest, query.region, `${plat}_${source}_manifest.json`);
  if (!fs.existsSync(file)) return { file, error: '清单不存在，先抓取' };

  const size = fs.statSync(file).size;
  if (size <= VIEW_LIMIT) return { file, size, text: fs.readFileSync(file, 'utf8'), truncated: false };

  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(VIEW_LIMIT);
  fs.readSync(fd, buf, 0, VIEW_LIMIT, 0);
  fs.closeSync(fd);
  return { file, size, text: buf.toString('utf8'), truncated: true };
}

/** 列出差异结果目录文件 */
function listDiffResult(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const base = payload.base || 'CN';
  const target = payload.target || 'TW';
  if (payload.platform) setPlatform(payload.platform);
  const plat = platform();
  const dir = DIRS.generatedDiff;

  const files: any[] = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let stat: any = null;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      files.push({ name, path: full, size: stat.size, modified: stat.mtimeMs });
    }
  } catch {}
  return {
    ok: true,
    dir,
    platform: plat,
    base,
    target,
    listFile: path.join(dir, diffListName(base, target, plat)),
    outFile: path.join(dir, unity3dDiffName(base, target, plat)),
    files
  };
}

/** 校验差异结果文件名 */
function diffResultFileOf(raw: string): { name: string; dir: string; full: string } | null {
  const name = path.basename(String(raw || '').trim());
  if (!name || name === '.' || name === '..') return null;
  const dir = path.resolve(DIRS.generatedDiff);
  return { name, dir, full: path.join(dir, name) };
}

/** 删除单个差异结果文件 */
function deleteDiffResult(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const hit = diffResultFileOf(payload.name || payload.file);
  if (!hit) return { ok: false, error: '没有指定要删除的文件' };
  if (!fs.existsSync(hit.full)) return { ok: false, error: `文件不存在：${hit.name}` };

  let stat: any = null;
  try {
    stat = fs.statSync(hit.full);
  } catch (err) {
    return { ok: false, error: `读取失败：${err.message}` };
  }
  if (!stat.isFile()) return { ok: false, error: `只能删除文件：${hit.name}` };

  try {
    fs.rmSync(hit.full, { force: true });
  } catch (err) {
    return { ok: false, error: `删除失败：${err.message}` };
  }
  return { ok: true, name: hit.name, bytes: stat.size, dir: hit.dir };
}

/** 清空全部差异结果文件 */
function clearDiffResult(): Record<string, any> {
  const dir = path.resolve(DIRS.generatedDiff);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return { ok: true, count: 0, bytes: 0, failed: [] as string[], dir };
  }

  let count = 0;
  let bytes = 0;
  const failed: string[] = [];
  for (const name of names) {
    const full = path.join(dir, name);
    let stat: any = null;
    try {
      stat = fs.statSync(full);
    } catch (err) {
      continue;
    }
    if (!stat.isFile()) continue;
    try {
      fs.rmSync(full, { force: true });
      count += 1;
      bytes += stat.size;
    } catch (err) {
      failed.push(name);
    }
  }
  return { ok: failed.length === 0, count, bytes, failed, dir };
}

/** 注册反和谐相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('diff-lists', diffLists);
  handle('write-custom-list', writeCustomList);
  handle('uncensor', uncensorHandler);
  handle('uncensor-preview', uncensorPreview);
  handle('sync-scan', syncScan);
  handle('sync-clean', syncClean);
  handle('manifest-status', manifestStatus);
  handle('diff', diff);
  handle('diff-result', diffResult);
  handle('rebuild-mani', rebuildMani);
  handle('read-json', readJson);
  handle('write-json', writeJson);
  handle('save-diff-list', saveDiffList);
  handle('list-diff-result', listDiffResult);
  handle('delete-diff-result', deleteDiffResult);
  handle('clear-diff-result', clearDiffResult);
  handle('manifest-files', manifestFiles);
  handle('manifest-text', manifestText);
}

module.exports = { register };
