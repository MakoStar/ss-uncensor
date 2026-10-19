'use strict';

const { KEY, getMeta, bundleName } = require('./parse');

const VERSION_KEYS = [KEY.clientVer, KEY.gameVer];
const VERSION_PARTS = 3;

/* 按分段比较两个版本号大小 */
function versionCompare(v1, v2, num) {
  const a = String(v1 || '').split('.');
  const b = String(v2 || '').split('.');
  let i = 0;
  for (;;) {
    if (i + 1 > a.length || i + 1 > b.length) break;
    const x = parseInt(a[i], 10);
    const y = parseInt(b[i], 10);
    const left = Number.isNaN(x) ? 0 : x;
    const right = Number.isNaN(y) ? 0 : y;
    if (left > right) return 1;
    if (left < right) return -1;
    i += 1;
    if (i >= num) return 0;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

/* 合并两份版本登记 */
function mergeVersions(target, other) {
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

/* 把补丁链里的资源条目合并进基准清单 */
function mergeBundles(base, patches, mode = 'snapshot') {
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
    const keep = new Set(
      patches[patches.length - 1].mani.bundles.map((line) => bundleName(line))
    );
    return list.filter((line) => keep.has(bundleName(line)));
  }
  return list;
}

module.exports = { versionCompare, mergeVersions, mergeBundles, VERSION_PARTS };
