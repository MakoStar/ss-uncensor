const path = require('path');
const fs = require('fs');
const background = require('../core/launcher/background');
const { trace } = require('../services/file');

/** 从地址推导背景图文件名 */
function fileNameOf(url: string, dataUrl: string): string {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch (err) {
    name = '';
  }
  if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) {
    const mime = /^data:([^;]+);/.exec(dataUrl || '');
    const ext = mime && /png/i.test(mime[1]) ? 'png' : /webp/i.test(mime[1] || '') ? 'webp' : 'jpg';
    name = `launcher_bg_${Date.now()}.${ext}`;
  }
  return name;
}

/** 注册背景图相关 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('background-config', async () => {
    try {
      const { url, crc64 } = await background.requestClientInfo();
      return { ok: true, url, crc64 };
    } catch (err) {
      trace(`background-config 失败：${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  handle('background-image', async (_event, payload: { url?: string } = {}) => {
    try {
      const { base64 } = await background.requestImageBase64(payload.url);
      if (!base64) return { ok: false, error: '背景图下载结果为空' };
      return { ok: true, base64 };
    } catch (err) {
      trace(`background-image 失败：${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  handle('background-save', async (_event, payload: { url?: string; dir?: string } = {}) => {
    try {
      const url = String(payload.url || '');
      const dir = String(payload.dir || '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: '背景图地址无效' };
      if (!dir) return { ok: false, error: '未选择保存目录' };

      const { base64 } = await background.requestImageBase64(url);
      if (!base64) return { ok: false, error: '背景图下载结果为空' };

      const match = /^data:[^;]+;base64,(.*)$/.exec(base64);
      if (!match) return { ok: false, error: '背景图数据格式异常' };

      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, fileNameOf(url, base64));
      fs.writeFileSync(file, Buffer.from(match[1], 'base64'));
      return { ok: true, file, bytes: fs.statSync(file).size };
    } catch (err) {
      trace(`background-save 失败：${err.message}`);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
