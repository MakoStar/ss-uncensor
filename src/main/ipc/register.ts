const { ipcMain } = require('electron');
const { trace } = require('../services/file');

/** 把处理函数注册到 IPC 通道 */
function handle(channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any): void {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      return await fn(event, payload);
    } catch (err) {
      trace(`ipc ${channel} failed: ${err && err.message}`);
      throw err;
    }
  });
}

module.exports = { handle };
