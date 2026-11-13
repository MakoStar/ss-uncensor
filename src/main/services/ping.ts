const dns = require('dns');
const { spawn, spawnSync } = require('child_process');
const { net } = require('electron');

const { fetcher } = require('../core/config/paths');
const { SERVER_REGIONS } = require('../core/config');

const ICMP_TIMEOUT = 6000;
const HTTP_TIMEOUT = 8000;

/** 读取工具输出的各服地址 */
function serverUrls(): Record<string, string> {
  const exe = fetcher();
  if (!exe) return {};

  const result = spawnSync(exe, ['--print_keys'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const map = {};
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const hit = line.match(/TASK\.CLIENT\.SERVERS\.([A-Z]{2})\.URL\s+\S+\s+(\S+)/);
    if (hit) map[hit[1]] = hit[2];
  }
  return map;
}

/** 从命令输出里解析延迟毫秒 */
function parseIcmp(text: string, platformName: string = process.platform): number | null {
  if (platformName === 'win32') {
    const values = [...String(text).matchAll(/=\s*(\d+)\s*ms/g)].map((hit) => Number(hit[1]));
    return values.length ? values[values.length - 1] : null;
  }
  const hit = String(text).match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\//);
  return hit ? Number(hit[2]) : null;
}

/** 对主机执行两次延迟探测 */
function icmpPing(host: string): Promise<number | null> {
  return new Promise((resolve) => {
    const args = process.platform === 'win32' ? ['-n', '2', '-w', '2000', host] : ['-c', '2', '-W', '2', host];

    let child;
    try {
      child = spawn('ping', args, { windowsHide: true });
    } catch (err) {
      resolve(null);
      return;
    }

    let buffer = Buffer.alloc(0);

    const finish = (value: number | null): void => {
      clearTimeout(timer);
      try {
        child.kill();
      } catch (err) {}
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), ICMP_TIMEOUT);

    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
    });
    child.stderr.on('data', () => {});
    child.on('error', () => finish(null));
    child.on('close', () => {
      finish(parseIcmp(buffer.toString('latin1')));
    });
  });
}

/** 测量域名解析耗时 */
async function dnsTime(host: string): Promise<number | null> {
  const started = Date.now();
  try {
    await dns.promises.lookup(host);
    return Date.now() - started;
  } catch (err) {
    return null;
  }
}

/** 发起探测请求并记录响应 */
function httpHead(url: string): Promise<{
  ok: boolean;
  status?: number;
  ttfb?: number;
  size?: number;
  error?: string;
}> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;

    const finish = (value: { ok: boolean; status?: number; ttfb?: number; size?: number; error?: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const request = net.request({ method: 'HEAD', url, redirect: 'follow' });
    request.setHeader('User-Agent', 'ss-uncensor-gui');

    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch (err) {}
      finish({ ok: false, error: '超时' });
    }, HTTP_TIMEOUT);

    request.on('response', (response) => {
      const ttfb = Date.now() - started;
      const status = response.statusCode;
      const size = Number(response.headers['content-length'] || 0);

      response.on('data', () => {});
      response.on('end', () =>
        finish({
          ok: status >= 200 && status < 400,
          status,
          ttfb,
          size
        })
      );
      response.on('error', (err) => finish({ ok: false, error: err.message }));
    });
    request.on('error', (err) => finish({ ok: false, error: err.message }));
    request.end();
  });
}

/** 等待指定毫秒后继续 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 用范围请求探测文件大小 */
function rangeSize(url: string): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const request = net.request({ method: 'GET', url, redirect: 'follow' });
    request.setHeader('User-Agent', 'ss-uncensor-gui');
    request.setHeader('Range', 'bytes=0-0');

    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch (err) {}
      finish(0);
    }, 5000);

    request.on('response', (response) => {
      const total = Number(
        String(response.headers['content-range'] || '')
          .split('/')
          .pop()
      );
      const size = Number.isFinite(total) && total > 0 ? total : Number(response.headers['content-length'] || 0);
      try {
        request.abort();
      } catch (err) {}
      finish(Number.isFinite(size) ? size : 0);
    });
    request.on('error', () => finish(0));
    request.end();
  });
}

/** 测一个区服的延迟与可用性 */
async function probeRegion(
  region: string,
  url: string,
  platform: string,
  shouldStop?: () => boolean
): Promise<Record<string, any> | null> {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch (err) {
      return url;
    }
  })();
  const target = `${url.replace(/\/$/, '')}/meta/${platform}.html`;

  const stopped = (): boolean => Boolean(shouldStop && shouldStop());

  const [icmp, dnsMs, first] = await Promise.all([icmpPing(host), dnsTime(host), httpHead(target)]);
  if (stopped()) return null;

  let http: any = first;
  if (!http.ok && (http.status === 403 || http.status === 429 || (http.status || 0) >= 500)) {
    await delay(900);
    if (stopped()) return null;
    http = await httpHead(target);
    if (!http.ok && http.status) http.note = '可能被限流';
  }

  if (http.ok && !http.size) http.size = await rangeSize(target);
  if (stopped()) return null;

  return {
    region,
    url,
    host,
    platform,
    icmp,
    dns: dnsMs,
    http,
    ok: Boolean(http && http.ok)
  };
}

/** 依次探测各服并汇总结果 */
async function testConnectivity({ platform, regions }: { platform?: string; regions?: string[] } = {}): Promise<
  Record<string, any>
> {
  const urls = serverUrls();
  const wanted = (regions && regions.length ? regions : SERVER_REGIONS).filter((region) => urls[region]);

  const results = [];
  for (const region of wanted) {
    results.push(await probeRegion(region, urls[region], platform));
  }

  return {
    results,
    summary: { total: results.length, ok: results.filter((item) => item.ok).length }
  };
}

module.exports = { serverUrls, parseIcmp, probeRegion, testConnectivity, ICMP_TIMEOUT, HTTP_TIMEOUT };
