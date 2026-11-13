const SYMBOL = {
  meta: '$',
  comment: '#',
  external: '@'
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
  patchFile: '$BIN_DIFF_PATCH_FILE'
};

const HEADER_ORDER = [KEY.resVer, KEY.clientVer, KEY.compMode, KEY.gameVer, KEY.clearExpired];

/** 解析清单文本为元数据与资源 */
function parseManifest(text: string | Buffer): { meta: { key: string; value: string }[]; bundles: string[] } {
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
      meta.push(at === -1 ? { key: line, value: '' } : { key: line.slice(0, at), value: line.slice(at + 1) });
    } else {
      bundles.push(line);
    }
  }
  return { meta, bundles };
}

/** 把文本行拼成清单文本 */
function serializeManifest(lines: string[]): string {
  let out = '';
  for (const line of lines) out += line.endsWith('\n') ? line : line + '\n';
  return out;
}

/** 读取指定元数据值 */
function getMeta(manifest: { meta: { key: string; value: string }[] }, key: string, fallback: string = ''): string {
  for (const item of manifest.meta) {
    if (item.key === key) return item.value;
  }
  return fallback;
}

/** 读取同名元数据的全部值 */
function metaValues(manifest: { meta: { key: string; value: string }[] }, key: string): string[] {
  const out = [];
  for (const item of manifest.meta) {
    if (item.key === key) out.push(item.value);
  }
  return out;
}

/** 取出资源行里的文件名 */
function bundleName(line: string): string {
  const at = line.indexOf('|');
  return at === -1 ? line : line.slice(0, at);
}

/** 取出资源行里的体积 */
function bundleSize(line: string): number {
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
  bundleSize
};
