const crypto = require('crypto');

const BASE_URL = 'https://launcher-api.yostar.net';
const CONFIG_PATH = '/api/launcher/base/config';
const GAME_ID = 'StellaSora_CN';
const VERSION = '1.3.0';
const SALT = '872550AD59A235662C5B7D5F88CEBE4B';

const CONFIG_URL = BASE_URL + CONFIG_PATH;

const TIMEOUT = 12000;

/** 带超时发起请求 */
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeout: number = TIMEOUT): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
}

/** 生成带签名的鉴权头 */
function getAuthHeader({
  data = '',
  gameId = GAME_ID,
  version = VERSION,
  salt = SALT
}: {
  data?: string;
  gameId?: string;
  version?: string;
  salt?: string;
}): string {
  const head = { game_tag: gameId, time: Math.floor(Date.now() / 1000), version };
  const sign = crypto
    .createHash('md5')
    .update(`${JSON.stringify(head)}${data}${salt}`)
    .digest('hex');
  return JSON.stringify({ head, sign });
}

/** 组装配置接口请求信息 */
function requestInfoOf(
  { gameId = GAME_ID, version = VERSION }: { gameId?: string; version?: string } = {},
  at: number = Date.now()
): {
  method: string;
  url: string;
  baseUrl: string;
  apiPath: string;
  timeout: number;
  head: { game_tag: string; time: number; version: string };
  sign: string;
  authorization: string;
} {
  const head = { game_tag: gameId, time: Math.floor(at / 1000), version };
  const sign = crypto
    .createHash('md5')
    .update(`${JSON.stringify(head)}${SALT}`)
    .digest('hex');
  return {
    method: 'GET',
    url: CONFIG_URL,
    baseUrl: BASE_URL,
    apiPath: CONFIG_PATH,
    timeout: TIMEOUT,
    head,
    sign,
    authorization: JSON.stringify({ head, sign })
  };
}

/** 拉取启动器配置并整理 */
async function requestConfigRaw({
  gameId = GAME_ID,
  version = VERSION,
  timeout = TIMEOUT
}: { gameId?: string; version?: string; timeout?: number } = {}): Promise<{
  ok: boolean;
  request: ReturnType<typeof requestInfoOf>;
  response: {
    httpStatus: number;
    code: any;
    message: any;
    dataKeys: string[];
    backgroundImg?: string;
    crc64?: string;
    extra?: Record<string, any>;
  };
  error: string;
}> {
  const request = requestInfoOf({ gameId, version });
  let res;
  try {
    res = await fetchWithTimeout(
      CONFIG_URL,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Authorization: request.authorization
        }
      },
      timeout
    );
  } catch (err: any) {
    const cause = err?.cause;
    const code = cause?.code || cause?.message || (err?.name === 'TimeoutError' ? 'TIMEOUT' : '');
    return {
      ok: false,
      request,
      response: {
        httpStatus: 0,
        code: '',
        message: `请求失败：${err.message}${code ? `（${code}）` : ''}`,
        dataKeys: []
      },
      error:
        `请求失败：${err.message}${code ? `（${code}）` : ''}\n` +
        `  API 地址：${CONFIG_URL}\n` +
        `  基础域名：${BASE_URL}\n` +
        `  接口路径：${CONFIG_PATH}\n` +
        `  game_id：${gameId}  client_version：${version}`
    };
  }

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      request,
      response: { httpStatus: res.status, code: '', message: '返回非 JSON', dataKeys: [] },
      error: `配置接口返回非 JSON（可能接口地址错误或被拦截），前 80 字符：${text.slice(0, 80)}\n  API 地址：${CONFIG_URL}`
    };
  }

  const data = json.data ?? {};
  return {
    ok: res.ok && json.code === 200,
    request,
    response: {
      httpStatus: res.status,
      code: json.code,
      message: json.message ?? json.msg ?? '',
      dataKeys: Object.keys(data),
      backgroundImg: data.launcher_background_img ?? '',
      crc64: String(data.launcher_background_img_crc64 ?? ''),
      extra: Object.fromEntries(
        Object.entries(data)
          .filter(([key]) => key !== 'launcher_background_img' && key !== 'launcher_background_img_crc64')
          .map(([key, value]) => {
            const serialized = JSON.stringify(value) ?? '';
            return [key, serialized.length > 60 ? `${serialized.slice(0, 60)}…` : value];
          })
      )
    },
    error:
      res.ok && json.code === 200
        ? ''
        : `config api error: HTTP ${res.status} code=${json.code} message=${json.message ?? json.msg ?? ''}\n  API 地址：${CONFIG_URL}`
  };
}

/** 取背景图地址与校验值 */
async function requestClientInfo(): Promise<{ url: string; crc64: string }> {
  const raw = await requestConfigRaw();
  if (!raw.ok) throw new Error(raw.error);
  return {
    url: raw.response.backgroundImg,
    crc64: raw.response.crc64
  };
}

/** 下载背景图转成数据串 */
async function requestImageBase64(imgUrl: string): Promise<{ base64: string; type: string }> {
  if (!imgUrl) return { base64: '', type: '' };
  let res;
  try {
    res = await fetchWithTimeout(imgUrl);
  } catch (err: any) {
    const cause = err?.cause;
    const code = cause?.code || cause?.message || (err?.name === 'TimeoutError' ? 'TIMEOUT' : '');
    throw new Error(`背景图下载请求失败：${err.message}${code ? `（${code}）` : ''}\n` + `  图片地址：${imgUrl}`);
  }
  if (!res.ok) throw new Error(`download image failed: HTTP ${res.status}\n  图片地址：${imgUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') ?? 'image/png';
  return { base64: `data:${type};base64,${buffer.toString('base64')}`, type };
}

module.exports = {
  BASE_URL,
  CONFIG_PATH,
  CONFIG_URL,
  GAME_ID,
  VERSION,
  SALT,
  TIMEOUT,
  fetchWithTimeout,
  getAuthHeader,
  requestInfoOf,
  requestConfigRaw,
  requestClientInfo,
  requestImageBase64
};
