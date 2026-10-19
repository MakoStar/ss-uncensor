'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, shell } = require('electron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const settings = require('../../core/config/settings');
const { gameDirOf } = require('./settings');

const execFileAsync = promisify(execFile);

const handlers = {
  /* 返回当前游戏目录里搜到的启动器路径 */
  'launcher-path'() {
    return { launcher: require('./settings').handlers['detect-game-paths']({}, { dir: settings.load().gameDir }).launcher };
  },

  /* 给启动器创建桌面或开始菜单快捷方式 */
  'launcher-shortcut'(_event: any, payload: any = {}) {
    const kind = payload && payload.kind === 'start-menu' ? 'start-menu' : 'desktop';
    const launcher = require('./settings').handlers['detect-game-paths']({}, { dir: settings.load().gameDir }).launcher;
    if (!launcher) return { ok: false, error: '没有找到 xtlr.exe，先确认游戏目录有效' };

    const linkName = '星塔启动器.lnk';
    const dirs = kind === 'desktop'
      ? [app.getPath('desktop')]
      : [
        path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        ...(process.env.ProgramData ? [path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')] : []),
      ];

    const made = [];
    const failed = [];
    for (const dir of dirs) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const linkPath = path.join(dir, linkName);
        const written = shell.writeShortcutLink(linkPath, 'create', {
          target: launcher,
          cwd: path.dirname(launcher),
          name: '星塔启动器',

          description: '星塔启动器',
          icon: launcher,
          iconIndex: 0,
        });
        if (written && fs.existsSync(linkPath)) made.push(linkPath);
        else failed.push(`${dir}（写入未生效）`);
      } catch (err) {
        failed.push(`${dir}（${err.message}）`);
      }
    }

    if (!made.length) {
      return { ok: false, error: `快捷方式创建失败：${failed.join('；') || '未知原因'}` };
    }

    shell.showItemInFolder(made[0]);
    return { ok: true, kind, path: made[0], paths: made, skipped: failed };
  },

  /* 尝试把启动器固定到开始菜单 */
  async 'pin-start-menu'() {
    const launcher = require('./settings').handlers['detect-game-paths']({}, { dir: settings.load().gameDir }).launcher;
    if (!launcher) return { ok: false, error: '没有找到 xtlr.exe，先确认游戏目录有效' };

    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const linkPath = path.join(dir, '星塔启动器.lnk');
    try {
      fs.mkdirSync(dir, { recursive: true });
      shell.writeShortcutLink(linkPath, 'create', {
        target: launcher,
        cwd: path.dirname(launcher),
        name: '星塔启动器',
        description: '星塔启动器',
        icon: launcher,
        iconIndex: 0,
      });
    } catch (err) {
      return { ok: false, error: `快捷方式创建失败：${err.message}` };
    }

    const script = [
      '$ErrorActionPreference = "Stop"',
      '$shell = New-Object -ComObject Shell.Application',
      '$lnk = $env:SS_LNK',
      '$folder = $shell.Namespace([System.IO.Path]::GetDirectoryName($lnk))',
      '$item = $folder.ParseName([System.IO.Path]::GetFileName($lnk))',
      'if (-not $item) { exit 2 }',
      '$verbs = @($item.Verbs())',

      'foreach ($v in $verbs) { if ($v.Name -match "取消固定" -or $v.Name -match "Unpin") { try { $v.DoIt() } catch {} ; Start-Sleep -Milliseconds 800; break } }',
      '$verb = $null',
      'foreach ($v in $verbs) { if ($v.Name -match "固定到" -or $v.Name -match "Pin to") { $verb = $v; break } }',
      'if (-not $verb) { exit 3 }',
      '$verb.DoIt()',
      'exit 0',
    ].join('\n');
    const scriptPath = path.join(os.tmpdir(), `ss-pin-${process.pid}.ps1`);
    fs.writeFileSync(scriptPath, `\ufeff${script}`, 'utf8');

    let code = 0;
    try {
      await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', scriptPath], {
        env: { ...process.env, SS_LNK: linkPath },
        timeout: 20000,
      });
    } catch (err) {
      code = typeof err.code === 'number' ? err.code : -1;
    } finally {
      fs.rmSync(scriptPath, { force: true });
    }

    if (code === 0) return { ok: true, path: linkPath };

    shell.showItemInFolder(linkPath);
    return {
      ok: false,
      pinned: false,
      path: linkPath,
      error: code === 3
        ? 'Windows 不允许程序直接固定到开始菜单；已打开开始菜单文件夹，右键「星塔启动器」→ 固定到开始菜单即可'
        : '固定未成功；已打开开始菜单文件夹，右键「星塔启动器」→ 固定到开始菜单即可',
    };
  },

  /* 启动游戏启动器 */
  async 'launch-game'() {
    const launcher = require('./settings').handlers['detect-game-paths']({}, { dir: settings.load().gameDir }).launcher;
    if (!launcher) return { ok: false, error: '没有找到 xtlr.exe，先确认游戏目录有效' };
    const err = await shell.openPath(launcher);
    return err ? { ok: false, error: err } : { ok: true, file: launcher };
  },

};

module.exports = handlers;
