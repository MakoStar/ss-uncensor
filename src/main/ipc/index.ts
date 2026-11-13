const { ipcMain } = require('electron');
const { handle } = require('./register');
const runlog = require('../services/runlog');

const modules = [
  require('./meta'),
  require('./settings'),
  require('./resource'),
  require('./launcher'),
  require('./fetch'),
  require('./uncensor'),
  require('./region'),
  require('./manifest'),
  require('./background')
];

/** 接收渲染进程日志并写入 */
function listenRendererLog(): void {
  ipcMain.on('log-append', (_event, lines) => {
    if (!Array.isArray(lines) || !lines.length) return;
    runlog.pushText(lines.join('\n'), 'APPS');
  });
}

/** 注册全部 IPC 通道 */
function registerAll(): void {
  for (const mod of modules) mod.register(handle);
  listenRendererLog();
}

/** 构建通道到处理函数的映射 */
function buildHandlers(): Record<string, any> {
  const map = {};

  const collect = (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any): void => {
    map[channel] = fn;
  };
  for (const mod of modules) mod.register(collect);
  return map;
}

module.exports = { registerAll, buildHandlers };
