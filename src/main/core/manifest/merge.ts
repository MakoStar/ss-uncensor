const { KEY, getMeta, bundleName } = require('./parse');

const VERSION_KEYS = [KEY.clientVer, KEY.gameVer];
const VERSION_PARTS = 3;

/** 解析版本号并比较大小 */
function versionCompare(v1: string, v2: string, num: number): number {
  const leftParts = String(v1 || '').split('.');
  const rightParts = String(v2 || '').split('.');
  let i = 0;
  for (;;) {
    if (i + 1 > leftParts.length || i + 1 > rightParts.length) break;
    const leftNumber = parseInt(leftParts[i], 10);
    const rightNumber = parseInt(rightParts[i], 10);
    const left = Number.isNaN(leftNumber) ? 0 : leftNumber;
    const right = Number.isNaN(rightNumber) ? 0 : rightNumber;
    if (left > right) return 1;
    if (left < right) return -1;
    i += 1;
    if (i >= num) return 0;
  }
  if (leftParts.length === rightParts.length) return 0;
  return leftParts.length < rightParts.length ? -1 : 1;
}

/** 把较高版本合并进映射 */
function mergeVersions(
  target: Map<string, string>,
  other: { meta: { key: string; value: string }[] }
): Map<string, string> {
  const res = getMeta(other, KEY.resVer, '');
  if (res && res > (target.get(KEY.resVer) || '')) target.set(KEY.resVer, res);

  for (const key of VERSION_KEYS) {
    const value = getMeta(other, key, '');
    if (!value) continue;
    if (versionCompare(target.get(key) || '0.0.0', value, VERSION_PARTS) === -1) {
      target.set(key, value);
    }
  }

  const mode = getMeta(other, KEY.compMode, '0');
  if (mode !== '0') target.set(KEY.compMode, mode);
  return target;
}

/** 按模式合并资源行 */
function mergeBundles(
  base: string[],
  patches: { mani: { meta: { key: string; value: string }[]; bundles: string[] } }[],
  mode: string = 'snapshot'
): string[] {
  if (patches.length === 0) return base.slice();
  if (mode === 'snapshot') return patches[patches.length - 1].mani.bundles.slice();

  const list = base.slice();
  const index = new Map();
  list.forEach((line, i) => index.set(bundleName(line), i));

  for (const patch of patches) {
    for (const line of patch.mani.bundles) {
      const name = bundleName(line);
      if (index.has(name)) list[index.get(name)] = line;
      else {
        index.set(name, list.length);
        list.push(line);
      }
    }
  }

  if (mode === 'filter') {
    const keep = new Set(patches[patches.length - 1].mani.bundles.map((line) => bundleName(line)));
    return list.filter((line) => keep.has(bundleName(line)));
  }
  return list;
}

module.exports = { versionCompare, mergeVersions, mergeBundles, VERSION_PARTS };
