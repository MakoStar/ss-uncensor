const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { net, session: electronSession } = require('electron');
const { DIRS, fetcher } = require('../core/config/paths');
const { mirrorOf, MIRRORS } = require('../core/config/mirrors');
const settings = require('../core/config/settings');
const log = require('../core/log/log');

const REPO = 'MakoStar/ss-resource-fetcher';
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

const PLATFORM_TAG = { win32: 'win', linux: 'linux', darwin: 'darwin' };
const ARCH_TAG = { x64: 'x64', arm64: 'arm64' };

/** 返回本机工具可执行文件名 */
const exeName = (): string => (process.platform === 'win32' ? 'ResourceFetcher.exe' : 'ResourceFetcher');

/** 拼出工具的安装目录路径 */
const targetDir = (): string => path.join(DIRS.appDir, 'ResourceTool');

/** 拼出发布列表缓存文件路径 */
const cacheFile = (): string => path.join(DIRS.home, 'cache', 'fetcher-releases.json');

/** 读取发版缓存并校验有效性 */
function readReleasesCache(): {
  at: number;
  releases: Array<{
    tag: string;
    name: string;
    date: string;
    channel: string;
    channelLabel: string;
    channelShort: string;
    prerelease: boolean;
  }>;
} | null {
  try {
    const data = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    if (data && Array.isArray(data.releases) && data.releases.length) return data;
  } catch (err) {}
  return null;
}

/** 把发版列表写入缓存文件 */
function writeReleasesCache(
  releases: Array<{
    tag: string;
    name: string;
    date: string;
    channel: string;
    channelLabel: string;
    channelShort: string;
    prerelease: boolean;
  }>
): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify({ at: Date.now(), releases }), 'utf8');
  } catch (err) {}
}

let apiPreferred = '';
let downloadPreferred = '';

const sessions = new Map();

/** 按模式取复用的网络会话 */
function netSession(mode: string): Electron.Session {
  const key = mode === 'direct' ? 'direct' : 'system';
  if (!sessions.has(key)) {
    const item = electronSession.fromPartition(`ss-fetcher-net-${key}`);
    try {
      item.setProxy({ mode: key === 'direct' ? 'direct' : 'system' });
    } catch (err) {}
    sessions.set(key, item);
  }
  return sessions.get(key);
}

/** 判断错误是否为证书校验失败 */
const isCertError = (err: any): boolean =>
  /ERR_CERT|CERT_(AUTHORITY|COMMON_NAME|DATE|REVOKED)/i.test(String((err && err.message) || ''));

let abortFlag = false;
let activeRequest = null;

/** 发起请求并把响应体收成缓冲 */
function requestBuffer(
  url: string,
  {
    onProgress,
    timeout = 25000,
    mode = 'system'
  }: {
    onProgress?: (received: number, total: number) => void;
    timeout?: number;
    mode?: string;
  } = {}
): Promise<{ buffer: Buffer; bytes: number }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeRequest === request) activeRequest = null;
      reject(abortFlag ? new Error('已中断') : error);
    };

    const request = net.request({ method: 'GET', url, redirect: 'follow', session: netSession(mode) });
    activeRequest = request;
    request.setHeader('User-Agent', 'ss-uncensor-gui');
    request.setHeader('Accept', 'application/vnd.github+json');

    let timer: any = null;

    const arm = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          request.abort();
        } catch (err) {}
        fail(new Error(`连接超时（${Math.round(timeout / 1000)}s 没有数据）`));
      }, timeout);
      if (timer.unref) timer.unref();
    };
    arm();

    request.on('response', (response) => {
      const status = response.statusCode;
      if (status < 200 || status >= 300) {
        response.on('data', () => {});
        response.on('end', () => fail(new Error(`HTTP ${status}`)));
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      const chunks = [];
      let received = 0;

      response.on('data', (chunk) => {
        if (abortFlag) {
          try {
            request.abort();
          } catch (err) {}
          fail(new Error('已中断'));
          return;
        }
        arm();
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
    request.on('abort', () => fail(new Error('已中断')));
    request.on('error', fail);
    request.end();
  });
}

let proxyCertBroken = false;

/** 证书失败时直连重试请求 */
async function requestBufferWithRetry(
  url: string,
  options: {
    onProgress?: (received: number, total: number) => void;
    timeout?: number;
    mode?: string;
  } = {}
): Promise<{ buffer: Buffer; bytes: number }> {
  const first = options.mode || (proxyCertBroken ? 'direct' : 'system');
  try {
    return await requestBuffer(url, { ...options, mode: first });
  } catch (err) {
    if (abortFlag || !isCertError(err) || first === 'direct') throw err;
    proxyCertBroken = true;
    log.warn('系统代理证书校验失败, 后续请求改用直连');
    return requestBuffer(url, { ...options, mode: 'direct' });
  }
}

/** 中断正在进行的下载请求 */
function cancel(): { ok: boolean } {
  abortFlag = true;
  if (activeRequest) {
    try {
      activeRequest.abort();
    } catch (err) {}
    activeRequest = null;
  }
  return { ok: true };
}

const API_MIRROR_KEYS = ['gh-proxy-com', 'ghproxy'];

/** 列出接口的官方与镜像线路 */
function apiRoutes(url: string): { label: string; url: string }[] {
  const routes = [{ label: 'GitHub 官方', url }];
  for (const key of API_MIRROR_KEYS) {
    const mirror = mirrorOf(key);
    if (mirror.prefix) routes.push({ label: mirror.label.replace(/\s*加速$/, ''), url: mirror.prefix + url });
  }
  return routes;
}

/** 请求单条线路并校验返回 */
async function fetchApiRoute(route: { label: string; url: string }): Promise<any> {
  try {
    const { buffer } = await requestBufferWithRetry(route.url, { timeout: 6000 });
    const text = buffer.toString('utf8').trim();
    if (!text.startsWith('{') && !text.startsWith('[')) throw new Error('返回的不是 JSON');
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('JSON 解析失败');
    }
    const usable = Array.isArray(data) || (data && (Array.isArray(data.assets) || typeof data.tag_name === 'string'));
    if (!usable) throw new Error(String((data && data.message) || '返回内容不完整'));
    return data;
  } catch (err: any) {
    if (abortFlag) throw err;
    throw new Error(`${route.label}：${err.message}`);
  }
}

/** 并发抢占最先成功的线路 */
function raceRoutes(tasks: Array<Promise<any>>): Promise<any> {
  return new Promise((resolve, reject) => {
    let left = tasks.length;
    const errors: string[] = [];
    if (!left) {
      reject(new Error('没有可用的线路'));
      return;
    }
    for (const task of tasks) {
      task.then(resolve).catch((err) => {
        errors.push(err.message);
        left -= 1;
        if (left === 0) reject(new Error(errors.join('；')));
      });
    }
  });
}

/** 按优先级依次请求接口数据 */
async function requestGithubJson(url: string): Promise<any> {
  const routes = apiRoutes(url);
  const preferred = apiPreferred && routes.find((route) => route.url.startsWith(apiPreferred));
  if (preferred) {
    try {
      const data = await fetchApiRoute(preferred);
      return data;
    } catch (err: any) {
      if (abortFlag) throw err;
    }
  }

  const rest = preferred ? routes.filter((route) => route !== preferred) : routes;
  const hit = await raceRoutes(rest.map(async (route) => ({ data: await fetchApiRoute(route), route })));
  const base = url;
  apiPreferred = hit.route.url === base ? base : hit.route.url.slice(0, hit.route.url.length - url.length);
  log.info(`GitHub API 线路: ${hit.route.label}`);
  return hit.data;
}

/** 挑出适配本机平台架构的包 */
function pickAsset(
  assets: Array<{ name: string; size: number; browser_download_url: string }> = []
): { name: string; size: number; browser_download_url: string } | null {
  const plat = PLATFORM_TAG[process.platform] || process.platform;
  const arch = ARCH_TAG[process.arch] || process.arch;
  const usable = assets.filter((asset) => /\.(zip|tar\.gz)$/i.test(asset.name));
  const forPlatform = usable.filter((asset) => asset.name.toLowerCase().includes(`-${plat}-`));
  return forPlatform.find((asset) => asset.name.toLowerCase().includes(`-${arch}.`)) || forPlatform[0] || null;
}

/** 把版本号规范成统一标签 */
function normalizeTag(value: unknown): string | null {
  const hit = String(value || '').match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return hit ? `v${hit[1]}` : null;
}

/** 按后缀判断版本所属渠道 */
function channelOf(value: unknown): 'stable' | 'alpha' | 'beta' | 'rc' {
  const tag = String(value || '').toLowerCase();
  if (/-alpha(\.\d+)?$/.test(tag)) return 'alpha';
  if (/-beta(\.\d+)?$/.test(tag)) return 'beta';
  if (/-rc(\.\d+)?$/.test(tag)) return 'rc';
  return 'stable';
}

const CHANNEL_LABEL = { stable: '正式版', alpha: 'Alpha 测试版', beta: 'Beta 测试版', rc: 'RC 候选版' };

const CHANNEL_SHORT = { stable: '正式', alpha: 'Alpha', beta: 'Beta', rc: 'RC' };

/** 运行本地工具读取其版本号 */
function localVersion(exe?: string): string | null {
  const target = exe || fetcher();
  if (!target) return null;
  try {
    const result = spawnSync(target, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    return normalizeTag(`${result.stdout || ''}${result.stderr || ''}`);
  } catch (err) {
    return null;
  }
}

/** 比较两个版本标签的新旧 */
function isNewer(a: unknown, b: unknown): boolean {
  const left = normalizeTag(a);
  const right = normalizeTag(b);
  if (!left || !right) return false;

  const split = (tag: string): { nums: number[]; pre: string | null } => {
    const base = tag.slice(1);
    const dash = base.indexOf('-');
    const core = dash === -1 ? base : base.slice(0, dash);
    const pre = dash === -1 ? null : base.slice(dash + 1);
    return { nums: core.split('.').map(Number), pre };
  };

  const pa = split(left);
  const pb = split(right);
  for (let i = 0; i < 3; i += 1) {
    const va = pa.nums[i] || 0;
    const vb = pb.nums[i] || 0;
    if (va !== vb) return va > vb;
  }

  if (!pa.pre && !pb.pre) return false;
  if (!pa.pre) return true;
  if (!pb.pre) return false;

  const rank = { alpha: 1, beta: 2, rc: 3 };

  const parsePre = (pre: string): { rank: number; num: number } => {
    const [name = '', num = '0'] = String(pre).split('.');
    return { rank: rank[name] || 0, num: Number(num) || 0 };
  };
  const ka = parsePre(pa.pre);
  const kb = parsePre(pb.pre);
  if (ka.rank !== kb.rank) return ka.rank > kb.rank;
  return ka.num > kb.num;
}

/** 拼出指定版本的发布接口地址 */
function releaseUrl(tag?: string | null): string {
  return tag ? `https://api.github.com/repos/${REPO}/releases/tags/${tag}` : API_LATEST;
}

/** 按渠道解析出目标发布标签 */
async function resolveTag(tag: string | null, channel: string | null): Promise<string | null> {
  if (tag) return tag;
  if (!channel || channel === 'stable') return null;

  const releases = await recentReleases(20);
  const hit = latestByChannel(releases, channel === 'prerelease' ? 'prerelease' : channel);
  if (!hit) throw new Error(`没有找到 ${CHANNEL_LABEL[channel] || channel} 的发布版本`);
  return hit.tag;
}

/** 读取发布信息并选出安装包 */
async function fetchRelease(tag?: string | null): Promise<{
  tag: string;
  asset: { name: string; size: number; browser_download_url: string };
}> {
  const release = await requestGithubJson(releaseUrl(tag));
  if (!release || typeof release !== 'object' || !Array.isArray(release.assets)) {
    throw new Error(`读取 release 失败：${(release && release.message) || '返回内容不完整'}`);
  }
  const asset = pickAsset(release.assets);
  if (!asset) throw new Error(`${release.tag_name ?? tag ?? '该版本'} 没有适配本机的包`);
  return { tag: normalizeTag(release.tag_name) || release.tag_name, asset };
}

/** 取最新一次发布的信息 */
async function latestRelease(): Promise<{
  tag: string;
  asset: { name: string; size: number; browser_download_url: string };
}> {
  return fetchRelease(null);
}

/** 读取最近的发布版本列表 */
async function recentReleases(limit: number = 10): Promise<
  Array<{
    tag: string;
    name: string;
    date: string;
    channel: string;
    channelLabel: string;
    channelShort: string;
    prerelease: boolean;
  }>
> {
  let raw;
  try {
    raw = await requestGithubJson(`https://api.github.com/repos/${REPO}/releases?per_page=${Math.max(limit, 20)}`);
    if (!Array.isArray(raw)) throw new Error('GitHub 返回的不是发布列表，可能被限流或网络被拦截');
  } catch (err) {
    const cache = readReleasesCache();
    if (cache) {
      err.releases = cache.releases;
      err.cachedAt = cache.at;
    }
    throw err;
  }

  const list = raw.map((release) => {
    const tag = normalizeTag(release.tag_name) || release.tag_name;
    const channel = channelOf(tag);
    return {
      tag,
      name: release.name ?? '',
      date: String(release.published_at ?? '').slice(0, 10),
      channel,
      channelLabel: CHANNEL_LABEL[channel],
      channelShort: CHANNEL_SHORT[channel],
      prerelease: Boolean(release.prerelease)
    };
  });
  writeReleasesCache(list);
  return list.slice(0, limit);
}

/** 从列表中取该渠道最新一条 */
function latestByChannel(
  releases: Array<{
    tag: string;
    name: string;
    date: string;
    channel: string;
    channelLabel: string;
    channelShort: string;
    prerelease: boolean;
  }>,
  wanted: string
): {
  tag: string;
  name: string;
  date: string;
  channel: string;
  channelLabel: string;
  channelShort: string;
  prerelease: boolean;
} | null {
  const pool = releases.filter((item) => (wanted === 'stable' ? item.channel === 'stable' : item.channel !== 'stable'));
  if (pool.length === 0) return null;
  return pool[0];
}

/** 汇总本地与远端版本信息 */
async function versionInfo(): Promise<Record<string, any>> {
  const local = localVersion();
  let error = null;
  let releases = [];
  let cachedAt: number | null = null;

  try {
    releases = await recentReleases(20);
  } catch (err) {
    error = err.message;
    if (Array.isArray(err.releases) && err.releases.length) {
      releases = err.releases;
      cachedAt = err.cachedAt || null;
    }
  }

  const stable = latestByChannel(releases, 'stable');
  const pre = latestByChannel(releases, 'prerelease');

  const latest = stable || pre;
  const latestChannel = latest ? latest.channel : null;

  const channels = { stable: null, alpha: null, beta: null, rc: null };
  for (const item of releases) {
    if (item.channel in channels && !channels[item.channel]) channels[item.channel] = item.tag;
  }
  const channelAvailable = {};
  for (const [name, tag] of Object.entries(channels)) {
    channelAvailable[name] = Boolean(local && tag && isNewer(tag, local));
  }

  return {
    channels,
    channelAvailable,
    local,
    localChannel: local ? channelOf(local) : null,
    localChannelLabel: local ? CHANNEL_LABEL[channelOf(local)] : '',
    latest: latest ? latest.tag : null,
    latestChannel,
    latestChannelLabel: latest ? latest.channelLabel : '',
    latestStable: stable ? stable.tag : null,
    latestPrerelease: pre ? pre.tag : null,
    latestPrereleaseChannel: pre ? pre.channel : null,
    latestPrereleaseChannelLabel: pre ? pre.channelLabel : '',
    updateAvailable: Boolean(local && latest && isNewer(latest.tag, local)),
    prereleaseAvailable: Boolean(local && pre && isNewer(pre.tag, local)),
    stale: Boolean(cachedAt),
    cachedAt: cachedAt ? new Date(cachedAt).toISOString() : null,
    error
  };
}

/** 调用系统工具解压压缩包 */
function extract(archive: string, dest: string): void {
  const isZip = archive.toLowerCase().endsWith('.zip');
  let result = spawnSync('tar', isZip ? ['-xf', archive, '-C', dest] : ['-xzf', archive, '-C', dest], {
    windowsHide: true
  });

  if (isZip && (result.error || result.status !== 0)) {
    result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dest}' -Force`
      ],
      { windowsHide: true }
    );
  }

  if (result.error) throw new Error(`解压失败：${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim() || `退出码 ${result.status}`;
    throw new Error(`解压失败：${detail}`);
  }
}

/** 在目录里递归查找可执行文件 */
function findExe(dir: string, depth: number = 0): string | null {
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

/** 按线路列表逐个下载安装包 */
async function downloadAsset(
  asset: { name: string; size: number; browser_download_url: string },
  {
    onLog,
    onProgress,
    size
  }: {
    onLog: (tag: string, message: string) => void;
    onProgress: (got: number, total: number, phase: string) => void;
    size: number;
  }
): Promise<Buffer> {
  const mirror = mirrorOf(settings.load().fetcherMirror);
  const candidates: Array<{ url: string; label: string }> = [];

  const push = (url: string, label: string) => {
    if (!candidates.some((item) => item.url === url)) candidates.push({ url, label });
  };

  if (mirror.prefix) push(mirror.prefix + asset.browser_download_url, mirror.label);
  if (downloadPreferred) push(downloadPreferred + asset.browser_download_url, '上次成功的线路');
  for (const item of MIRRORS) {
    if (item.prefix) push(item.prefix + asset.browser_download_url, item.label);
  }
  push(asset.browser_download_url, 'GitHub 官方');

  let lastError: any = null;
  for (let index = 0; index < candidates.length; index += 1) {
    if (abortFlag) throw new Error('已中断');
    const line = candidates[index];
    if (index > 0) onLog('WARN', `换线路重试: ${line.label}`);
    try {
      const { buffer } = await requestBufferWithRetry(line.url, {
        timeout: 25000,
        onProgress: (got, total) => onProgress(got, total || size, 'download')
      });
      if (buffer.length) {
        if (index > 0) onLog('INFO', `改由 ${line.label} 下载成功`);
        downloadPreferred = line.url.slice(0, line.url.length - asset.browser_download_url.length);
        return buffer;
      }
      lastError = new Error('下载到 0 字节');
    } catch (err) {
      if (abortFlag) throw err;
      lastError = err;
      onLog('WARN', `${line.label} 失败: ${err.message}`);
    }
  }
  throw lastError || new Error('所有下载线路都失败');
}

/** 下载解压并安装工具到目录 */
async function install({
  destDir,
  update = false,
  tag = null,
  channel = null,
  onLog = (() => {}) as any,
  onProgress = (() => {}) as any
}: {
  destDir?: string;
  update?: boolean;
  tag?: string | null;
  channel?: string | null;
  onLog?: (tag: string, message: string) => void;
  onProgress?: (got: number, total: number, phase: string) => void;
} = {}): Promise<Record<string, any>> {
  const target = path.resolve(destDir || targetDir());
  const stage = path.join(target, '.extract');
  let archive = null;
  abortFlag = false;

  try {
    const targetTag = await resolveTag(tag, channel);
    const options = { update, tag: targetTag };

    onLog('TIPS', targetTag ? `获取版本: ${REPO} @ ${targetTag}` : `查询最新版本: ${REPO}`);
    const release = await requestGithubJson(releaseUrl(targetTag));
    if (abortFlag) throw new Error('已中断');

    if (!release || !Array.isArray(release.assets)) throw new Error(`读取 release 失败：${release && release.message}`);

    const asset = pickAsset(release.assets);
    if (!asset) {
      throw new Error(`最新版 ${release.tag_name} 没有适配 ${process.platform}/${process.arch} 的包`);
    }

    const sizeMb = (asset.size / 1048576).toFixed(1);
    onLog('INFO', `版本 ${release.tag_name} ${asset.name} ${sizeMb}MB`);

    const buffer = await downloadAsset(asset, { onLog, onProgress, size: asset.size });
    if (buffer.length === 0) throw new Error('下载到 0 字节');
    if (abortFlag) throw new Error('已中断');

    archive = path.join(
      os.tmpdir(),
      `ss-fetcher-${Date.now()}${asset.name.toLowerCase().endsWith('.zip') ? '.zip' : '.tar.gz'}`
    );
    fs.writeFileSync(archive, buffer);
    onLog('INFO', `已下载 ${(buffer.length / 1048576).toFixed(1)}MB, 开始解压`);
    onProgress(1, 1, 'extract');

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
    const installedTag = normalizeTag(release.tag_name) || release.tag_name;
    const installedChannel = channelOf(installedTag);
    onLog(
      'SUCC',
      `${options.update ? '已更新' : '已安装'} ${exeName()} · ${release.tag_name}（${CHANNEL_LABEL[installedChannel]}）`
    );
    onProgress(1, 1, 'done');
    return {
      ok: true,
      path: installed,
      version: release.tag_name,
      versionTag: installedTag,
      channel: installedChannel,
      channelLabel: CHANNEL_LABEL[installedChannel],
      asset: asset.name,
      dir: target,
      updated: Boolean(options.update)
    };
  } catch (error) {
    if (abortFlag) {
      onLog('WARN', '下载已中断');
      return { ok: false, cancelled: true, error: '已中断下载', releases: RELEASES_PAGE };
    }
    onLog('ERRO', `自动下载失败: ${error.message}`);
    return { ok: false, error: error.message, releases: RELEASES_PAGE };
  } finally {
    abortFlag = false;
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
  cancel,
  normalizeTag,
  channelOf,
  CHANNEL_LABEL,
  CHANNEL_SHORT,
  localVersion,
  latestRelease,
  versionInfo,
  recentReleases,
  isNewer
};
