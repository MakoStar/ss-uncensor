'use strict';

const fs = require('fs');
const path = require('path');
const { shell, dialog } = require('electron');
const os = require('os');
const { DIRS, platform, setPlatform } = require('../../core/config/paths');
const { spawn } = require('child_process');
const settings = require('../../core/config/settings');
const { versionFileName } = require('../../core/config');
const { zipDir, zipFiles, listZip, unzipTo, listFiles } = require('../services/zip');
const { resolveUncensorDirs } = require('../../core/uncensor/dirs');
const log = require('../../core/log/log');
const { gameDirOf } = require('./settings');
const { spawnSync } = require('child_process');

/* 转成 tar 可识别的正斜杠绝对路径 */
const tarPath = (target) => path.resolve(target).replace(/\\/g, '/');
const { stamp, measure, relToCwd, tarCommand } = require('../services/file');

let backupCancel = null;

let replaceAbort = null;

/* 列出这一轮可能留下的半成品压缩包 */
function partialFiles(dir, tag, shortNames) {
  const prefix = Object.values(shortNames).filter(Boolean);
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.zip') && name.includes(tag) && prefix.some((p) => name.startsWith(`${p}_`)))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/* 把资源包内文件名映射到游戏目录的实际位置 */
async function matchPackageFiles(file) {
  const entries = await listZip(file);
  const persistentDir = gameDirOf('persistent');
  const installDir = gameDirOf('install');

  const persistent = [];
  const install = [];
  const missing = [];
  const seen = new Set();

  for (const entry of entries) {
    const base = path.posix.basename(entry.name);
    if (!base || base.endsWith('/') || seen.has(base)) continue;
    seen.add(base);

    let hit = false;
    if (persistentDir && fs.existsSync(path.join(persistentDir, base))) { persistent.push(base); hit = true; }
    if (installDir && fs.existsSync(path.join(installDir, base))) { install.push(base); hit = true; }
    if (!hit) missing.push(base);
  }

  return { persistent, install, missing, total: entries.length };
}

const handlers = {
  /* 列出可供备份对照的反和谐资源包 */
  'backup-packages'() {
    const packDir = DIRS.package;
    const items = [];
    for (const entry of fs.existsSync(packDir) ? fs.readdirSync(packDir, { withFileTypes: true }) : []) {
      if (!entry.isFile() || !/\.(zip|tar\.gz)$/i.test(entry.name)) continue;
      if (/^(PS|IR)(_|\.)/.test(entry.name)) continue;
      const file = path.join(packDir, entry.name);
      const stat = fs.statSync(file);
      items.push({ file, name: entry.name, tag: entry.name.replace(/\.(zip|tar\.gz)$/i, ''), bytes: stat.size, mtime: stat.mtimeMs });
    }
    items.sort((a, b) => b.mtime - a.mtime);
    return { items };
  },

  /* 预览某个资源包会命中游戏目录哪些文件 */
  async 'match-package-files'(_event: any, payload: any = {}) {
    const file = payload.file || '';
    if (!fs.existsSync(file)) return { ok: false, error: '资源包不存在' };
    const matched = await matchPackageFiles(file);
    return { ok: true, file, ...matched };
  },

  /* 把游戏资源目录按整目录或按包打成备份压缩包 */
  async 'backup-resource'(event: any, payload: any = {}) {
    const targets = Array.isArray(payload.targets) ? payload.targets : [];
    if (!targets.length) return { ok: false, error: '没有选择要备份的目录' };

    const cancel = { cancelled: false };
    backupCancel = cancel;

    const custom = Boolean(String(payload.dest || '').trim());
    const dest = path.resolve(custom ? payload.dest : DIRS.package);
    fs.mkdirSync(dest, { recursive: true });

    const packageFile = String(payload.packageFile || '').trim();
    let scoped = null;
    if (packageFile) {
      if (!fs.existsSync(packageFile)) return { ok: false, error: '反和谐资源包不存在' };
      scoped = await matchPackageFiles(packageFile);
      const empty = targets.filter((t) => !(t === 'persistent' ? scoped.persistent : scoped.install).length);
      if (targets.length === empty.length) {
        return { ok: false, error: '这个反和谐资源包里的文件，在游戏目录中一个都没找到' };
      }
    }

    let totalBytes = 0;
    for (const target of targets) {
      const src = gameDirOf(target);
      if (!src) continue;
      const names = scoped ? (target === 'persistent' ? scoped.persistent : scoped.install) : null;

      const files = names
        ? names.map((name) => ({ full: path.join(src, name), rel: name }))
        : listFiles(src);
      for (const file of files) totalBytes += fs.statSync(file.full).size;
    }

    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    const tag = `${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
    const names = { persistent: 'Persistent_Store', install: 'InstallResource' };

    const shortNames = { persistent: 'PS', install: 'IR' };

    const packageTag = scoped ? path.basename(packageFile).replace(/\.(zip|tar\.gz)$/i, '') : '';

    const tagShort = packageTag.replace(/\.\d+(\.\d+)*$/, '');

    const made = [];

    let doneBytes = 0;
    let prevCum = 0;
    const report = (cum) => {
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

        const outFile = path.join(dest, `${shortNames[target]}${tagShort ? `_${tagShort}` : ''}_${tag}.zip`);
        const opts = { onProgress: report, isCancelled: () => cancel.cancelled };

        const picked = scoped && (target === 'persistent' ? scoped.persistent : scoped.install);
        if (picked && !picked.length) continue;
        const result = picked
          ? await zipFiles(picked.map((name) => ({ full: path.join(src, name), rel: name })), outFile, opts)
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
        });
      }
    } catch (err) {

      if (err.code === 'ZIP_ABORTED') {
        const leftovers = [...made.map((item) => item.file), ...partialFiles(dest, tag, shortNames)];
        for (const file of leftovers) {
          try { fs.rmSync(file, { force: true }); } catch {  }
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
        time: stamp.toISOString(),
        scope: item.scope,
        tag: item.tag,
        packageFile: item.packageFile,
      })),
      ...(current.backups || []),
    ];
    settings.save(current);

    return { ok: true, dest, tag: packageTag, backups: made };
  },

  /* 中断正在进行的备份 */
  'abort-backup'() {
    if (!backupCancel) return { ok: false, reason: '当前没有进行中的备份' };
    backupCancel.cancelled = true;
    return { ok: true };
  },

  /* 列出登记过的备份压缩包 */
  'list-backups'() {
    const current = settings.load();
    const items = (current.backups || [])
      .filter((item) => item.file && fs.existsSync(item.file))
      .map((item) => ({ ...item, bytes: fs.statSync(item.file).size }))
      .sort((a, b) => (a.time < b.time ? 1 : -1));
    return { items, backupDir: current.backupDir || DIRS.package };
  },

  /* 删除某个备份文件并从登记表摘除 */
  'delete-backup'(_event: any, payload: any = {}) {
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
  },

  /* 用备份压缩包还原对应游戏目录 */
  async 'restore-backup'(event: any, payload: any = {}) {
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
      },
    });
    return { ok: true, target, file, entries: result.entries, bytes: result.bytes, dir: src, partial };
  },

  /* 用反和谐资源包全量覆盖所选游戏目录 */
  async 'replace-resource'(event: any, payload: any = {}) {
    const targets = Array.isArray(payload.targets) ? payload.targets : [];
    if (!targets.length) return { ok: false, error: '没有选择要替换的目录' };

    const packageFile = String(payload.packageFile || '').trim();
    if (!packageFile || !fs.existsSync(packageFile)) return { ok: false, error: '反和谐资源包不存在' };

    const cancel = { cancelled: false };
    replaceAbort = cancel;

    const names = { persistent: 'Persistent_Store', install: 'InstallResource' };
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

          pick: (name) => ({ dest: dirs[target], rel: path.posix.basename(name) }),
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
        time: new Date().toISOString(),
      },
      ...(current.replaces || []),
    ];
    settings.save(current);

    return { ok: true, file: packageFile, tag, counts, bytes: totalBytes };
  },

  /* 把某个资源目录打包成标准命名的压缩包 */
  async 'package-zip'(event: any, payload: any = {}) {
    const send = (line) => event.sender.send('run:log', { line, stream: 'out', label: 'package', at: stamp() });
    const dir = path.resolve(process.cwd(), String(payload.dir || ''));
    if (!fs.existsSync(dir)) {
      return { ok: false, error: `目录不存在：${relToCwd(dir)}` };
    }

    const plat = String(payload.platform || platform());

    let base = String(payload.base || '');
    let target = String(payload.target || '');
    let clientVer = String(payload.clientVer || '');
    if ((!base || !target || !clientVer) && fs.existsSync(DIRS.generatedDiff)) {
      const candidates = fs.readdirSync(DIRS.generatedDiff)
        .filter((f) => f.endsWith('_unity3d_diff.json'))
        .map((f) => {
          const pair = f.match(/^([A-Za-z0-9]+)2([A-Za-z0-9]+)_gen_/);
          if (!pair) return null;
          const file = path.join(DIRS.generatedDiff, f);
          let ver = '';
          try {
            ver = (((JSON.parse(fs.readFileSync(file, 'utf8')).base) || {}).config || {}).CLIENT_VER || '';
          } catch (err) {
            ver = '';
          }
          return { file, base: pair[1].toUpperCase(), target: pair[2].toUpperCase(), ver, mtime: fs.statSync(file).mtimeMs };
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
    const versionBase = official ? (base || 'CN') : base;
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
    const preferred = (official || isCustom) && gameVer
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
        seconds: 0,
      };
    }

    if (fs.existsSync(file) && !payload.overwrite) {
      return {
        ok: false,
        needConfirm: true,
        file,
        name,
        bytes: fs.statSync(file).size,
        seconds: 0,
      };
    }
    fs.mkdirSync(DIRS.package, { recursive: true });
    try {
      fs.rmSync(file, { force: true });
    } catch (err) {

      await new Promise((resolve) => setTimeout(resolve, 800));
      fs.rmSync(file, { force: true });
    }

    const attempt = (label, command, args) => {
      const result = spawnSync(command, args, { cwd: path.dirname(dir), windowsHide: true });
      if (result.error || result.status !== 0) {
        const detail = String(result.stderr || result.error || result.status).trim().split('\n')[0];
        throw new Error(`${label} 失败：${detail}`);
      }
    };

    const total = measure(dir).files;
    const zipStartedAt = Date.now();
    const withSeconds = (result) => ({ ...result, seconds: Math.round((Date.now() - zipStartedAt) / 100) / 10 });

    const streamTar = (opts = payload) => new Promise((resolve) => {

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
      const count = (chunk) => {
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
        onProgress: (written) => event.sender.send('package:progress', {
          done: written,
          total: measure(dir).bytes,
          file,
        }),
      });
      return withSeconds({
        ok: true,
        file: zipped.file,
        bytes: zipped.bytes,
        files: zipped.files,
        engine: '内置 zip（不压缩）',
      });
    } catch (zipError) {
      send(log.format('TIPS', `内置打包失败（${zipError.message}），改用系统 tar`));
    }

    const packed: any = await streamTar();
    if (packed.ok) return packed;

    if (/Couldn't visit|No such file/i.test(String(packed.error)) && !payload.retried) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (fs.existsSync(dir)) return withSeconds(await streamTar({ ...payload, retried: true }));
      return packed;
    }

    if (!payload.compress) {
      const retry: any = await streamTar({ compress: true, retried: true });
      if (retry.ok) return withSeconds(retry);
      return packed;
    }

    try {
      if (process.platform === 'win32') {
        const shellExe = ['power' + 'shell'].join('');
        attempt('内置打包', shellExe, [
          '-NoProfile', '-NonInteractive', '-Command',
          `Compress-Archive -Path '${dir}\\*' -DestinationPath '${file}' -Force`,
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
  },

  /* 汇总已下载资源与已打包压缩包的规模 */
  'resource-summary'(_event: any, payload: any = {}) {
    const root = path.resolve(process.cwd(), payload.dir || DIRS.resource);

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
          bytes: stat.bytes,
        });
      }
    }

    const customRoot = path.join(DIRS.resource, 'Custom');
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
          bytes: stat.bytes,
        });
      }
    }

    if (fs.existsSync(DIRS.uncensorDefault)) {
      const stat = measure(DIRS.uncensorDefault);
      if (stat.files) {
        regions.push({
          pair: '官方默认',
          base: '官方',
          target: '默认',
          platform: platform(),
          dir: DIRS.uncensorDefault,
          rel: 'Default',
          files: stat.files,
          bytes: stat.bytes,
        });
      }
    }

    const packages = [];
    const packDir = DIRS.package;
    for (const entry of fs.existsSync(packDir) ? fs.readdirSync(packDir, { withFileTypes: true }) : []) {
      if (!entry.isFile() || !/\.(zip|tar\.gz)$/i.test(entry.name)) continue;
      const file = path.join(packDir, entry.name);
      const stat = fs.statSync(file);
      packages.push({ file, name: entry.name, dir: packDir, bytes: stat.size, mtime: stat.mtimeMs });
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
        packageBytes: packages.reduce((sum, item) => sum + item.bytes, 0),
      },
    };
  },

  /* 删除某个区域或平台已下载的资源目录 */
  'remove-resource'(_event: any, payload: any = {}) {

    const official = payload.pair === '官方默认';
    const isCustom = payload.pair === 'Custom';
    const root = path.resolve(official ? DIRS.uncensorDefault : DIRS.resource);
    const dir = official
      ? root
      : path.resolve(
        root,
        String(payload.pair || payload.region || ''),
        ...(isCustom && payload.region ? [String(payload.region)] : []),
        String(payload.platform || ''),
      );

    if (dir !== root && !dir.startsWith(root + path.sep)) return { ok: false, error: '路径超出资源根目录' };
    if (!fs.existsSync(dir)) return { ok: false, error: '目录不存在' };

    const stat = measure(dir);
    try {

      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } catch (err) {
      return { ok: false, error: `删除失败：${err.code || err.message}，先关掉占用这个目录的程序再试` };
    }
    return { ok: true, dir, files: stat.files, bytes: stat.bytes };
  },

  /* 删除已打包的压缩包 */
  'remove-package'(_event: any, payload: any = {}) {
    const file = path.resolve(DIRS.package, path.basename(String(payload.file || '')));
    if (!file.startsWith(path.resolve(DIRS.package) + path.sep)) return { ok: false, error: '路径超出打包目录' };
    if (!fs.existsSync(file)) return { ok: false, error: '文件不存在' };

    const bytes = fs.statSync(file).size;
    fs.rmSync(file, { force: true });
    return { ok: true, file, bytes };
  },

  /* 在资源管理器里定位目录或文件 */
  'open-dir'(_event: any, dir: any) {
    const target = path.resolve(dir);
    if (fs.existsSync(target)) shell.showItemInFolder(target);
    return target;
  },

  /* 用系统默认方式打开目录 */
  'open-path'(_event: any, dir: any) {
    const ok = Boolean(dir && fs.existsSync(dir));
    if (ok) shell.openPath(dir);
    return ok;
  },

  /* 列出替换历史记录 */
  'list-replaces'() {
    const current = settings.load();
    return { items: current.replaces || [] };
  },

  /* 移除完成后把替换记录摘掉 */
  'remove-replace'(_event: any, payload: any = {}) {
    const time = String(payload.time || '');
    if (!time) return { ok: false, error: '没有指定替换记录' };
    const current = settings.load();
    const before = (current.replaces || []).length;
    current.replaces = (current.replaces || []).filter((item) => item.time !== time);
    if (current.replaces.length === before) return { ok: false, error: '这条替换记录不存在' };
    settings.save(current);
    return { ok: true };
  },

  /* 中断正在进行的替换 */
  'abort-replace'() {
    if (!replaceAbort) return { ok: false, reason: '当前没有进行中的替换' };
    replaceAbort.cancelled = true;
    return { ok: true };
  },

};

module.exports = handlers;
