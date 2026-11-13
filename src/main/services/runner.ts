const { spawn, spawnSync } = require('child_process');
const { ANSI } = require('../core/log/drain');
const log = require('../core/log/log');
const { stamp, trace } = require('./file');
const runlog = require('./runlog');

let activeRun = null;
let cancelled = false;
let busy = false;

/** 结束子进程及其整棵进程树 */
function killTree(child: import('child_process').ChildProcess | null): number | null {
  if (!child || child.killed) return null;
  const { pid } = child;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch (err) {
    trace(`kill failed: ${err.message}`);
  }
  return pid;
}

/** 执行命令并实时转发输出 */
function streamCommand(
  event: Electron.IpcMainInvokeEvent,
  exe: string,
  args: string[],
  label: string,
  scope: string
): Promise<{
  code: number;
  seconds: number | string;
  lastRegion: string | null;
  seen: string[];
  aborted?: boolean;
}> {
  const send = (line: string, stream: string): void => runlog.push(event, { line, stream, label, scope, at: stamp() });
  const started = Date.now();
  const seen = new Set<string>();
  let lastRegion = null;

  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd: process.cwd(), windowsHide: true });

    let settled = false;

    const settle = (value: {
      code: number;
      seconds: number | string;
      lastRegion: string | null;
      seen: string[];
      aborted?: boolean;
    }): void => {
      if (settled) return;
      settled = true;
      if (activeRun && activeRun.child === child) activeRun = null;
      resolve(value);
    };
    activeRun = { child, pid: child.pid, settle, send };

    let buffer = '';

    const onData = (chunk: Buffer | string): void => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.replace(ANSI, '');
        if (!line.trim()) continue;

        const manifest = line.match(/([A-Z]{2})\s+-\s+\/meta\//);
        if (manifest) seen.add(manifest[1]);
        const tagged = line.match(/\[([A-Z]{2})\]/);
        if (tagged) lastRegion = tagged[1];
        else if (manifest) lastRegion = manifest[1];
        send(raw.trimEnd(), 'out');
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => send(log.format('ERRO', `启动失败: ${err.message}`), 'out'));
    child.on('close', (status) => {
      if (settled) return;
      const code = status === null ? 1 : status;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const text = `${label} · 退出码 ${code} · ${seconds}s`;
      send(log.format(code === 0 ? 'INFO' : 'ERRO', text), 'out');
      settle({ code, seconds, lastRegion, seen: [...seen] });
    });
  });
}

/** 中断当前运行中的任务 */
function abortRun(): { ok: boolean; reason?: string; pid?: number | null } {
  if (!busy) return { ok: false, reason: 'idle' };
  cancelled = true;

  const run = activeRun;
  const pid = run ? run.pid : null;
  if (run) {
    const seconds = 0;
    killTree(run.child);
    try {
      run.child.kill('SIGKILL');
    } catch (err) {}
    run.send(log.format('WARN', `已中断 pid ${pid}`), 'out');
    run.settle({ code: 130, seconds, lastRegion: null, seen: [], aborted: true });
  }
  trace(`abort requested pid=${pid}`);
  busy = false;
  return { ok: true, pid };
}

module.exports = {
  streamCommand,
  killTree,
  abortRun,
  isBusy: (): boolean => busy,
  setBusy: (value: boolean): void => {
    busy = value;
  },
  wasCancelled: (): boolean => cancelled,
  resetCancelled: (): void => {
    cancelled = false;
  }
};
