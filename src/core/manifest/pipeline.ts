'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { runDiff } = require('./diff');
const { genPath, relative } = require('../config/paths');
const { REGIONS } = require('../config');
const { buildRegion, knownRegions: patchRegions } = require('./build');
const { fetchRegions } = require('../network/fetcher');

const DEFAULT_REGIONS = REGIONS;

/* 批量构建多个区域的清单 */
function buildAll(regions, options: any ={}) {
  log.head(`BUILD SYNTHESIZED MANIFESTS ${regions.join(', ')}`);
  const built = [];
  for (const region of regions) {
    try {
      built.push(buildRegion(region, options));
    } catch (err) {
      log.fail(`${region} build failed: ${err.message}`);
      if (!options.keepGoing) throw err;
    }
  }
  return built;
}

/* 跑完整流水线并返回汇总结果 */
function runPipeline(options: any ={}) {
  const regions = options.regions && options.regions.length > 0 ? options.regions : DEFAULT_REGIONS;
  const mode = options.mode || 'snapshot';
  const baseRegion = options.baseRegion || regions[0];
  const targetRegion = options.targetRegion || regions[regions.length - 1];

  if (options.skipFetch) {
    log.tips('fetch skipped, reuse the existing patches');
  } else {

    const results = fetchRegions(options.regions && options.regions.length ? options.regions : null, options);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      throw new Error(`fetch incomplete: ${failed.map((r) => r.region).join(', ')}`);
    }
    if (options.dryRun) {
      log.tips('dry-run, downstream steps skipped');
      return { ok: true, skipped: true, results };
    }
  }

  const built = buildAll(regions, { mode });
  if (built.length === 0) throw new Error('no region built');

  const required = [baseRegion, targetRegion].filter((r) => regions.includes(r));
  for (const region of required) {
    const file = genPath(region);
    if (!fs.existsSync(file)) throw new Error(`missing generated manifest: ${relative(file)}`);
  }

  const { report, outFile, listFile } = runDiff({
    baseRegion,
    targetRegion,
    ext: options.ext,
    out: options.out,
    name: options.name,
    region: options.list === false ? undefined : targetRegion,
    listName: options.listName,
  });

  return { ok: true, built, report, outFile, listFile };
}

/* 列出可参与流水线的区域 */
function availableRegions() {
  return patchRegions();
}

module.exports = { runPipeline, buildAll, availableRegions, DEFAULT_REGIONS };
