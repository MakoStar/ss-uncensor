'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const installer = path.join(root, 'node_modules', 'electron', 'install.js');
const binary = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  console.log('[electron] 已要求跳过二进制下载');
  process.exit(0);
}

if (fs.existsSync(binary)) {
  console.log('[electron] 二进制已就绪');
  process.exit(0);
}

if (!fs.existsSync(installer)) {
  console.log('[electron] 包未安装，跳过二进制下载');
  process.exit(0);
}

if (!process.env.CI && !process.env.ELECTRON_MIRROR && !process.env.npm_config_electron_mirror) {
  process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
}

const result = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
if (result.error) {
  console.log(`[electron] 下载失败：${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
