'use strict';

const { ipcMain } = require('electron');
const { trace } = require('../services/file');

const meta = require('./meta');
const settings = require('./settings');
const resource = require('./resource');
const launcher = require('./launcher');
const fetcher = require('./fetch');
const uncensor = require('./uncensor');
const region = require('./region');

/* 汇总所有域的 IPC 处理器 */
function buildHandlers() {
  return {
    ...meta, ...settings, ...resource, ...launcher, ...fetcher, ...uncensor, ...region,
  };
}

/* 向 ipcMain 注册全部处理器并统一捕获异常 */
function registerAll() {
  const handlers = buildHandlers();
  for (const [channel, handler] of Object.entries(handlers) as [string, any][]) {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await handler(event, payload);
      } catch (err) {
        trace(`ipc ${channel} failed: ${err.message}`);
        throw err;
      }
    });
  }
  return handlers;
}

module.exports = { registerAll, buildHandlers };
