'use strict';

const { spawn, spawnSync } = require('child_process');
const { ANSI } = require('../../core/log/drain');
const log = require('../../core/log/log');
const { stamp, trace } = require('./file');

let activeRun = null;
let cancelled = false;
let busy = false;

/* 按进程树递归杀掉子进程 */
function killTree(child) {
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

/* 流式执行抓取或下载命令并把输出实时推给界面 */
function streamCommand(event, exe, args, label) {
  const send = (line, stream) => event.sender.send('run:log', { line, stream, label, at: stamp() });
  const started = Date.now();
  const seen = new Set();
  let lastRegion = null;

  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd: process.cwd(), windowsHide: true });

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (activeRun && activeRun.child === child) activeRun = null;
      resolve(value);
    };
    activeRun = { child, pid: child.pid, settle, send };

    let buffer = '';
    const onData = (chunk) => {
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
    child.on('error', (err) => send(log.format('ERRO', `启动失败：${err.message}`), 'out'));
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

/* 中断当前抓取或下载并立刻结束等待 */
function abortRun() {
  if (!busy) return { ok: false, reason: 'idle' };
  cancelled = true;

  const run = activeRun;
  const pid = run ? run.pid : null;
  if (run) {
    const seconds = 0;
    killTree(run.child);
    try { run.child.kill('SIGKILL'); } catch (err) {  }
    run.send(log.format('WARN', `已中断 pid ${pid}`), 'out');
    run.settle({ code: 130, seconds, lastRegion: null, seen: [], aborted: true });
  }
  trace(`abort requested pid=${pid}`);
  return { ok: true, pid };
}

module.exports = {
  streamCommand, killTree, abortRun,
  isBusy: () => busy,
  setBusy: (value) => { busy = value; },
  wasCancelled: () => cancelled,
  resetCancelled: () => { cancelled = false; },
};
