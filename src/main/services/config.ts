'use strict';

const settings = require('../../core/config/settings');
const { applyOutputRoot, applyFetcher, setPlatform } = require('../../core/config/paths');

let config = settings.save(settings.load());

/* 套用新配置到内存并同步输出目录抓取器与平台 */
function applyConfig(next) {
  config = next;
  applyOutputRoot(config.outputRoot);
  applyFetcher(config.fetcher);
  setPlatform(config.platform);
  return config;
}

applyConfig(config);

module.exports = { current: () => config, update: applyConfig };
