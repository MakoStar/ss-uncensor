import { guard } from '../app/api'
import { $, esc, setListLoading, staggerRows } from '../utils/dom'
import { state } from '../app/state'
import { showError } from '../app/dialog'
import { MIN_LOADING_MS } from './browse'
import { toSlash } from '@shared/utils'

/* 载入版本登记页数据 */
export async function loadVersion() {
  const platform = $('version-platform').value || (state.meta && state.meta.platform);
  const file = $('version-path').value.trim();
  const body = $('version-table').querySelector('tbody');
  const card = $('version-card');

  setListLoading(card, true);
  $('version-status').textContent = '读取中…';
  const startedAt = Date.now();

  const result = await guard(() => window.api.version({ platform, file }));

  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_LOADING_MS) await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
  setListLoading(card, false);

  if (!result) {
    $('version-status').textContent = '读取失败';
    return;
  }

  $('version-path').value = toSlash(result.fileRel);

  if (result.error) {
    body.innerHTML = `<tr><td colspan="5" class="dim">${esc(result.error)}</td></tr>`;
    $('version-status').textContent = result.error;
    showError('无法读取版本登记', `${result.error}\n\n当前路径：${toSlash(result.fileRel)}`);
    return;
  }

  const registered = Object.keys(result.regions);
  const fetched = result.fetched || [];
  const names = [...new Set([...registered, ...fetched])];
  const missing = fetched.filter((region) => !registered.includes(region));

  $('version-status').textContent = missing.length
    ? `${result.platform} · ${registered.length} 个区域有版本记录 · ${missing.join(', ')} 无记录`
    : `${result.platform} · ${registered.length} 个区域有版本记录`;

  body.innerHTML = '';
  if (!names.length) {
    body.innerHTML = '<tr><td colspan="5">没有版本登记，先抓取</td></tr>';
    staggerRows(body);
    return;
  }

  for (const region of names) {
    const info = result.regions[region];
    const row = document.createElement('tr');
    row.innerHTML = info
      ? `<td>${esc(region)}</td>
         <td class="mono">${esc(info.client_ver)}</td>
         <td class="mono">${esc(info.game_ver)}</td>
         <td class="mono">${esc(info.patch_num)}</td>
         <td class="mono">${esc(info.version_str)}</td>`
      : `<td>${esc(region)}</td><td class="mono dim" colspan="4">清单已抓取，但没有版本记录</td>`;
    body.appendChild(row);
  }
  staggerRows(body);
}
