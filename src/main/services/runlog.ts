const { traceLines } = require('./file');

const ANSI = /\x1b\[[0-9;]*m/g;

/** 去掉文本里的终端颜色码 */
const strip = (text: unknown): string => String(text ?? '').replace(ANSI, '');

const pending = [];
let timer = null;

/** 把缓冲的日志行整批写入 */
function flush(): void {
  timer = null;
  if (!pending.length) return;
  const entries = pending.splice(0, pending.length);
  try {
    traceLines(entries);
  } catch (err) {}
}

/** 把日志行加入待写缓冲 */
function enqueue(line: string, tag: string): void {
  if (!line) return;
  pending.push({ line: strip(line), tag });
  if (!timer) timer = setTimeout(flush, 200);
}

/** 推送日志到窗口并落盘 */
function push(event: Electron.IpcMainInvokeEvent, payload: Record<string, any>): void {
  if (payload && payload.line) enqueue(payload.line, 'PROC');

  try {
    if (event && event.sender && !event.sender.isDestroyed()) event.sender.send('run:log', payload);
  } catch (err) {}
}

/** 以指定标签推送文本日志 */
function pushText(text: string, tag: string = 'APPS'): void {
  enqueue(text, tag);
}

process.on('exit', flush);

module.exports = { push, pushText };
