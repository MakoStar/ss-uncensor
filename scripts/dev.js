const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

delete process.env.ELECTRON_RUN_AS_NODE;

const fixture = path.join(
  __dirname,
  '..',
  'tests',
  'fixtures',
  'fetcher',
  process.platform === 'win32' ? 'ResourceFetcher.exe' : 'ResourceFetcher'
);
if (!process.env.RESOURCE_FETCHER && fs.existsSync(fixture)) process.env.RESOURCE_FETCHER = fixture;

const exe = require('electron');
const appDir = path.join(__dirname, '..');
const mode = process.argv[2] || 'start';
const passThrough = process.argv.slice(3);

if (!fs.existsSync(exe)) {
  console.log(`[electron] 二进制缺失：${exe}`);
  console.log('[electron] 正在下载（约 130MB，镜像 npmmirror）…');

  const installer = path.join(appDir, 'node_modules', 'electron', 'install.js');
  if (!fs.existsSync(installer)) {
    console.log('[electron] electron 包都没装，先跑 pnpm install');
    process.exit(1);
  }
  if (!process.env.ELECTRON_MIRROR && !process.env.npm_config_electron_mirror) {
    process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
  }
  const installed = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
  if (installed.status !== 0 || !fs.existsSync(exe)) {
    console.log('[electron] 下载失败，手动跑：node node_modules/electron/install.js');
    process.exit(1);
  }
  console.log('[electron] 二进制就绪，启动中…');
}

const localBin = path.join(
  appDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
);
const viteBin = fs.existsSync(localBin) ? localBin : 'electron-vite';

/** 调用构建工具打包应用 */
function build() {
  console.log('[build] electron-vite build …');
  const result = spawnSync(viteBin, ['build'], {
    stdio: 'inherit',
    cwd: appDir,
    windowsHide: true,
    shell: process.platform === 'win32'
  });
  if (result.error || result.status !== 0) {
    console.log('[build] 构建失败');
    process.exit(1);
  }
}

if (mode === 'dev') {
  const result = spawnSync(viteBin, ['dev'], {
    stdio: 'inherit',
    cwd: appDir,
    windowsHide: true,
    shell: process.platform === 'win32'
  });
  process.exit(result.status === null ? 1 : result.status);
}

build();

const headless = mode === 'selftest' || mode === 'pipeline';
const flag = mode === 'selftest' ? '--self-test' : mode === 'pipeline' ? '--pipeline' : '';

if (!headless) {
  console.log(`[electron] 启动：${exe}`);
  const started = Date.now();
  const result = spawnSync(exe, [appDir, ...(flag ? [flag] : []), ...passThrough], {
    stdio: 'inherit',
    windowsHide: true
  });
  const seconds = (Date.now() - started) / 1000;

  if (result.error) {
    console.log(`[electron] 启动失败：${result.error.message}`);
    process.exit(1);
  }
  const code = result.status === null ? 1 : result.status;

  if (code === 0 && seconds < 5) {
    console.log('[electron] 进程很快退出。若没看到窗口，检查启动日志：');
    console.log(`[electron] ${path.join(appDir, 'uncensor.log')}`);
  }
  process.exit(code);
}

const NOISE =
  /persistent cache|DawnGraphiteCache|gpu_process_host|GPU process isn't usable|viz\\host|^\[[0-9]+:[0-9]+\/[0-9.]+:ERROR:/;
const result = spawnSync(exe, [appDir, flag, ...passThrough], { encoding: 'utf8', windowsHide: true });

const stdout = result.stdout || '';
process.stdout.write(stdout);
for (const line of (result.stderr || '').split(/\r?\n/)) {
  if (line && !NOISE.test(line)) process.stdout.write(`${line}\n`);
}
if (result.error) console.log(`[electron] 启动失败：${result.error.message}`);

process.exit(/"ok":\s*true/.test(stdout) ? 0 : 1);
