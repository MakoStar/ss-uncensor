import './styles/index.css'
import './app/mount'
import './app/shell'

import './views/launcher'
import './views/backup'
import './views/replace'
import './views/remove'
import './views/fetch'
import './views/browse'
import './views/uncensor'
import './views/diff'
import './views/version'
import './views/resources'
import './views/settings'

import { $, fillSelect, wrapSelects } from './utils/dom'
import { cleanError, say } from './utils/format'
import { logLine } from './utils/log'
import { toast } from './utils/toast'
import { state } from './app/state'
import { applyFetcherState, renderConfigLine, renderRegionChips, renderSummary } from './views/fetch'
import { checkFetcherUpdate, renderSettings } from './views/settings'
import { loadDiffLists } from './views/uncensor'
import { toSlash } from '@shared/utils'

/* 首屏：拉元信息，把各面板填上初始数据 */
async function init() {
  const meta = await window.api.meta();
  state.meta = meta;
  state.settings = { ...meta.config };
  state.picked = new Set((meta.config as any).regions || []);

  for (const select of ['fetch-platform', 'browse-platform', 'set-platform', 'version-platform', 'diff-platform']) {
    fillSelect($(select), meta.platforms, meta.config.platform);
  }
  $('version-path').value = toSlash(meta.versionFile);
  fillSelect($('custom-region'), meta.regions, 'TW');
  fillSelect($('custom-platform'), meta.platforms, meta.config.platform);
  fillSelect($('browse-region'), meta.fetched.length ? meta.fetched : meta.regions, meta.fetched[0]);
  fillSelect($('diff-base'), meta.regions, meta.regions[0]);
  fillSelect($('diff-target'), meta.regions, meta.regions[meta.regions.length - 1]);

  const step = (label, action) => {
    try {
      action();
    } catch (err) {
      say('ERRO', `${label} 失败：${cleanError(err.message)}`);
    }
  };

  step('下拉样式', () => wrapSelects());
  loadDiffLists();
  step('区域按钮', () => renderRegionChips(meta));
  step('抓取结果', () => renderSummary(meta));
  step('设置页', () => renderSettings());
  step('配置摘要', () => renderConfigLine());
  step('抓取器状态', () => applyFetcherState(meta, { prompt: true }));

  checkFetcherUpdate({ silent: true }).then((info) => {
    if (info && info.updateAvailable) {
      toast({ key: 'fetcher', kind: 'warn', title: '抓取器可更新', text: `${info.local} → ${info.latest}`, timeout: 5000 });
    }
  });
  window.api.onRunLog(({ line, stream }) => logLine(line, stream === 'err' ? 'err' : 'out'));
}

void init();
