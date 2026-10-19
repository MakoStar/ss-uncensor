'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, shell } = require('electron');
const { DIRS, fetcher, genPath } = require('../core/config/paths');
const { platform } = require('../core/config');
const settings = require('../core/config/settings');
const { zipDir, zipFiles, listZip, unzipTo, verifyZip } = require('./services/zip');
const { resolveUncensorDirs } = require('../core/uncensor/dirs');
const fetcherInstall = require('./services/install');
const ping = require('./services/ping');
const { buildHandlers } = require('./ipc');
const appConfig = require('./services/config');

const handlers = buildHandlers();

/* 跑 IPC 数据形状与核心逻辑自检 */
async function selfTest() {
  const report = { ok: true, checks: [] };
  const check = (name, pass, detail = '') => {
    report.checks.push({ name, pass, detail });
    if (!pass) report.ok = false;
  };

  try {
    const meta = handlers.meta();
    check('meta: 平台', meta.platforms.join(',') === 'win,and,ios', meta.platforms.join(','));
    check('meta: 区域', meta.regions.join(',') === 'CN,EN,JP,KR,TW', meta.regions.join(','));
    const exe = fetcher();
    check('meta: 抓取器路径可用', !exe || fs.existsSync(exe), meta.fetcher);
    check('meta: 配置已加载', meta.config.platform === appConfig.current().platform, `platform=${meta.config.platform}`);
    check('meta: 抓取器状态字段', typeof meta.fetcherOk === 'boolean', `fetcherOk=${meta.fetcherOk}`);

    const fakeAssets = [
      { name: 'ResourceFetcher-v9.9.9-linux-x64.tar.gz' },
      { name: 'ResourceFetcher-v9.9.9-win-x64.zip' },
      { name: 'SHA256SUMS' },
    ];
    const picked = fetcherInstall.pickAsset(fakeAssets);
    const expected = process.platform === 'win32' ? '-win-' : process.platform === 'linux' ? '-linux-' : null;
    check(
      '自动下载：挑出当前平台的包',
      expected ? Boolean(picked) && picked.name.includes(expected) : picked === null || picked === undefined,
      picked ? picked.name : '(无)'
    );

    const abortIdle = handlers.abort({}, {});
    check('中断：空闲时安全返回', abortIdle.ok === false, abortIdle.reason || '');

    const urls = ping.serverUrls();
    check('ping: 读到五个区域地址', !exe || Object.keys(urls).length === 5, Object.keys(urls).join(',') || '未装抓取器，跳过');
    check('ping: 地址是 https', Object.values(urls).every((url: any) => String(url).startsWith('https://')), String(Object.values(urls)[0] || ''));
    check('ping: 解析 Windows ping', ping.parseIcmp('最短 = 40ms，最长 = 55ms，平均 = 44ms', 'win32') === 44, '44');
    check('ping: 解析类 Unix ping', ping.parseIcmp('rtt min/avg/max/mdev = 12.3/14.5/16.7/1.2 ms', 'linux') === 14.5, '14.5');

    const regionInfo = handlers['region-info']({}, { region: 'CN', platform: meta.platform });
    const hasManifests = regionInfo.manifests.length > 0;
    check(
      '区域清理：读到清单与缓存',
      !hasManifests || Boolean(regionInfo.cache),
      hasManifests
        ? `${regionInfo.manifests.length} 个清单 / ${regionInfo.cache ? regionInfo.cache.files : 0} 个缓存`
        : '未抓取清单，跳过',
    );
    const ghost = handlers['region-info']({}, { region: 'ZZ', platform: meta.platform });
    check('区域清理：空区域不可清', ghost.removable === false, `removable=${ghost.removable}`);

    const command = handlers['fetch-command']({}, {}).commands[0];
    check('默认命令含 USE_DEFAULT_REGION=false', command.includes('USE_DEFAULT_REGION=false'), command);

    const version = handlers.version({}, {});
    const versioned = Object.keys(version.regions);
    const versionReady = fs.existsSync(version.file);
    check(
      '版本登记可读',
      !versionReady || versioned.length > 0,
      versionReady ? `${versioned.join(',') || '(空)'} @ ${version.file}` : '未抓取版本文件，跳过',
    );

    const region = meta.fetched[0] || 'CN';
    const patch = handlers['manifest-files']({}, { platform: meta.platform, region, source: 'patch', page: 1 });
    check(
      '补丁清单可读',
      !fs.existsSync(patch.file) || patch.total > 0,
      fs.existsSync(patch.file) ? `${patch.total} 条 @ ${patch.file}` : '未抓取补丁清单，跳过',
    );

    const resource = handlers['manifest-files']({}, { platform: meta.platform, region, source: 'resource', page: 1 });
    check(
      '资源清单可读',
      !fs.existsSync(resource.file) || resource.total > 0,
      fs.existsSync(resource.file) ? `${resource.total} 条 @ ${resource.file}` : '未抓取资源清单，跳过',
    );

    const search = handlers['manifest-files']({}, { platform: meta.platform, region, source: 'patch', query: 'ss_win', page: 1 });
    check('搜索可用', search.items.every((item) => item.file.includes('ss_win')), `${search.total} 条命中`);

    const failed = require('../core/verify').run({ quiet: true });
    check('src/verify 全过', failed === 0, `${failed} 项失败`);

    const synth = meta.fetched.filter((name) => fs.existsSync(genPath(name)));
    if (synth.length >= 2) {
      const diff = handlers.diff({}, { base: synth[0], target: synth[1] });
      check('差异可用', diff.summary.diffTotal >= 0, `${synth[0]}->${synth[1]} diff ${diff.summary.diffTotal}`);
    } else {
      check('差异可用', true, `跳过：已合成区域少于两个`);
    }

    const { resolveUncensorDirs } = require('../core/uncensor/dirs');
    const dirsOf = (options) => resolveUncensorDirs({
      resourceRoot: 'out/Uncensor/Resource',
      uncensorDefault: 'out/Uncensor/Default',
      platform: 'win',
      ...options,
    }).dir.split('\\').join('/');
    check(
      '目录规则：名单/自定义/官方',
      dirsOf({ region: 'JP', base: 'CN', target: 'JP', platform: 'and' }).endsWith('/out/Uncensor/Resource/CN2JP/and')
        && dirsOf({ region: 'CN', custom: true }).endsWith('/out/Uncensor/Resource/Custom/CN/win')
        && dirsOf({ region: 'JP', platform: 'and', official: true }).endsWith('/out/Uncensor/Default'),
      [dirsOf({ region: 'JP', base: 'CN', target: 'JP', platform: 'and' }),
        dirsOf({ region: 'CN', custom: true }),
        dirsOf({ region: 'JP', platform: 'and', official: true })].join(' / '),
    );

    const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-game-'));
    fs.mkdirSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles'), { recursive: true });
    fs.mkdirSync(path.join(gameDir, 'xtlr_Data', 'StreamingAssets', 'InstallResource'), { recursive: true });
    const probed = handlers['detect-game-paths']({}, { dir: gameDir });
    const norm = (p) => String(p || '').split(path.sep).join('/');
    check(
      '替换资源：探测两个子目录',
      norm(probed.persistentStore).endsWith('Persistent_Store/AssetBundles')
        && norm(probed.installResource).endsWith('xtlr_Data/StreamingAssets/InstallResource'),
      `${probed.persistentStore || '(空)'} / ${probed.installResource || '(空)'}`,
    );
    const missing = handlers['detect-game-paths']({}, { dir: path.join(os.tmpdir(), `ss-no-game-${process.pid}`) });
    check('替换资源：目录不存在时返回 null', missing.persistentStore === null && missing.installResource === null, JSON.stringify(missing));

    fs.writeFileSync(path.join(gameDir, 'xtlr.exe'), 'MZ stub');
    const probedLauncher = handlers['detect-game-paths']({}, { dir: gameDir });
    const launcherRoot = probedLauncher.launcher && path.basename(probedLauncher.launcher).toLowerCase() === 'xtlr.exe';
    fs.rmSync(path.join(gameDir, 'xtlr.exe'), { force: true });
    fs.mkdirSync(path.join(gameDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'sub', 'xtlr.exe'), 'MZ stub');
    const probedLauncher2 = handlers['detect-game-paths']({}, { dir: gameDir });
    const launcherSub = probedLauncher2.launcher && probedLauncher2.launcher.includes('sub');
    fs.rmSync(path.join(gameDir, 'sub'), { recursive: true, force: true });
    check(
      '替换资源：启动器 xtlr.exe 可搜索',
      launcherRoot && launcherSub,
      `根目录=${launcherRoot} 子目录=${launcherSub}`,
    );

    fs.writeFileSync(path.join(gameDir, 'xtlr.exe'), 'MZ stub');
    const linkPath = path.join(os.tmpdir(), `ss-link-self-${process.pid}.lnk`);
    const linkOk = shell.writeShortcutLink(linkPath, 'create', {
      target: path.join(gameDir, 'xtlr.exe'),
      cwd: gameDir,
      name: '星塔启动器',
    });
    check('启动器：快捷方式可写入', linkOk && fs.existsSync(linkPath), `lnk=${fs.existsSync(linkPath)}`);
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(path.join(gameDir, 'xtlr.exe'), { force: true });

    const tmpCfg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-cfg-')), '.ss-uncensor-gui.json');
    settings.useFile(tmpCfg);
    handlers['save-game-dir']({}, { path: gameDir });
    const back = settings.load().gameDir;
    check('替换资源：游戏目录写入配置并可回读', back === gameDir, `back=${back}`);

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-badgame-'));
    const rejected = handlers['save-game-dir']({}, { path: badDir });
    check(
      '替换资源：缺子目录时拒绝写入配置',
      rejected.ok === false && rejected.error.includes('游戏目录无效'),
      rejected.error || '竟然写进去了',
    );

    settings.save({
      ...settings.load(),
      backups: [{ file: 'x.zip', name: 'x.zip', target: 'persistent', bytes: 1, time: 't' }],
      replaces: [{ tag: 'demo', time: 't' }],
    });
    const snap = handlers['save-settings']({}, { platform: 'win' });
    check(
      '设置保存：不冲掉备份/替换登记',
      snap.config.backups.length === 1 && snap.config.replaces.length === 1,
      `backups=${snap.config.backups.length} replaces=${snap.config.replaces.length}`,
    );
    settings.save({ ...settings.load(), backups: [], replaces: [] });

    fs.writeFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'), Buffer.alloc(4096, 7));
    fs.writeFileSync(path.join(gameDir, 'xtlr_Data', 'StreamingAssets', 'InstallResource', 'b.bin'), Buffer.alloc(2048, 9));
    const backupDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-bk-')), 'bak');
    const backed = await handlers['backup-resource']({}, { targets: ['persistent', 'install'], dest: backupDest });
    const registered = settings.load().backups.length === 2 && settings.load().backupDir === backupDest;
    check(
      '替换资源：备份两个目录并登记配置',
      backed.ok && backed.backups.length === 2 && registered,
      backed.ok ? backed.backups.map((b) => b.name).join(' / ') : backed.error,
    );

    fs.rmSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'), { force: true });
    fs.writeFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'junk.bin'), Buffer.alloc(16, 1));
    const restored = await handlers['restore-backup']({}, {
      file: backed.backups.find((b) => b.target === 'persistent').file,
      target: 'persistent',
    });
    const backBytes = fs.readFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'));
    const junkGone = !fs.existsSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'junk.bin'));
    check(
      '替换资源：还原清空后完整恢复',
      restored.ok && junkGone && backBytes.equals(Buffer.alloc(4096, 7)),
      restored.ok ? `entries=${restored.entries} junk清除=${junkGone}` : restored.error,
    );

    const listed = handlers['list-backups']();
    check('替换资源：备份列表可读', listed.items.length === 2, `${listed.items.length} 条 · dir=${listed.backupDir}`);

    const abortDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-abort-')), 'bk');
    const abortRun = handlers['backup-resource']({}, { targets: ['persistent'], dest: abortDir });
    const abortAck = handlers['abort-backup']();
    const abortResult = await abortRun;
    const leftover = fs.existsSync(abortDir) ? fs.readdirSync(abortDir) : [];
    check(
      '替换资源：中断备份不留半成品',
      abortAck.ok && abortResult.aborted === true && leftover.length === 0,
      `ack=${abortAck.ok} aborted=${abortResult.aborted} 残留=${leftover.length}`,
    );
    fs.rmSync(path.dirname(abortDir), { recursive: true, force: true });

    const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-pkg-'));
    const pkgFile = path.join(pkgDir, 'win_custom_test_9.9.9.zip');
    const maniPath = path.join(gameDir, 'xtlr_Data', 'StreamingAssets', 'InstallResource', 'ss_test.mani');
    fs.writeFileSync(maniPath, Buffer.from('manifest-stub', 'utf8'));
    await zipFiles([
      { full: path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'), rel: 'a.bin' },
      { full: maniPath, rel: 'Metadata/win/ss_test.mani' },
    ], pkgFile);
    const pkgMatch = await handlers['match-package-files']({}, { file: pkgFile });
    const pkgDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-pkgbk-')), 'bak');
    const pkgBacked = await handlers['backup-resource']({}, {
      targets: ['persistent', 'install'],
      dest: pkgDest,
      packageFile: pkgFile,
    });
    const pkgPs = pkgBacked.ok ? pkgBacked.backups.find((b) => b.target === 'persistent') : null;
    const pkgEntries = pkgPs ? await listZip(pkgPs.file) : [];
    check(
      '替换资源：按反和谐包备份只收包内文件并打标签',
      pkgMatch.ok
        && pkgMatch.persistent.length === 1 && pkgMatch.install.length === 1
        && pkgBacked.ok
        && pkgEntries.length === 1 && pkgEntries[0].name === 'a.bin'
        && pkgPs.name.includes('win_custom_test')
        && pkgPs.scope === 'package' && pkgPs.tag === 'win_custom_test_9.9.9',
      pkgBacked.ok
        ? `matched=${pkgMatch.persistent.length}/${pkgMatch.install.length} entries=${pkgEntries.length} name=${pkgPs.name} tag=${pkgPs.tag}`
        : pkgBacked.error,
    );

    fs.writeFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'), Buffer.alloc(4096, 9));
    fs.writeFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'keep.bin'), Buffer.alloc(8, 3));
    const pkgRestored = await handlers['restore-backup']({}, {
      file: pkgPs.file,
      target: 'persistent',
      scope: 'package',
    });
    const pkgBack = fs.readFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'));
    const keepAlive = fs.existsSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'keep.bin'));
    check(
      '替换资源：按包还原只覆盖不删其它文件',
      pkgRestored.ok && pkgRestored.partial === true
        && pkgBack.equals(Buffer.alloc(4096, 7)) && keepAlive,
      `partial=${pkgRestored.partial} 还原=${pkgBack[0]} 保留keep.bin=${keepAlive}`,
    );
    fs.rmSync(path.dirname(pkgDest), { recursive: true, force: true });

    fs.writeFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'), Buffer.alloc(4096, 1));
    fs.writeFileSync(path.join(gameDir, 'xtlr_Data', 'StreamingAssets', 'InstallResource', 'ss_test.mani'), Buffer.from('old', 'utf8'));
    const replaced = await handlers['replace-resource']({}, { targets: ['persistent', 'install'], packageFile: pkgFile });
    const repA = fs.readFileSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'a.bin'));
    const repMani = fs.readFileSync(path.join(gameDir, 'xtlr_Data', 'StreamingAssets', 'InstallResource', 'ss_test.mani'), 'utf8');
    const repAInInstall = fs.existsSync(path.join(gameDir, 'xtlr_Data', 'StreamingAssets', 'InstallResource', 'a.bin'));
    const repKeep = fs.existsSync(path.join(gameDir, 'Persistent_Store', 'AssetBundles', 'keep.bin'));
    check(
      '替换资源：全量解压覆盖且 Metadata 前缀摊平',
      replaced.ok
        && replaced.counts.persistent === 2 && replaced.counts.install === 2
        && repA.equals(Buffer.alloc(4096, 7))
        && repMani === 'manifest-stub'
        && repAInInstall
        && repKeep,
      replaced.ok
        ? `counts=${replaced.counts.persistent}/${replaced.counts.install} a.bin=${repA[0]} mani=${repMani} install收到a.bin=${repAInInstall}`
        : replaced.error,
    );

    const replaces = settings.load().replaces;
    const removeRec = handlers['remove-replace']({}, { time: replaces[0].time });
    check(
      '替换资源：替换历史登记且可摘除',
      replaces.length >= 1 && replaces[0].tag === 'win_custom_test_9.9.9'
        && removeRec.ok
        && settings.load().replaces.length === replaces.length - 1,
      `登记=${replaces.length} tag=${replaces[0]?.tag} 摘除=${removeRec.ok}`,
    );
    fs.rmSync(pkgDir, { recursive: true, force: true });

    const beforeDelete = handlers['list-backups']().items.length;
    const victim = handlers['list-backups']().items[0];
    const stray = path.join(backupDest, 'not-registered.zip');
    fs.writeFileSync(stray, Buffer.alloc(16, 1));
    const removed = handlers['delete-backup']({}, { file: victim.file });
    const rejectedStray = handlers['delete-backup']({}, { file: stray });
    const afterDelete = handlers['list-backups']();
    check(
      '替换资源：删除备份并从登记表摘除',
      removed.ok
        && !fs.existsSync(victim.file)
        && afterDelete.items.length === beforeDelete - 1
        && rejectedStray.ok === false
        && fs.existsSync(stray),
      `removed=${removed.ok} ${beforeDelete}→${afterDelete.items.length} 未登记被拒=${rejectedStray.ok === false}`,
    );
    fs.rmSync(stray, { force: true });

    const realResource = DIRS.resource;
    const realDefault = DIRS.uncensorDefault;
    DIRS.resource = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-res-'));
    DIRS.uncensorDefault = path.join(DIRS.resource, 'Default');
    fs.mkdirSync(DIRS.uncensorDefault, { recursive: true });
    fs.writeFileSync(path.join(DIRS.uncensorDefault, 'a.unity3d'), 'x');
    fs.mkdirSync(path.join(DIRS.resource, 'Custom', 'JP', 'and'), { recursive: true });
    fs.writeFileSync(path.join(DIRS.resource, 'Custom', 'JP', 'and', 'b.unity3d'), 'y');
    const delOfficial = handlers['remove-resource']({}, { pair: '官方默认', platform: 'win' });
    const delCustom = handlers['remove-resource']({}, { pair: 'Custom', region: 'JP', platform: 'and' });
    const delOut = handlers['remove-resource']({}, { pair: '..', platform: 'x' });
    check(
      '资源删除：官方根/Custom嵌套可删，越界被拒',
      delOfficial.ok && delCustom.ok && delOut.ok === false,
      `official=${delOfficial.ok} custom=${delCustom.ok} 越界=${delOut.ok === false ? '已拒' : delOut.error}`,
    );
    fs.rmSync(DIRS.resource, { recursive: true, force: true });
    DIRS.resource = realResource;
    DIRS.uncensorDefault = realDefault;

    settings.useFile(null);

    const { zipDir, verifyZip } = require('./services/zip');
    const zipSample = path.join(os.tmpdir(), `ss-zip-self-${process.pid}.zip`);
    const zipSrc = path.join(os.tmpdir(), `ss-zip-src-${process.pid}`);
    fs.rmSync(zipSample, { force: true });
    fs.mkdirSync(zipSrc, { recursive: true });
    fs.writeFileSync(path.join(zipSrc, 'a.bin'), Buffer.alloc(4096, 7));
    fs.mkdirSync(path.join(zipSrc, 'sub'));
    fs.writeFileSync(path.join(zipSrc, 'sub', 'b.bin'), Buffer.alloc(1024, 9));
    const packed = await zipDir(zipSrc, zipSample);
    const verified = verifyZip(zipSample);
    check(
      'zip 结构与 CRC 自检',
      packed.files === 2 && verified.entries === 2,
      `${verified.entries} 条`,
    );
    fs.rmSync(zipSample, { force: true });
    fs.rmSync(zipSrc, { recursive: true, force: true });

    const zip64Sample = path.join(os.tmpdir(), `ss-zip64-self-${process.pid}.zip`);
    const zip64Src = path.join(os.tmpdir(), `ss-zip64-src-${process.pid}`);
    const zip64Out = path.join(os.tmpdir(), `ss-zip64-out-${process.pid}`);
    fs.mkdirSync(zip64Src, { recursive: true });
    fs.writeFileSync(path.join(zip64Src, 'a.bin'), Buffer.alloc(4096, 7));
    fs.mkdirSync(path.join(zip64Src, 'sub'));
    fs.writeFileSync(path.join(zip64Src, 'sub', 'b.bin'), Buffer.alloc(1024, 9));
    await zipDir(zip64Src, zip64Sample, { forceZip64: true });
    const un64 = await unzipTo(zip64Sample, zip64Out);
    const sameA = fs.readFileSync(path.join(zip64Out, 'a.bin')).equals(Buffer.alloc(4096, 7));
    const sameB = fs.readFileSync(path.join(zip64Out, 'sub', 'b.bin')).equals(Buffer.alloc(1024, 9));
    check(
      'zip ZIP64 打包→解压 往返一致',
      un64.entries === 2 && sameA && sameB,
      `${un64.entries} 条 · A=${sameA} B=${sameB}`,
    );
    fs.rmSync(zip64Sample, { force: true });
    fs.rmSync(zip64Src, { recursive: true, force: true });
    fs.rmSync(zip64Out, { recursive: true, force: true });
  } catch (err) {
    check('self-test 未抛异常', false, err.message);
  }

  console.log(JSON.stringify(report, null, 2));
  app.exit(report.ok ? 0 : 1);
}

module.exports = selfTest;
