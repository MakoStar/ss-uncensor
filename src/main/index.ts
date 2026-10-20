'use strict';

const path = require('path');
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');

const APP_NAME = '星塔反和谐工具';
const APP_ID = 'com.makostar.ssuncensor';

app.setName(APP_NAME);

/* 用户数据目录固定叫 ssuncensor，不跟随界面上的显示名 */
const USER_DATA = path.join(app.getPath('appData'), 'ssuncensor');
app.setPath('userData', USER_DATA);

/* 打包后产物收进 userData，安装目录留程序本体与配置 */
if (app.isPackaged && !process.env.SS_UNCENSOR_HOME) {
  process.env.SS_UNCENSOR_HOME = USER_DATA;
  process.env.SS_APP_DIR = path.dirname(app.getPath('exe'));
}

const { DIRS, relative, applyFetcher } = require('../core/config/paths');
const settings = require('../core/config/settings');
const appConfig = require('./services/config');
const { trace, STARTUP_LOG } = require('./services/file');
const windowService = require('./services/window');
const { registerAll } = require('./ipc');
const selfTest = require('./test');

const ICON = path.join(__dirname, '..', '..', 'build', 'icon-256.png');

/* 图标在 asar 里，必须转成 nativeImage；直接传路径字符串在打包后加载不到，窗口就只剩默认白纸图标 */
const windowIcon = nativeImage.createFromPath(ICON);
if (windowIcon.isEmpty()) trace(`window icon not loaded: ${ICON}`);

const savedFetcher = (settings.load() || {}).fetcher;
if (savedFetcher) applyFetcher(savedFetcher);

const installed = fs.existsSync(path.join(path.dirname(app.getPath('exe')), `Uninstall ${APP_NAME}.exe`));
if (process.platform === 'win32' && app.isPackaged && installed) app.setAppUserModelId(APP_ID);

app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.disableHardwareAcceleration();

trace(`==== launch argv=${JSON.stringify(process.argv.slice(1))}`);
trace(`cwd=${process.cwd()} electron=${process.versions.electron} node=${process.version}`);

process.on('uncaughtException', (err) => {
  trace(`uncaughtException: ${err.stack || err.message}`);
  console.error(err);
});
process.on('unhandledRejection', (err: any) => {
  trace(`unhandledRejection: ${err && (err.stack || err.message) ? err.stack || err.message : err}`);
});

/* 创建并展示主窗口 */
function createWindow() {
  const created = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#12151c',
    title: APP_NAME,
    icon: windowIcon,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windowService.set(created);
  created.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  created.once('ready-to-show', () => {
    created.show();
    created.focus();
    created.setAlwaysOnTop(true);
    created.setAlwaysOnTop(false);
    created.moveTop();
    trace(`window shown handle-ready  visible=${created.isVisible()} focused=${created.isFocused()}`);
    trace(`window icon  size=${windowIcon.getSize().width}x${windowIcon.getSize().height} empty=${windowIcon.isEmpty()}`);
    console.log(`[ss-uncensor] 窗口已打开：${APP_NAME}`);
    console.log(`[ss-uncensor] 启动日志：${STARTUP_LOG}`);
  });

  for (const event of ['did-finish-load', 'unresponsive', 'responsive']) {
    created.on(event, () => trace(`window ${event}`));
  }
  created.webContents.on('render-process-gone', (_event, details) => {
    trace(`render-process-gone: ${JSON.stringify(details)}`);
  });
  created.webContents.on('did-fail-load', (_event, code, description) => {
    trace(`did-fail-load: ${code} ${description}`);
    console.error(`[ss-uncensor] 界面加载失败 ${code} ${description}`);
  });
  created.on('closed', () => {
    trace('window closed');
    windowService.set(null);
  });
}

/* 无界面模式下跑完整流水线 */
async function runPipelineMode() {
  const { runPipeline } = require('../core/manifest/pipeline');
  const config = appConfig.current() || settings.load();
  const started = Date.now();

  try {
    const result = runPipeline({
      regions: config.regions.length > 0 ? config.regions : null,
      mode: 'snapshot',
      quiet: true,
      skipFetch: process.argv.includes('--skip-fetch'),
      ...config,
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(JSON.stringify({
      ok: true,
      seconds,
      built: result.built.map((item) => item.region),
      diff: result.report.summary,
      out: relative(result.outFile),
      list: relative(result.listFile),
    }, null, 2));
    app.exit(0);
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
    app.exit(1);
  }
}

if (process.argv.includes('--self-test')) {
  app.whenReady().then(selfTest);
} else if (process.argv.includes('--pipeline')) {
  app.whenReady().then(runPipelineMode);
} else {
  app.whenReady().then(() => {
    registerAll();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
