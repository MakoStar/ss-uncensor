const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, shell } = require('electron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const settings = require('../core/config/settings');
const { launcherNameOf, channelOf } = require('../core/config/targets');
const { detectGamePaths } = require('./settings');

const execFileAsync = promisify(execFile);

/** 返回启动器的完整路径 */
function launcherPath(): { launcher: string | null } {
  return { launcher: detectGamePaths({}, { dir: settings.load().gameDir }).launcher };
}

/** 汇总启动器与渠道信息 */
function identity(): { gameDir: string; launcher: string | null; channel: string; name: string } {
  const gameDir = settings.load().gameDir;
  const launcher = detectGamePaths({}, { dir: gameDir }).launcher;
  return { gameDir, launcher, channel: channelOf(gameDir), name: launcherNameOf(gameDir) };
}

/** 按类型算出快捷方式目录 */
function shortcutDirs(kind: string): string[] {
  const perUser = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const common = process.env.ProgramData
    ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    : '';
  if (kind === 'desktop') return [app.getPath('desktop')];
  return common ? [perUser, common] : [perUser];
}

/** 写出一个指向启动器的快捷方式 */
function writeLink(linkPath: string, launcher: string, name: string): boolean {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const written = shell.writeShortcutLink(linkPath, 'create', {
    target: launcher,
    cwd: path.dirname(launcher),
    name,
    description: name,
    icon: launcher,
    iconIndex: 0
  });
  return Boolean(written && fs.existsSync(linkPath));
}

/** 创建桌面或开始菜单快捷方式 */
function launcherShortcut(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Record<string, any> {
  const info = identity();
  if (!info.launcher) return { ok: false, error: '没有找到 xtlr.exe，先确认游戏目录有效' };

  const kind = payload && payload.kind === 'start-menu' ? 'start-menu' : 'desktop';
  if (kind === 'start-menu') return addPinStartMenu(_event, payload);

  const dirs = shortcutDirs('desktop');
  const made = [];
  const failed = [];
  for (const dir of dirs) {
    const linkPath = path.join(dir, `${info.name}.lnk`);
    try {
      if (writeLink(linkPath, info.launcher, info.name)) made.push(linkPath);
      else failed.push(`${dir}（写入未生效）`);
    } catch (err) {
      failed.push(`${dir}（${err.message}）`);
    }
  }
  if (!made.length) return { ok: false, error: `快捷方式创建失败：${failed.join('；') || '未知原因'}` };
  shell.showItemInFolder(made[0]);
  return { ok: true, kind, name: info.name, channel: info.channel, path: made[0], paths: made, skipped: failed };
}

/** 拼出固定开始菜单的脚本 */
function pinScript(): string {
  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$result = @{ pinned = $false; method = ""; verbs = @(); appsHit = $false; error = "" }',
    'try {',
    '  $shell = New-Object -ComObject Shell.Application',
    '  $lnk = $env:SS_LNK',
    '  $folder = $shell.Namespace([System.IO.Path]::GetDirectoryName($lnk))',
    '  $item = $folder.ParseName([System.IO.Path]::GetFileName($lnk))',
    '  if ($item) {',
    '    $all = @($item.Verbs())',
    '    $result.verbs = @($all | ForEach-Object { $_.Name })',
    '    $pin = $all | Where-Object { $_.Name -match "固定到.*开始|固定到开始|Pin to Start|Pin to start|pin to start|An Start|スタート" } | Select-Object -First 1',
    '    if ($pin) {',
    '      try { $pin.DoIt(); $result.pinned = $true; $result.method = "shell-verb" } catch { $result.error = $_.Exception.Message }',
    '    }',
    '  }',
    '  if (-not $result.pinned) {',
    '    $apps = $shell.NameSpace("shell:AppsFolder")',
    '    if ($apps) {',
    '      $hit = @($apps.Items()) | Where-Object { $_.Name -eq $env:SS_NAME } | Select-Object -First 1',
    '      if ($hit) {',
    '        $result.appsHit = $true',
    '        try { $hit.InvokeVerb("pin to start"); $result.method = "appsfolder-attempt" } catch { $result.error = $_.Exception.Message }',
    '      }',
    '    }',
    '  }',
    '} catch { $result.error = $_.Exception.Message }',
    '"SSPIN:" + ($result | ConvertTo-Json -Compress)'
  ].join('\n');
}

/** 运行脚本来固定到开始菜单 */
async function runPinScript(linkPath: string, name: string): Promise<Record<string, any>> {
  const scriptPath = path.join(os.tmpdir(), `ss-pin-${process.pid}-${Date.now()}.ps1`);
  fs.writeFileSync(scriptPath, `\ufeff${pinScript()}`, 'utf8');
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', scriptPath],
      { env: { ...process.env, SS_LNK: linkPath, SS_NAME: name }, timeout: 25000, windowsHide: true }
    );
    const line = String(stdout || '')
      .split(/\r?\n/)
      .find((s) => s.startsWith('SSPIN:'));
    if (!line) return { pinned: false, method: '', error: 'PowerShell 未返回结果' };
    return JSON.parse(line.slice('SSPIN:'.length));
  } catch (err) {
    return { pinned: false, method: '', error: err.message };
  } finally {
    try {
      fs.rmSync(scriptPath, { force: true });
    } catch {}
  }
}

/** 创建开始菜单快捷方式并固定 */
async function addPinStartMenu(_event: Electron.IpcMainInvokeEvent, payload: any = {}): Promise<Record<string, any>> {
  const info = identity();
  if (!info.launcher) return { ok: false, error: '没有找到 xtlr.exe，先确认游戏目录有效' };

  const dirs = shortcutDirs('start-menu');
  const made = [];
  const failed = [];
  for (const dir of dirs) {
    const linkPath = path.join(dir, `${info.name}.lnk`);
    try {
      if (writeLink(linkPath, info.launcher, info.name)) made.push(linkPath);
      else failed.push(`${dir}（写入未生效）`);
    } catch (err) {
      failed.push(`${dir}（${err.message}）`);
    }
  }
  if (!made.length) return { ok: false, error: `开始菜单快捷方式创建失败：${failed.join('；') || '未知原因'}` };

  const perUser = made[0];
  const pin = await runPinScript(perUser, info.name);

  const hasPinVerb =
    Array.isArray(pin.verbs) && pin.verbs.some((v) => /固定到.*开始|固定到开始|Pin to Start|An Start/i.test(String(v)));
  const win11Unsupported = !hasPinVerb && !pin.pinned;

  if (!pin.pinned) shell.showItemInFolder(perUser);

  return {
    ok: true,
    added: true,
    pinned: Boolean(pin.pinned),
    attempted: Boolean(pin.method),
    win11Unsupported,
    name: info.name,
    channel: info.channel,
    path: perUser,
    paths: made,
    method: pin.method || '',
    skipped: failed,
    detail: pin.error || ''
  };
}

/** 启动游戏客户端 */
async function launchGame(): Promise<Record<string, any>> {
  const info = identity();
  if (!info.launcher) return { ok: false, error: '没有找到 xtlr.exe，先确认游戏目录有效' };
  const err = await shell.openPath(info.launcher);
  return err ? { ok: false, error: err } : { ok: true, file: info.launcher };
}

/** 注册启动器相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('launcher-path', launcherPath);
  handle('launcher-shortcut', launcherShortcut);
  handle('pin-start-menu', addPinStartMenu);
  handle('launch-game', launchGame);
}

module.exports = { register, shortcutDirs, pinScript, identity };
