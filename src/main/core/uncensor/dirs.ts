const path = require('path');

/** 解析反和谐目录位置 */
function resolveUncensorDirs({
  official = false,
  custom = false,
  region,
  platform,
  base = '',
  target = '',
  resourceRoot,
  uncensorDefault
}: {
  official?: boolean;
  custom?: boolean;
  region?: string;
  platform?: string;
  base?: string;
  target?: string;
  resourceRoot: string;
  uncensorDefault: string;
}): { pairName: string; dir: string; produced: string } {
  const pairName = custom ? 'Custom' : base && target ? `${base}2${target}` : region;

  const produced = path.resolve(resourceRoot, region, platform);
  const dir = official
    ? path.resolve(uncensorDefault, String(platform || ''))
    : path.resolve(resourceRoot, pairName, ...(custom ? [region] : []), platform);
  return { pairName, dir, produced };
}

module.exports = { resolveUncensorDirs };
