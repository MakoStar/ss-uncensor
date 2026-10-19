'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../log/log');
const { PLATFORMS, platformOf, versionFileName } = require('../config');
const { availableRegions } = require('../manifest/pipeline');
const { DIRS, FETCHER, patchDir, versionFile, resourcePath, relative, platform } = require('../config/paths');

const STRAY_CONFIG = 'ss-resource-fetcher.toml';

/* 检查运行环境依赖并输出结论 */
function doctor() {
  log.head('DOCTOR');
  log.step(`cwd       ${relative(process.cwd())}`);
  log.step(`root      ${relative(DIRS.root)}`);
  log.step(`node      ${process.version}`);
  log.step(`platform  ${platform()}`);
  log.step(`fetcher   ${FETCHER ? relative(FETCHER) : 'missing'}`);
  log.step(`manifest  ${relative(DIRS.manifest)}/<区域>`);
  log.step(`metadata  ${relative(DIRS.metadata)}/<区域>/${platform()}`);
  log.step(`resource  ${relative(resourcePath('CN')).replace(/CN/, '<区域>')}`);
  log.step(`generated ${relative(DIRS.generatedMani)}`);
  log.step(`diff ${relative(DIRS.generatedDiff)}`);

  const regions = availableRegions();
  log.info(`regions   ${regions.length > 0 ? regions.join(', ') : '(none yet)'}`);

  if (!FETCHER) {
    log.fail('fetcher missing, place it in ResourceTool/ or set RESOURCE_FETCHER');
    return 1;
  }

  const stray = path.join(process.cwd(), STRAY_CONFIG);
  if (fs.existsSync(stray)) {
    log.warn(`${STRAY_CONFIG} present, the fetcher loads it before -s; remove it if you did not write it by hand`);
  }

  if (regions.length === 0) {
    log.warn('no region fetched yet, 先在界面「抓取清单」页抓一次');
  }

  const base = platformOf(platform()).base;
  for (const region of regions) {
    const dir = patchDir(region);
    const done = fs.existsSync(path.join(dir, base));
    log[done ? 'succ' : 'warn'](`${region} manifest ${done ? 'present' : 'missing'}  ${relative(dir)}`);
  }

  const version = versionFile();
  const has = fs.existsSync(version);
  log[has ? 'succ' : 'warn'](`version ${has ? 'present' : 'missing'}  ${relative(version)}`);
  if (has) {
    const keys = Object.keys(JSON.parse(fs.readFileSync(version, 'utf8')));
    log.info(`versioned ${keys.join(', ')}`);
  }

  log.info(`platforms ${Object.keys(PLATFORMS).join('/')}  version file ${versionFileName(platform())}`);
  return 0;
}

module.exports = { doctor };
