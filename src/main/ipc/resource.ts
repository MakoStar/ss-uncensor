const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const os = require('os');
const { DIRS, platform, setPlatform } = require('../core/config/paths');
const { spawn } = require('child_process');
const settings = require('../core/config/settings');
const { versionFileName } = require('../core/config');
const { zipDir, zipFiles, listZip, unzipTo, listFiles } = require('../services/zip');
const { resolveUncensorDirs } = require('../core/uncensor/dirs');
const log = require('../core/log/log');
const { gameDirOf } = require('./settings');
const {
  TARGETS,
  TARGET_KEYS,
  BACKUP_PREFIX_RE,
  shortNames,
  labels,
  channelOf,
  backupDirName
} = require('../core/config/targets');
const { spawnSync } = require('child_process');

/** 把路径转成 tar 可用格式 */
const tarPath = (target: string): string => path.resolve(target).replace(/\\/g, '/');
const { stamp, measure, relToCwd, tarCommand } = require('../services/file');
const runlog = require('../services/runlog');

let backupCancel = null;

let replaceAbort = null;

const PACKAGE_PLATFORMS = ['win', 'and', 'ios'];

/** 判断资源包是备份还是模组 */
function packageTypeOf(name: string): 'backup' | 'mod' {
  return BACKUP_PREFIX_RE.test(String(name || '')) ? 'backup' : 'mod';
}

/** 从文件名推断平台代号 */
function packagePlatformOf(name: string): string {
  const tokens = String(name || '')
    .replace(/\.(zip|tar\.gz)$/i, '')
    .split(/[_\-.]/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  return tokens.find((token) => PACKAGE_PLATFORMS.includes(token)) || '';
}

/** 找出本次备份的残留分包 */
function partialFiles(dir: string, tag: string, shortNames: Record<string, string>): string[] {
  const prefix = Object.values(shortNames).filter(Boolean);
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.zip') && name.includes(tag) && prefix.some((p) => name.startsWith(`${p}_`)))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/** 比对资源包内文件与游戏目录 */
async function matchPackageFiles(file: string): Promise<Record<string, any>> {
  const entries = await listZip(file);
  const dirs = Object.fromEntries(TARGET_KEYS.map((key) => [key, gameDirOf(key)]));
  const matched = Object.fromEntries(TARGET_KEYS.map((key) => [key, []]));
  const missing = [];
  const seen = new Set();

  for (const entry of entries) {
    const base = path.posix.basename(entry.name);
    if (!base || base.endsWith('/') || seen.has(base)) continue;
    seen.add(base);

    let hit = false;
    for (const key of TARGET_KEYS) {
      if (dirs[key] && fs.existsSync(path.join(dirs[key], base))) {
        matched[key].push(base);
        hit = true;
      }
    }
    if (!hit) missing.push(base);
  }
  return { ...matched, missing, total: entries.length };
}

/** 列出可用的待备份资源包 */
function backupPackages(): Record<string, any> {
  const packDir = DIRS.package;
  const items = [];
  for (const entry of fs.existsSync(packDir) ? fs.readdirSync(packDir, { withFileTypes: true }) : []) {
    if (!entry.isFile() || !/\.(zip|tar\.gz)$/i.test(entry.name)) continue;
    if (BACKUP_PREFIX_RE.test(entry.name)) continue;
    const file = path.join(packDir, entry.name);
    const stat = fs.statSync(file);
    items.push({
      file,
      name: entry.name,
      tag: entry.name.replace(/\.(zip|tar\.gz)$/i, ''),
      bytes: stat.size,
      mtime: stat.mtimeMs
    });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return { items };
}

/** 按包比对游戏目录里的文件 */
async function matchPackageFilesHandler(
  _event: Electron.IpcMainInvokeEvent,
  payload: any = {}
): Promise<Record<string, any>> {
  const file = payload.file || '';
  if (!fs.existsSync(file)) return { ok: false, error: '资源包不存在' };
  const matched = await matchPackageFiles(file);
  return { ok: true, file, ...matched };
}

/** 把游戏资源打包备份 */
async function backupResource(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  if (!targets.length) return { ok: false, error: '没有选择要备份的目录' };

  const cancel = { cancelled: false };
  backupCancel = cancel;

  const channel = channelOf(settings.load().gameDir);
  const defaultDest = path.join(DIRS.package, 'backup', backupDirName(channel));
  const custom = Boolean(String(payload.dest || '').trim());
  const dest = path.resolve(custom ? payload.dest : defaultDest);
  fs.mkdirSync(dest, { recursive: true });

  const packageFile = String(payload.packageFile || '').trim();
  let scoped = null;
  if (packageFile) {
    if (!fs.existsSync(packageFile)) return { ok: false, error: '反和谐资源包不存在' };
    scoped = await matchPackageFiles(packageFile);
    const empty = targets.filter((t) => !(scoped[t] || []).length);
    if (targets.length === empty.length) {
      return { ok: false, error: '这个反和谐资源包里的文件，在游戏目录中一个都没找到' };
    }
  }

  let totalBytes = 0;
  for (const target of targets) {
    const src = gameDirOf(target);
    if (!src) continue;
    const names = scoped ? scoped[target] : null;
    const files = names ? names.map((name) => ({ full: path.join(src, name), rel: name })) : listFiles(src);
    for (const file of files) totalBytes += fs.statSync(file.full).size;
  }

  const stampValue = new Date();

  const pad = (n: number): string => String(n).padStart(2, '0');

  const tag = `${pad(stampValue.getMonth() + 1)}${pad(stampValue.getDate())}_${pad(stampValue.getHours())}${pad(stampValue.getMinutes())}${pad(stampValue.getSeconds())}`;
  const names = labels();
  const shorts = shortNames();

  const packageTag = scoped ? path.basename(packageFile).replace(/\.(zip|tar\.gz)$/i, '') : '';

  const tagShort = packageTag.replace(/\.\d+(\.\d+)*$/, '');

  const made = [];

  let doneBytes = 0;
  let prevCum = 0;

  const report = (cum: number): void => {
    if (cum < prevCum) prevCum = 0;
    doneBytes += cum - prevCum;
    prevCum = cum;
    if (event && typeof event.sender?.send === 'function') {
      event.sender.send('backup:progress', { written: doneBytes, total: totalBytes });
    }
  };

  try {
    for (const target of targets) {
      const src = gameDirOf(target);
      if (!src) return { ok: false, error: `未找到 ${names[target]} 目录，先选一个有效的游戏目录` };

      const outFile = path.join(dest, `${shorts[target]}${tagShort ? `_${tagShort}` : ''}_${tag}.zip`);
      const opts = { onProgress: report, isCancelled: () => cancel.cancelled };

      const picked = scoped ? scoped[target] : null;
      if (picked && !picked.length) continue;
      const result = picked
        ? await zipFiles(
            picked.map((name) => ({ full: path.join(src, name), rel: name })),
            outFile,
            opts
          )
        : await zipDir(src, outFile, opts);
      made.push({
        file: outFile,
        name: path.basename(outFile),
        target,
        bytes: result.bytes,
        files: result.files,
        scope: packageTag ? 'package' : 'full',
        tag: packageTag,
        packageFile: packageTag ? packageFile : '',
        channel
      });
    }
  } catch (err) {
    if (err.code === 'ZIP_ABORTED') {
      const leftovers = [...made.map((item) => item.file), ...partialFiles(dest, tag, shorts)];
      for (const file of leftovers) {
        try {
          fs.rmSync(file, { force: true });
        } catch {}
      }
      return { ok: false, aborted: true, error: '备份已中断，未保存任何文件' };
    }
    throw err;
  } finally {
    backupCancel = null;
  }

  const current = settings.load();
  if (custom) current.backupDir = dest;
  current.backups = [
    ...made.map((item) => ({
      file: item.file,
      name: item.name,
      target: item.target,
      bytes: item.bytes,
      time: stampValue.toISOString(),
      scope: item.scope,
      tag: item.tag,
      packageFile: item.packageFile,
      channel: item.channel
    })),
    ...(current.backups || [])
  ];
  settings.save(current);
  return { ok: true, dest, channel, tag: packageTag, backups: made };
}

/** 中断正在进行的备份 */
function abortBackup(): Record<string, any> {
  if (!backupCancel) return { ok: false, reason: '当前没有进行中的备份' };
  backupCancel.cancelled = true;
  return { ok: true };
}

/** 推断备份所属的服务器渠道 */
function channelOfBackup(item: Record<string, any>): string {
  const saved = String(item.channel || '');
  if (saved === 'official' || saved === 'bili' || saved === 'unknown') return saved;
  const segs = String(item.file || '')
    .split(/[\\/]/)
    .map((seg) => seg.toLowerCase());
  if (segs.includes('official')) return 'official';
  if (segs.includes('bilibili')) return 'bili';
  return 'unknown';
}

/** 列出已登记的备份记录 */
function listBackups(): Record<string, any> {
  const current = settings.load();
  const channel = channelOf(current.gameDir);
  const items = (current.backups || [])
    .filter((item) => item.file)
    .map((item) => {
      let bytes = 0;
      let missing = false;
      try {
        const stat = fs.statSync(item.file);
        if (stat.isFile()) bytes = stat.size;
        else missing = true;
      } catch (err) {
        missing = true;
      }
      return { ...item, channel: channelOfBackup(item), bytes, missing };
    })
    .sort((a, b) => (a.time < b.time ? 1 : -1));
  return {
    items,
    missing: items.filter((item) => item.missing).length,
    backupDir: current.backupDir || path.join(DIRS.package, 'backup', backupDirName(channel)),
    channel
  };
}

/** 删除备份文件并摘除登记 */
function deleteBackup(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const file = payload.file || '';
  if (!file) return { ok: false, error: '没有指定备份文件' };

  const current = settings.load();
  const entry = (current.backups || []).find((item) => item.file === file);
  if (!entry) return { ok: false, error: '这条备份不在登记列表里' };

  try {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  } catch (err) {
    return { ok: false, error: `删除失败：${err.message}` };
  }

  current.backups = current.backups.filter((item) => item.file !== file);
  settings.save(current);
  return { ok: true, file, name: entry.name, bytes: entry.bytes };
}

/** 用备份还原游戏目录 */
async function restoreBackup(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const file = payload.file || '';
  const target = payload.target || '';
  if (!fs.existsSync(file)) return { ok: false, error: `备份文件不存在：${file}` };

  const src = gameDirOf(target);
  if (!src) return { ok: false, error: '未找到目标目录，先确认游戏目录有效' };

  const partial = payload.scope === 'package';
  if (!partial) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      fs.rmSync(path.join(src, entry.name), { recursive: true, force: true });
    }
  }
  const result = await unzipTo(file, src, {
    onProgress: (done, zipTotal) => {
      if (event && typeof event.sender?.send === 'function') {
        event.sender.send('restore:progress', { target, written: done, total: zipTotal });
      }
    }
  });
  return { ok: true, target, file, entries: result.entries, bytes: result.bytes, dir: src, partial };
}

/** 把反和谐包覆盖到游戏目录 */
async function replaceResource(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  if (!targets.length) return { ok: false, error: '没有选择要替换的目录' };

  const packageFile = String(payload.packageFile || '').trim();
  if (!packageFile || !fs.existsSync(packageFile)) return { ok: false, error: '反和谐资源包不存在' };

  const cancel = { cancelled: false };
  replaceAbort = cancel;

  const names = labels();
  const dirs = {};
  for (const target of targets) {
    const dir = gameDirOf(target);
    if (!dir) return { ok: false, error: `未找到 ${names[target]} 目录，先选一个有效的游戏目录` };
    dirs[target] = dir;
  }

  const entries = (await listZip(packageFile)).filter((entry) => {
    const base = path.posix.basename(entry.name);
    return base && !base.endsWith('/');
  });
  const zipBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const totalBytes = zipBytes * targets.length;

  const tag = path.basename(packageFile).replace(/\.(zip|tar\.gz)$/i, '');
  let offset = 0;
  const counts = {};
  try {
    for (const target of targets) {
      const result = await unzipTo(packageFile, dirs[target], {
        onProgress: (done, partTotal) => {
          if (event && typeof event.sender?.send === 'function') {
            event.sender.send('replace:progress', { written: offset + done, total: totalBytes });
          }
        },
        isCancelled: () => cancel.cancelled,
        pick: (name) => ({ dest: dirs[target], rel: path.posix.basename(name) })
      });
      counts[target] = result.entries;
      offset += zipBytes;
    }
  } catch (err) {
    if (err.code === 'ZIP_ABORTED') return { ok: false, aborted: true, error: '替换已中断' };
    throw err;
  } finally {
    replaceAbort = null;
  }

  const current = settings.load();
  current.replaces = [
    {
      tag,
      file: packageFile,
      targets,
      counts,
      bytes: totalBytes,
      time: new Date().toISOString()
    },
    ...(current.replaces || [])
  ];
  settings.save(current);
  return { ok: true, file: packageFile, tag, counts, bytes: totalBytes };
}

/** 把目录打包成资源包 */
async function packageZip(event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const send = (line: string): void =>
    runlog.push(event, { line, stream: 'out', label: 'package', scope: 'resources', at: stamp() });
  const dir = path.resolve(process.cwd(), String(payload.dir || ''));
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `目录不存在：${relToCwd(dir)}` };
  }

  const plat = String(payload.platform || platform());

  let base = String(payload.base || '');
  let target = String(payload.target || '');
  let clientVer = String(payload.clientVer || '');
  if ((!base || !target || !clientVer) && fs.existsSync(DIRS.generatedDiff)) {
    const candidates = fs
      .readdirSync(DIRS.generatedDiff)
      .filter((f) => f.endsWith('_unity3d_diff.json'))
      .map((f) => {
        const pair = f.match(/^([A-Za-z0-9]+)2([A-Za-z0-9]+)_gen_/);
        if (!pair) return null;
        const file = path.join(DIRS.generatedDiff, f);
        let ver = '';
        try {
          ver = ((JSON.parse(fs.readFileSync(file, 'utf8')).base || {}).config || {}).CLIENT_VER || '';
        } catch (err) {
          ver = '';
        }
        return {
          file,
          base: pair[1].toUpperCase(),
          target: pair[2].toUpperCase(),
          ver,
          mtime: fs.statSync(file).mtimeMs
        };
      })
      .filter(Boolean)
      .filter((item) => {
        if (target && item.target !== target) return false;
        if (base && item.base !== base) return false;
        return true;
      })
      .sort((a, b) => b.mtime - a.mtime);

    const best = candidates[0];
    if (best) {
      base = base || best.base;
      target = target || best.target;
      clientVer = clientVer || best.ver;
    }
  }

  const official = Boolean(payload.official);
  const isCustom = Boolean(payload.custom);
  const versionBase = official ? base || 'CN' : base;
  if (official) {
    base = 'CN';
    target = 'default';
  }
  if (isCustom) {
    base = 'custom';
    target = String(payload.region || target || '').toLowerCase();
  }

  let gameVer = String(payload.gameVer || '');
  if (!gameVer && versionBase) {
    try {
      const versionData = JSON.parse(fs.readFileSync(path.join(DIRS.manifest, versionFileName(plat)), 'utf8'));
      gameVer = ((versionData || {})[versionBase] || {}).game_ver || '';
    } catch (err) {
      gameVer = '';
    }
  }

  const pairName = base && target ? `${base.toLowerCase()}2${target.toLowerCase()}` : 'official';
  const preferred =
    (official || isCustom) && gameVer
      ? `${plat}_${base.toLowerCase()}_${target.toLowerCase()}_${gameVer}.zip`
      : `${plat}_${pairName}${gameVer ? `.${gameVer}` : clientVer ? `_${clientVer}` : ''}.zip`;
  const name = preferred;
  const file = path.join(DIRS.package, name);

  if (payload.dryRun) {
    return {
      ok: true,
      dryRun: true,
      needConfirm: fs.existsSync(file),
      name,
      file,
      bytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
      seconds: 0
    };
  }

  if (fs.existsSync(file) && !payload.overwrite) {
    return {
      ok: false,
      needConfirm: true,
      file,
      name,
      bytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
      seconds: 0
    };
  }
  fs.mkdirSync(DIRS.package, { recursive: true });
  try {
    fs.rmSync(file, { force: true });
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    fs.rmSync(file, { force: true });
  }

  const attempt = (label: string, command: string, args: string[]): void => {
    const result = spawnSync(command, args, { cwd: path.dirname(dir), windowsHide: true });
    if (result.error || result.status !== 0) {
      const detail = String(result.stderr || result.error || result.status)
        .trim()
        .split('\n')[0];
      throw new Error(`${label} 失败：${detail}`);
    }
  };

  const total = measure(dir).files;
  const zipStartedAt = Date.now();

  const withSeconds = (result: Record<string, any>): Record<string, any> => ({
    ...result,
    seconds: Math.round((Date.now() - zipStartedAt) / 100) / 10
  });

  const streamTar = (opts: Record<string, any> = payload): Promise<any> =>
    new Promise((resolve) => {
      const args = ['-a', '-cf', tarPath(file), '-C', tarPath(dir), '.'];
      if (!opts.compress) args.push('-0');
      const child = spawn(tarCommand(), args, { windowsHide: true });

      const bytes = measure(dir).bytes;
      if (bytes > 0) {
        const timer = setInterval(() => {
          let size = 0;
          try {
            size = fs.statSync(file).size;
          } catch (err) {
            size = 0;
          }
          event.sender.send('package:progress', { done: size, total: bytes, file });
        }, 300);
        child.on('close', () => clearInterval(timer));
      }
      let done = 0;
      let buffer = '';
      let stderr = '';

      let lastSent = 0;

      const count = (chunk: Buffer): void => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        if (!lines.length) return;
        done += lines.length;

        const now = Date.now();
        if (now - lastSent < 60 && done < total) return;
        lastSent = now;
        event.sender.send('package:progress', { done: Math.min(done, total), total, file });
      };

      child.stdout.on('data', count);
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        count(chunk);
      });
      child.on('error', (err) => resolve({ ok: false, error: err.message }));
      child.on('close', (code) => {
        if (code !== 0 || !fs.existsSync(file)) {
          resolve({ ok: false, error: String(stderr).trim().split('\n')[0] || `tar 退出码 ${code}` });
          return;
        }
        resolve(withSeconds({ ok: true, file, bytes: fs.statSync(file).size }));
      });
    });

  try {
    const zipped = await zipDir(dir, file, {
      onProgress: (written) =>
        event.sender.send('package:progress', {
          done: written,
          total: measure(dir).bytes,
          file
        })
    });
    return withSeconds({
      ok: true,
      file: zipped.file,
      bytes: zipped.bytes,
      files: zipped.files,
      engine: '内置 zip（不压缩）'
    });
  } catch (zipError) {
    send(log.format('TIPS', `内置打包失败(${zipError.message}), 改用系统 tar`));
  }

  const packed = await streamTar();
  if (packed.ok) return packed;

  if (/Couldn't visit|No such file/i.test(String(packed.error)) && !payload.retried) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (fs.existsSync(dir)) return withSeconds(await streamTar({ ...payload, retried: true }));
    return packed;
  }

  if (!payload.compress) {
    const retry = await streamTar({ compress: true, retried: true });
    if (retry.ok) return withSeconds(retry);
    return packed;
  }

  try {
    if (process.platform === 'win32') {
      const shellExe = ['power' + 'shell'].join('');
      attempt('内置打包', shellExe, [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${dir}\\*' -DestinationPath '${file}' -Force`
      ]);
    } else {
      const fallback = file.replace(/\.zip$/, '.tar.gz');
      attempt('tar.gz', tarCommand(), ['-czf', tarPath(fallback), '-C', tarPath(dir), '.']);
      return withSeconds({ ok: true, file: fallback, bytes: fs.statSync(fallback).size, degraded: true });
    }
  } catch (fallbackError) {
    return { ok: false, error: `${packed.error}；备用方案也失败：${fallbackError.message}` };
  }

  return withSeconds({ ok: true, file, bytes: fs.statSync(file).size, fallback: true });
}

/** 汇总各区域资源与包体积 */
function resourceSummary(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const root = path.resolve(process.cwd(), payload.dir || DIRS.resource);

  const customRoot = path.join(root, 'Custom');
  const officialRoot = payload.dir ? path.join(root, 'Default') : DIRS.uncensorDefault;

  const regions = [];
  for (const pairEntry of fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []) {
    if (!pairEntry.isDirectory() || pairEntry.name === 'package' || pairEntry.name === 'Custom') continue;
    const pairDir = path.join(root, pairEntry.name);

    for (const platEntry of fs.readdirSync(pairDir, { withFileTypes: true })) {
      if (!platEntry.isDirectory()) continue;
      const dir = path.join(pairDir, platEntry.name);
      const stat = measure(dir);
      regions.push({
        pair: pairEntry.name,
        base: pairEntry.name.replace(/2.*$/, ''),
        target: pairEntry.name.includes('2') ? pairEntry.name.split('2').pop() : '',
        platform: platEntry.name,
        dir,
        rel: `${pairEntry.name}/${platEntry.name}`,
        files: stat.files,
        bytes: stat.bytes
      });
    }
  }

  for (const regionEntry of fs.existsSync(customRoot) ? fs.readdirSync(customRoot, { withFileTypes: true }) : []) {
    if (!regionEntry.isDirectory()) continue;
    const regionDir = path.join(customRoot, regionEntry.name);

    for (const platEntry of fs.readdirSync(regionDir, { withFileTypes: true })) {
      if (!platEntry.isDirectory()) continue;
      const dir = path.join(regionDir, platEntry.name);
      const stat = measure(dir);
      regions.push({
        pair: 'Custom',
        custom: true,
        region: regionEntry.name,
        base: 'custom',
        target: regionEntry.name.toLowerCase(),
        platform: platEntry.name,
        dir,
        rel: `Custom/${regionEntry.name}/${platEntry.name}`,
        files: stat.files,
        bytes: stat.bytes
      });
    }
  }

  if (fs.existsSync(officialRoot)) {
    const stat = measure(officialRoot);
    if (stat.files) {
      regions.push({
        pair: '官方默认',
        base: '官方',
        target: '默认',
        platform: platform(),
        dir: officialRoot,
        rel: 'Default',
        files: stat.files,
        bytes: stat.bytes
      });
    }
  }

  const packages = [];
  const packDir = DIRS.package;
  for (const entry of fs.existsSync(packDir) ? fs.readdirSync(packDir, { withFileTypes: true }) : []) {
    if (!entry.isFile() || !/\.(zip|tar\.gz)$/i.test(entry.name)) continue;
    const file = path.join(packDir, entry.name);
    const stat = fs.statSync(file);
    packages.push({
      file,
      name: entry.name,
      dir: packDir,
      bytes: stat.size,
      mtime: stat.mtimeMs,
      type: packageTypeOf(entry.name),
      platform: packagePlatformOf(entry.name)
    });
  }

  packages.sort((a, b) => b.mtime - a.mtime);
  regions.sort((a, b) => `${a.pair}${a.platform}`.localeCompare(`${b.pair}${b.platform}`));

  return {
    root,
    packageDir: packDir,
    regions,
    packages,
    totals: {
      files: regions.reduce((sum, item) => sum + item.files, 0),
      bytes: regions.reduce((sum, item) => sum + item.bytes, 0),
      packages: packages.length,
      packageBytes: packages.reduce((sum, item) => sum + item.bytes, 0)
    }
  };
}

/** 删除某个区域的资源目录 */
function removeResource(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const official = payload.pair === '官方默认';
  const isCustom = payload.pair === 'Custom';
  const customRoot = String(payload.root || '').trim() ? path.resolve(process.cwd(), String(payload.root).trim()) : '';
  const root = official
    ? customRoot
      ? path.join(customRoot, 'Default')
      : DIRS.uncensorDefault
    : customRoot || DIRS.resource;
  let dir = official
    ? root
    : path.resolve(
        root,
        String(payload.pair || payload.region || ''),
        ...(isCustom && payload.region ? [String(payload.region)] : []),
        String(payload.platform || '')
      );

  if (!fs.existsSync(dir) && payload.dir) {
    const fallback = path.resolve(String(payload.dir));
    if (fallback === root || fallback.startsWith(root + path.sep)) dir = fallback;
    else return { ok: false, error: '路径超出资源根目录' };
  }

  if (dir !== root && !dir.startsWith(root + path.sep)) return { ok: false, error: '路径超出资源根目录' };
  if (!fs.existsSync(dir)) return { ok: false, error: '目录不存在' };

  const stat = measure(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  } catch (err) {
    return { ok: false, error: `删除失败：${err.code || err.message}，先关掉占用这个目录的程序再试` };
  }
  return { ok: true, dir, files: stat.files, bytes: stat.bytes };
}

/** 删除打包目录里的资源包 */
function removePackage(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const file = path.resolve(DIRS.package, path.basename(String(payload.file || '')));
  if (!file.startsWith(path.resolve(DIRS.package) + path.sep)) return { ok: false, error: '路径超出打包目录' };
  if (!fs.existsSync(file)) return { ok: false, error: '文件不存在' };

  const bytes = fs.statSync(file).size;
  fs.rmSync(file, { force: true });
  return { ok: true, file, bytes };
}

/** 在文件管理器里定位目录 */
function openDir(_event: Electron.IpcMainInvokeEvent, dir: string): string {
  const target = path.resolve(dir);
  if (fs.existsSync(target)) shell.showItemInFolder(target);
  return target;
}

/** 用系统方式打开目录 */
function openPath(_event: Electron.IpcMainInvokeEvent, dir: string): boolean {
  const ok = Boolean(dir && fs.existsSync(dir));
  if (ok) shell.openPath(dir);
  return ok;
}

/** 递归查找指定文件 */
function findFile(dir: string, name: string, depth: number): string | null {
  if (depth > 6) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const lower = name.toLowerCase();
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === lower) return path.join(dir, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hit = findFile(path.join(dir, entry.name), name, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** 在多个根目录下定位文件 */
function locateFile(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const name = String(payload.file || '').trim();
  const roots = Array.isArray(payload.roots) ? payload.roots : [];
  if (!name) return { ok: false, dir: '', root: '' };

  for (const raw of roots) {
    const root = path.resolve(process.cwd(), String(raw || ''));
    if (!fs.existsSync(root)) continue;
    const hit = findFile(root, name, 0);
    if (hit) return { ok: true, dir: path.dirname(hit), file: hit, root };
  }
  return { ok: false, dir: '', root: '' };
}

/** 列出替换历史记录 */
function listReplaces(): Record<string, any> {
  const current = settings.load();
  const items = (current.replaces || []).map((item) => {
    let missing = false;
    if (item.file) {
      try {
        missing = !fs.statSync(item.file).isFile();
      } catch (err) {
        missing = true;
      }
    }
    return { ...item, missing };
  });
  return { items, missing: items.filter((item) => item.missing).length };
}

/** 清空全部替换记录 */
function clearReplaces(): Record<string, any> {
  const current = settings.load();
  const removed = (current.replaces || []).length;
  current.replaces = [];
  settings.save(current);
  return { ok: true, removed };
}

/** 保存替换历史记录 */
function saveReplaces(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const raw = payload.items;
  if (!Array.isArray(raw)) return { ok: false, error: '记录必须是数组' };
  const items = raw
    .map((item) => ({
      tag: String((item && item.tag) || ''),
      file: String((item && item.file) || ''),
      targets: Array.isArray(item && item.targets) ? item.targets.map(String) : [],
      counts: item && item.counts && typeof item.counts === 'object' ? { ...item.counts } : {},
      bytes: Number((item && item.bytes) || 0) || 0,
      time: String((item && item.time) || '')
    }))
    .filter((item) => item.tag || item.file);
  const current = settings.load();
  current.replaces = items;
  settings.save(current);
  return { ok: true, items };
}

/** 按时间删除一条替换记录 */
function removeReplace(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const time = String(payload.time || '');
  if (!time) return { ok: false, error: '没有指定替换记录' };
  const current = settings.load();
  const before = (current.replaces || []).length;
  current.replaces = (current.replaces || []).filter((item) => item.time !== time);
  if (current.replaces.length === before) return { ok: false, error: '这条替换记录不存在' };
  settings.save(current);
  return { ok: true };
}

/** 中断正在进行的替换 */
function abortReplace(): Record<string, any> {
  if (!replaceAbort) return { ok: false, reason: '当前没有进行中的替换' };
  replaceAbort.cancelled = true;
  return { ok: true };
}

/** 注册资源相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('backup-packages', backupPackages);
  handle('match-package-files', matchPackageFilesHandler);
  handle('backup-resource', backupResource);
  handle('abort-backup', abortBackup);
  handle('list-backups', listBackups);
  handle('delete-backup', deleteBackup);
  handle('restore-backup', restoreBackup);
  handle('replace-resource', replaceResource);
  handle('package-zip', packageZip);
  handle('resource-summary', resourceSummary);
  handle('remove-resource', removeResource);
  handle('remove-package', removePackage);
  handle('open-dir', openDir);
  handle('open-path', openPath);
  handle('locate-file', locateFile);
  handle('list-replaces', listReplaces);
  handle('clear-replaces', clearReplaces);
  handle('save-replaces', saveReplaces);
  handle('remove-replace', removeReplace);
  handle('abort-replace', abortReplace);
}
module.exports = { register };
