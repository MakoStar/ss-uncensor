'use strict';

const SYMBOL = {
  meta: '$',
  comment: '#',
  external: '@',
};

const SEPARATOR = ':';

const KEY = {
  resVer: '$RES_VER',
  clientVer: '$CLIENT_VER',
  compMode: '$CLIENT_VER_COMP_MODE',
  gameVer: '$GAME_VER',
  clearExpired: '$CLEAR_EXPIRED_FILES',
  patchVer: '$BIN_DIFF_PATCH_VER',
  patchInfo: '$BIN_DIFF_PATCH_INFO',
  patchFile: '$BIN_DIFF_PATCH_FILE',
};

const HEADER_ORDER = [
  KEY.resVer,
  KEY.clientVer,
  KEY.compMode,
  KEY.gameVer,
  KEY.clearExpired,
];

/* 解析清单文本成结构化数据 */
function parseManifest(text) {
  const raw = Buffer.isBuffer(text) ? text.toString('utf8') : String(text);
  const lines = raw.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const meta = [];
  const bundles = [];
  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith(SYMBOL.comment)) continue;
    if (line.startsWith(SYMBOL.meta)) {
      const at = line.indexOf(SEPARATOR);
      meta.push(
        at === -1
          ? { key: line, value: '' }
          : { key: line.slice(0, at), value: line.slice(at + 1) }
      );
    } else {
      bundles.push(line);
    }
  }
  return { meta, bundles };
}

/* 把结构化清单序列化回文本 */
function serializeManifest(lines) {
  let out = '';
  for (const line of lines) out += line.endsWith('\n') ? line : line + '\n';
  return out;
}

/* 读取清单里的元数据项 */
function getMeta(manifest, key, fallback = '') {
  for (const item of manifest.meta) {
    if (item.key === key) return item.value;
  }
  return fallback;
}

/* 读取清单里同名元数据的全部值 */
function metaValues(manifest, key) {
  const out = [];
  for (const item of manifest.meta) {
    if (item.key === key) out.push(item.value);
  }
  return out;
}

/* 从清单行里取出资源文件名 */
function bundleName(line) {
  const at = line.indexOf('|');
  return at === -1 ? line : line.slice(0, at);
}

/* 从清单行里取出资源大小 */
function bundleSize(line) {
  const n = Number(line.split('|')[2]);
  return Number.isFinite(n) ? n : 0;
}

module.exports = {
  SYMBOL,
  SEPARATOR,
  KEY,
  HEADER_ORDER,
  parseManifest,
  serializeManifest,
  getMeta,
  metaValues,
  bundleName,
  bundleSize,
};
