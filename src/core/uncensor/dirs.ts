'use strict';

const path = require('path');

/* 按名单自定义与官方三种模式解析资源输出目录 */
function resolveUncensorDirs({
  official = false,
  custom = false,
  region,
  platform,
  base = '',
  target = '',
  resourceRoot,
  uncensorDefault,
}: any = {}) {
  const pairName = custom ? 'Custom' : (base && target ? `${base}2${target}` : region);

  const produced = path.resolve(resourceRoot, region, platform);
  const dir = official
    ? path.resolve(uncensorDefault)
    : path.resolve(resourceRoot, pairName, ...(custom ? [region] : []), platform);

  return { pairName, dir, produced };
}

module.exports = { resolveUncensorDirs };
