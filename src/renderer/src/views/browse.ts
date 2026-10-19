import { guard } from '../app/api'
import { $, esc, optionExists, setListLoading, staggerRows } from '../utils/dom'
import { relPath } from '../utils/format'
import { state } from '../app/state'
import { refreshFetched, renderConfigLine } from './fetch'

let browseSeq = 0;

/* 打开清单浏览弹窗 */
export function openBrowse(platformName, region) {
  const platformSelect = $('browse-platform');
  if (optionExists(platformSelect, platformName)) platformSelect.value = platformName;

  const regionSelect = $('browse-region');
  if (!optionExists(regionSelect, region)) {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    regionSelect.appendChild(option);
  }
  regionSelect.value = region;

  state.view.page = 1;
  document.querySelector('.tab[data-tab="browse"]').click();
}

export const MIN_LOADING_MS = 260;

/* 切换清单浏览的加载态 */
export function setBrowseLoading(on) {
  setListLoading($('browse-card'), on);
  if (on) $('browse-total').textContent = '刷新中…';
}

/* 刷新清单浏览结果 */
export async function refreshBrowse() {
  const seq = ++browseSeq;
  const startedAt = Date.now();
  setBrowseLoading(true);
  const query = {
    platform: $('browse-platform').value,
    region: $('browse-region').value,
    source: $('browse-source').value,
    order: $('browse-order').value,
    dir: $('browse-dir').value,
    query: $('browse-query').value,
    page: state.view.page,
  };

  const result = await guard(() => window.api.listManifest(query));
  if (seq !== browseSeq) return;

  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_LOADING_MS) await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
  setBrowseLoading(false);
  const body = $('browse-table').querySelector('tbody');
  body.innerHTML = '';
  if (!result) return;

  if (result.error) {
    $('browse-total').textContent = result.error;
    return;
  }

  state.view.page = result.page;
  $('browse-total').textContent = `${result.total} 条 · 第 ${result.page}/${result.pages} 页 · ${relPath(result.file)}`;

  result.items.forEach((item, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="mono">${(result.page - 1) * 200 + index + 1}</td>
      <td>${esc(item.file)}</td>
      <td class="mono">${esc(item.version)}</td>
      <td class="mono">${esc(item.hash)}</td>
      <td class="mono">${esc(item.extra)}</td>`;
    body.appendChild(row);
  });
  staggerRows(body);

  $('browse-pager').hidden = result.pages <= 1;
  $('pager-info').textContent = `${result.page} / ${result.pages}`;
  $('btn-prev').disabled = result.page <= 1;
  $('btn-next').disabled = result.page >= result.pages;
}

export let queryTimer = null;
/* 按关键词刷新清单查询 */
export function refreshQuery() {
  clearTimeout(queryTimer);
  state.view.page = 1;
  refreshBrowse();
}

$('btn-browse').addEventListener('click', refreshQuery);

$('browse-query').addEventListener('input', () => {
  clearTimeout(queryTimer);
  queryTimer = setTimeout(refreshQuery, 250);
});

$('browse-query').addEventListener('search', refreshQuery);

$('browse-query').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') refreshQuery();
});

for (const id of ['browse-region', 'browse-source', 'browse-order', 'browse-dir']) {
  $(id).addEventListener('change', () => {
    state.view.page = 1;
    refreshBrowse();
  });
}

$('browse-platform').addEventListener('change', async () => {
  const target = $('browse-platform').value;
  await guard(async () => {
    await refreshFetched(target);
    $('fetch-platform').value = target;
    renderConfigLine();
  });
  state.view.page = 1;
  await refreshBrowse();
});

$('btn-prev').addEventListener('click', () => { state.view.page -= 1; refreshBrowse(); });
$('btn-next').addEventListener('click', () => { state.view.page += 1; refreshBrowse(); });

$('btn-open-dir').addEventListener('click', () => {
  window.api.openDir(`${state.meta.dirs.manifest}/${$('browse-region').value}`);
});
