'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { net, app } = require('electron');
const { DIRS, fetcher } = require('../../core/config/paths');

const REPO = 'MakoStar/ss-resource-fetcher';
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

const PLATFORM_TAG = { win32: 'win', linux: 'linux', darwin: 'darwin' };
const ARCH_TAG = { x64: 'x64', arm64: 'arm64' };

/* 返回当前平台的抓取器可执行文件名 */
const exeName = () => (process.platform === 'win32' ? 'ResourceFetcher.exe' : 'ResourceFetcher');

/* 返回抓取器落盘目录：安装目录下的 ResourceTool */
const targetDir = () => path.join(DIRS.appDir, 'ResourceTool');

/* 下载文件到内存并回报下载进度 */
function requestBuffer(url: string, { onProgress, timeout = 60000 }: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const request = net.request({ method: 'GET', url, redirect: 'follow' });
    request.setHeader('User-Agent', 'ss-uncensor-gui');
    request.setHeader('Accept', 'application/vnd.github+json');

    const timer = setTimeout(() => {
      try { request.abort(); } catch (err) {  }
      fail(new Error(`请求超时（${Math.round(timeout / 1000)}s）：${url}`));
    }, timeout);
    if (timer.unref) timer.unref();

    request.on('response', (response) => {
      const status = response.statusCode;
      if (status < 200 || status >= 300) {
        response.on('data', () => {});
        response.on('end', () => fail(new Error(`HTTP ${status}：${url}`)));
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      const chunks = [];
      let received = 0;

      response.on('data', (chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ buffer: Buffer.concat(chunks), bytes: received });
      });
      response.on('error', fail);
    });
    request.on('error', fail);
    request.end();
  });
}

/* 从发布资产里挑出当前平台架构对应的压缩包 */
function pickAsset(assets = []) {
  const plat = PLATFORM_TAG[process.platform] || process.platform;
  const arch = ARCH_TAG[process.arch] || process.arch;
  const usable = assets.filter((asset) => /\.(zip|tar\.gz)$/i.test(asset.name));
  const forPlatform = usable.filter((asset) => asset.name.toLowerCase().includes(`-${plat}-`));
  return forPlatform.find((asset) => asset.name.toLowerCase().includes(`-${arch}.`)) || forPlatform[0] || null;
}

/* 把版本号归一化成可比较的形式 */
function normalizeTag(value) {
  const hit = String(value || '').match(/(\d+\.\d+\.\d+)/);
  return hit ? `v${hit[1]}` : null;
}

/* 读取本地抓取器的版本号 */
function localVersion(exe?: string) {
  const target = exe || fetcher();
  if (!target) return null;
  try {
    const result = spawnSync(target, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    return normalizeTag(`${result.stdout || ''}${result.stderr || ''}`);
  } catch (err) {
    return null;
  }
}

/* 比较两个版本号判断是否更新 */
function isNewer(a, b) {
  const left = normalizeTag(a);
  const right = normalizeTag(b);
  if (!left || !right) return false;

  const pa = left.slice(1).split('.').map(Number);
  const pb = right.slice(1).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/* 拉取 GitHub 最新发布信息 */
async function latestRelease() {
  const { buffer } = await requestBuffer(API_LATEST, { timeout: 30000 });
  let release;
  try {
    release = JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw new Error('GitHub 返回的不是 JSON，可能被限流或网络被拦截');
  }
  const asset = pickAsset(release.assets);
  if (!asset) throw new Error(`最新 ${release.tag_name} 没有适配本机的包`);
  return { tag: normalizeTag(release.tag_name) || release.tag_name, asset };
}

/* 汇总本地与远端抓取器版本供界面展示 */
async function versionInfo() {
  const local = localVersion();
  let latest = null;
  let error = null;
  try {
    latest = (await latestRelease()).tag;
  } catch (err) {
    error = err.message;
  }
  return { local, latest, updateAvailable: Boolean(local && latest && isNewer(latest, local)), error };
}

/* 解压抓取器压缩包到目标目录 */
function extract(archive, dest) {
  const isZip = archive.toLowerCase().endsWith('.zip');
  let result = spawnSync('tar', isZip ? ['-xf', archive, '-C', dest] : ['-xzf', archive, '-C', dest], {
    windowsHide: true,
  });

  if (isZip && (result.error || result.status !== 0)) {
    result = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dest}' -Force`],
      { windowsHide: true },
    );
  }

  if (result.error) throw new Error(`解压失败：${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim() || `退出码 ${result.status}`;
    throw new Error(`解压失败：${detail}`);
  }
}

/* 在解压结果里递归定位抓取器可执行文件 */
function findExe(dir, depth = 0) {
  if (depth > 4) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === exeName()) return full;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hit = findExe(path.join(dir, entry.name), depth + 1);
    if (hit) return hit;
  }
  return null;
}

/* 下载并安装抓取器到工具目录 */
async function install({ destDir, update = false, onLog = (() => {}) as any, onProgress = (() => {}) as any }: any = {}) {
  const options = { update };
  const target = path.resolve(destDir || targetDir());
  const stage = path.join(target, '.extract');
  let archive = null;

  try {
    onLog('TIPS', `查询最新版本：${REPO}`);
    const { buffer: metaBuffer } = await requestBuffer(API_LATEST, { timeout: 30000 });

    let release;
    try {
      release = JSON.parse(metaBuffer.toString('utf8'));
    } catch (err) {
      throw new Error('GitHub 返回的不是 JSON，可能被限流或网络被拦截');
    }
    if (!release || !Array.isArray(release.assets)) throw new Error(`读取 release 失败：${release && release.message}`);

    const asset = pickAsset(release.assets);
    if (!asset) {
      throw new Error(`最新版 ${release.tag_name} 没有适配 ${process.platform}/${process.arch} 的包`);
    }

    const sizeMb = (asset.size / 1048576).toFixed(1);
    onLog('INFO', `版本 ${release.tag_name} · ${asset.name} · ${sizeMb}MB`);

    const { buffer } = await requestBuffer(asset.browser_download_url, {
      timeout: 300000,
      onProgress: (got, total) => onProgress(got, total || asset.size, 'download'),
    });
    if (buffer.length === 0) throw new Error('下载到 0 字节');

    archive = path.join(os.tmpdir(), `ss-fetcher-${Date.now()}${asset.name.toLowerCase().endsWith('.zip') ? '.zip' : '.tar.gz'}`);
    fs.writeFileSync(archive, buffer);
    onLog('INFO', `已下载 ${(buffer.length / 1048576).toFixed(1)}MB，开始解压`);

    fs.mkdirSync(target, { recursive: true });
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    extract(archive, stage);

    const found = findExe(stage);
    if (!found) throw new Error(`压缩包里没找到 ${exeName()}`);

    const installed = path.join(target, exeName());
    const backup = `${installed}.bak`;

    const hadOld = Boolean(options.update) && fs.existsSync(installed);
    if (hadOld) {
      fs.rmSync(backup, { force: true });
      fs.renameSync(installed, backup);
    }

    try {

      const from = path.dirname(found);
      const source = path.resolve(from) === path.resolve(target) ? stage : from;
      for (const entry of fs.readdirSync(source)) {
        fs.renameSync(path.join(source, entry), path.join(target, entry));
      }

      if (!fs.existsSync(installed)) throw new Error(`安装后仍找不到 ${installed}`);
      if (process.platform !== 'win32') fs.chmodSync(installed, 0o755);
    } catch (swapError) {

      if (hadOld && fs.existsSync(backup)) fs.renameSync(backup, installed);
      throw swapError;
    }

    fs.rmSync(backup, { force: true });
    onLog('SUCC', `${options.update ? '已更新' : '已安装'} ${exeName()} · ${release.tag_name}`);
    onProgress(1, 1, 'done');
    return {
      ok: true,
      path: installed,
      version: release.tag_name,
      asset: asset.name,
      dir: target,
      updated: Boolean(options.update),
    };
  } catch (error) {
    onLog('ERRO', `自动下载失败：${error.message}`);
    return { ok: false, error: error.message, releases: RELEASES_PAGE };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    if (archive) fs.rmSync(archive, { force: true });
  }
}

module.exports = {
  REPO,
  RELEASES_PAGE,
  API_LATEST,
  pickAsset,
  exeName,
  targetDir,
  install,
  normalizeTag,
  localVersion,
  latestRelease,
  versionInfo,
  isNewer,
};
