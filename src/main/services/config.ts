const fs = require('fs');
const path = require('path');
const settings = require('../core/config/settings');
const { applyOutputRoot, applyFetcher, setPlatform } = require('../core/config/paths');

let config = settings.save(settings.load());

/** 应用新配置并同步到各模块 */
function apply(next: Record<string, any>): Record<string, any> {
  config = next;
  applyOutputRoot(config.outputRoot);
  applyFetcher(config.fetcher);
  setPlatform(config.platform);
  return config;
}

/** 读取配置文件原始文本 */
function rawOf(): string {
  try {
    return fs.readFileSync(settings.filePath(), 'utf8');
  } catch (err) {
    return '';
  }
}

apply(config);
let lastRaw = rawOf();

/** 保存并应用新的配置对象 */
function update(next: Record<string, any>): Record<string, any> {
  const applied = apply(next);
  lastRaw = rawOf();
  return applied;
}

/** 配置文件变动后重新加载 */
function reload(): boolean {
  const raw = rawOf();
  if (!raw || raw === lastRaw) return false;
  lastRaw = raw;
  apply(settings.load());
  return true;
}

/** 监听配置文件变化并回调 */
function watch(onChange?: (config: Record<string, any>) => void): () => void {
  const file = settings.filePath();
  const dir = path.dirname(file);
  const name = path.basename(file);
  let timer = null;
  try {
    const watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
      if (filename && path.basename(String(filename)) !== name) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (reload() && typeof onChange === 'function') onChange(config);
      }, 120);
    });
    watcher.on('error', () => {});
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  } catch (err) {
    return () => {};
  }
}

module.exports = { current: (): Record<string, any> => config, update, reload, watch };
