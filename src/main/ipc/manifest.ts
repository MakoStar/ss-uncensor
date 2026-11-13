const fs = require('fs');
const path = require('path');
const { DIRS, relative } = require('../core/config/paths');

/** 读取清单目录树 */
function tree(platform: string): {
  ok: boolean;
  platform: string;
  root: string;
  rel: string;
  regions: {
    region: string;
    dir: string;
    rel: string;
    files: { name: string; path: string; rel: string; bytes: number; mtime: number }[];
  }[];
} {
  const root = DIRS.manifest;
  const regions = [];

  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const dir = path.join(root, entry.name);
      const files = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((item) => item.isFile() && item.name.startsWith(`${platform}_`))
        .map((item) => {
          const file = path.join(dir, item.name);
          const stat = fs.statSync(file);
          return { name: item.name, path: file, rel: relative(file), bytes: stat.size, mtime: stat.mtimeMs };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      if (files.length) regions.push({ region: entry.name, dir, rel: relative(dir), files });
    }
  }
  return { ok: true, platform, root, rel: relative(root), regions };
}

/** 注册清单目录 IPC */
function register(
  handle: (channel: string, fn: (event: Electron.IpcMainInvokeEvent, payload: any) => any) => void
): void {
  handle('manifest-tree', (_event, payload) => tree((payload && payload.platform) || 'win'));
}

module.exports = { register };
