const TARGETS = {
  persistent: { key: 'persistent', short: 'PS', label: 'Persistent_Store', rel: 'Persistent_Store/AssetBundles' },
  patch: { key: 'patch', short: 'PT', label: 'Patch_Store', rel: 'Patch_Store/AssetBundles' },
  install: { key: 'install', short: 'IR', label: 'InstallResource', rel: 'xtlr_Data/StreamingAssets/InstallResource' }
};

const TARGET_KEYS = Object.keys(TARGETS);

const BACKUP_PREFIX_RE = /^(PS|PT|IR)(_|\.)/i;

/** 返回各目标短名映射 */
function shortNames(): Record<string, string> {
  return Object.fromEntries(TARGET_KEYS.map((key) => [key, TARGETS[key].short]));
}

/** 返回各目标显示名映射 */
function labels(): Record<string, string> {
  return Object.fromEntries(TARGET_KEYS.map((key) => [key, TARGETS[key].label]));
}

/** 判断是否合法目标 */
function isTarget(value: unknown): boolean {
  return TARGET_KEYS.includes(String(value || ''));
}

/** 识别目录所属渠道 */
function channelOf(dir: unknown): 'official' | 'bili' | 'unknown' {
  const raw = String(dir || '');
  const parts = raw.split(/[\\/]/).filter(Boolean);
  const base = (parts[parts.length - 1] || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (base === 'stellasoracn' || /stellasora_cn/i.test(raw)) return 'official';
  if (base === 'stellasoragame' || /stellasora\s*game/i.test(raw) || /bilibili/i.test(raw.toLowerCase())) return 'bili';
  return 'unknown';
}

/** 按渠道给出启动器名 */
function launcherNameOf(dir: unknown): string {
  return channelOf(dir) === 'bili' ? '哔哩启动器' : '星塔启动器';
}

const BACKUP_CHANNEL_DIRS = { official: 'official', bili: 'bilibili', unknown: 'other' };

/** 渠道映射到备份目录名 */
function backupDirName(channel: unknown): string {
  return BACKUP_CHANNEL_DIRS[String(channel || '')] || BACKUP_CHANNEL_DIRS.unknown;
}

module.exports = {
  TARGETS,
  TARGET_KEYS,
  BACKUP_PREFIX_RE,
  shortNames,
  labels,
  isTarget,
  channelOf,
  launcherNameOf,
  BACKUP_CHANNEL_DIRS,
  backupDirName
};
