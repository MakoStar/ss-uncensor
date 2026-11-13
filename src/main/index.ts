const path = require('path');
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');

const APP_NAME = '星塔反和谐工具';
const APP_ID = 'com.makostar.ssuncensor';

const WIN = { width: 1300, height: 754 };

app.setName(APP_NAME);

const EXE_DIR = path.dirname(app.getPath('exe'));
const FALLBACK_DIR = path.join(app.getPath('appData'), 'ssuncensor');

/** 探测目录是否有写入权限 */
const canWrite = (dir: string): boolean => {
  const probe = path.join(dir, '.ss-write-probe');
  try {
    fs.mkdirSync(probe);
    fs.rmdirSync(probe);
    return true;
  } catch (err) {
    return false;
  }
};

const DATA_DIR = app.isPackaged ? (canWrite(EXE_DIR) ? EXE_DIR : FALLBACK_DIR) : FALLBACK_DIR;

app.setPath('userData', app.isPackaged ? path.join(DATA_DIR, 'runtime') : FALLBACK_DIR);

if (app.isPackaged && !process.env.SS_UNCENSOR_HOME) {
  process.env.SS_UNCENSOR_HOME = DATA_DIR;
  process.env.SS_APP_DIR = EXE_DIR;
}

const { DIRS, relative, applyFetcher } = require('./core/config/paths');
const settings = require('./core/config/settings');
const appConfig = require('./services/config');
const { trace, STARTUP_LOG } = require('./services/file');

app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', STARTUP_LOG);
const windowService = require('./services/window');
const { registerAll } = require('./ipc');
if (app.isPackaged && DATA_DIR !== FALLBACK_DIR) {
  const legacyOutput = path.join(FALLBACK_DIR, 'output');
  if (!fs.existsSync(path.join(DATA_DIR, 'output')) && fs.existsSync(legacyOutput)) {
    trace(`检测到旧清单目录 ${legacyOutput}，需要沿用请手动复制到 ${path.join(DATA_DIR, 'output')}`);
  }
}

const selfTest = require('./test');

const ICONS = [
  path.join(__dirname, '..', '..', 'resources', 'icon-256.png'),
  path.join(__dirname, '..', '..', 'build', 'icon-256.png')
];
const ICON = ICONS.find((item) => fs.existsSync(item)) || ICONS[1];

const windowIcon = nativeImage.createFromPath(ICON);
if (windowIcon.isEmpty()) trace(`window icon not loaded: ${ICON}`);

const bootSettings = settings.load() || {};
const savedFetcher = bootSettings.fetcher;
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

/** 创建主窗口并绑定事件 */
function createWindow(): void {
  const created = new BrowserWindow({
    width: WIN.width,
    height: WIN.height,
    useContentSize: true,
    minWidth: WIN.width,
    minHeight: WIN.height,
    maxWidth: WIN.width,
    maxHeight: WIN.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#12151c',
    title: APP_NAME,
    icon: windowIcon,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  windowService.set(created);
  created.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  created.on('resize', () => {
    if (created.isMaximized() || created.isFullScreen()) return;
    const [width, height] = created.getContentSize();
    if (width !== WIN.width || height !== WIN.height) created.setContentSize(WIN.width, WIN.height);
  });

  created.once('ready-to-show', () => {
    created.show();
    created.focus();
    created.setAlwaysOnTop(true);
    created.setAlwaysOnTop(false);
    created.moveTop();
    trace(`window shown handle-ready  visible=${created.isVisible()} focused=${created.isFocused()}`);
    trace(
      `window icon  size=${windowIcon.getSize().width}x${windowIcon.getSize().height} empty=${windowIcon.isEmpty()}`
    );
    console.log(`[ss-uncensor] 窗口已打开: ${APP_NAME}`);
    console.log(`[ss-uncensor] 启动日志: ${STARTUP_LOG}`);
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

/** 以命令行方式跑清单流水线 */
async function runPipelineMode(): Promise<void> {
  const { runPipeline } = require('./core/manifest/pipeline');
  const config = appConfig.current() || settings.load();
  const started = Date.now();

  try {
    const result = runPipeline({
      regions: config.regions.length > 0 ? config.regions : null,
      mode: 'snapshot',
      quiet: true,
      skipFetch: process.argv.includes('--skip-fetch'),
      ...config
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      JSON.stringify(
        {
          ok: true,
          seconds,
          built: result.built.map((item) => item.region),
          diff: result.report.summary,
          out: relative(result.outFile),
          list: relative(result.listFile)
        },
        null,
        2
      )
    );
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
    appConfig.watch((next) => {
      const win = windowService.get();
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('config:changed', { config: next });
      }
      trace('config reloaded from disk');
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
