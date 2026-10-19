'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { serializeManifest } = require('./parse');
const { buildManifest, discoverSources } = require('./build');
const { patchDir, refPath, relative } = require('../config/paths');

/* 校验单个区域清单的完整性 */
function check(region, options: any ={}) {
  const sources = discoverSources(patchDir(region), options);
  const mode = typeof options.mode === 'string' ? options.mode : 'snapshot';
  const text = serializeManifest(buildManifest({ ...sources, mode }));

  const ref = options.reference ? path.resolve(options.reference) : refPath(region);
  if (!fs.existsSync(ref)) throw new Error(`reference not found: ${ref}`);

  const target = fs.readFileSync(ref);
  const same = Buffer.from(text, 'utf8').equals(target);
  const built = Buffer.byteLength(text, 'utf8');

  log.step(`${region}  reference ${relative(ref)}  mode ${mode}`);
  if (same) {
    log.succ(`identical  ${built} / ${target.length} bytes`);
    return true;
  }

  log.fail(`differs  built ${built} bytes / reference ${target.length} bytes`);
  const a = text.split('\n');
  const b = target.toString('utf8').split('\n');
  const at = a.findIndex((line, i) => line !== b[i]);
  log.erro(`first diverging line ${at === -1 ? '(length differs)' : at}`);
  if (at !== -1) {
    log.raw('INFO', `built     ${a[at]}`);
    log.raw('INFO', `reference ${b[at]}`);
  }
  return false;
}

/* 批量校验多个区域的清单 */
function checkAll(regions, options = {}) {
  let ok = true;
  for (const region of regions) ok = check(region, options) && ok;
  return ok;
}

module.exports = { check, checkAll };
