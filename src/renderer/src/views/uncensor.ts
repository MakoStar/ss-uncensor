import { guard } from '../app/api'
import { $, esc, fillSelect } from '../utils/dom'
import { basename, relPath, say } from '../utils/format'
import { state } from '../app/state'
import { toast } from '../utils/toast'
import { applyFetcherState, refreshFetched } from './fetch'
import { runZipWithProgress } from './resources'
import { fmtBytes } from '@shared/utils'

export let diffLists = [];
export const customList = { region: 'TW', platform: 'win', base: 'CN', target: 'TW', files: [], query: '', saved: false };

/* 载入可选差异名单 */
export async function loadDiffLists() {
  const result = await guard(() => window.api.diffLists({ platform: $('fetch-platform').value }));
  if (!result) return;

  diffLists = result.lists;
  const select = $('uncensor-list');
  fillSelect(
    select,
    diffLists.map((item) => `${item.name}｜${item.region || '?'} · ${item.count} 项`),
    diffLists[0] ? `${diffLists[0].name}｜${diffLists[0].region || '?'} · ${diffLists[0].count} 项` : null,
  );
  if (!diffLists.length) {
    select.innerHTML = '<option>（还没有 diff_files.json）</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
  }
}

/* 返回自定义名单模板 */
export function customTemplate() {
  return { region: 'TW', platform: state.meta ? state.meta.platform : 'win', base: 'CN', target: 'TW', files: [] };
}

/* 渲染自定义名单 */
export function renderCustomList() {
  const box = $('custom-list');
  box.innerHTML = '';

  const query = customList.query.trim().toLowerCase();
  const rows = customList.files
    .map((file, index) => ({ file, index }))
    .filter((row) => !query || row.file.toLowerCase().includes(query));
  $('custom-count').textContent = `${customList.files.length} 项${query ? ` · 过滤出 ${rows.length}` : ''}`;

  const head = document.createElement('div');
  head.className = 'list-head';
  head.innerHTML = '<span class="idx">#</span><span>文件名</span><span class="op">操作</span>';
  box.appendChild(head);

  if (!rows.length) {
    const none = document.createElement('div');
    none.className = 'rule-empty';
    none.style.padding = '10px';
    none.textContent = customList.files.length ? '没有匹配的文件' : '还没有文件，点「+ 新增一行」或「载入当前选择」';
    box.appendChild(none);
    return;
  }

  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'edit-row';
    line.innerHTML = `
      <span class="idx">${row.index + 1}</span>
      <input type="text" class="path-input mono" value="${esc(row.file)}" />
      <button class="btn ghost tiny">删除</button>`;

    const input = line.querySelector('input');
    input.addEventListener('change', () => { customList.files[row.index] = input.value.trim(); });
    line.querySelector('button').addEventListener('click', () => {
      customList.files.splice(row.index, 1);
      renderCustomList();
    });
    box.appendChild(line);
  }
}

/* 打开自定义名单弹窗 */
export function openCustomDialog() {
  if (!customList.files.length && !customList.saved) Object.assign(customList, customTemplate());
  fillSelect($('custom-region'), state.meta.regions, customList.region);
  fillSelect($('custom-platform'), state.meta.platforms, customList.platform);
  $('custom-search').value = '';
  customList.query = '';
  $('custom-error').hidden = true;
  renderCustomList();
  $('custom-modal').hidden = false;
}

/* 从当前选择生成自定义名单 */
export async function loadCustomFromSelection() {
  const index = $('uncensor-list').selectedIndex;
  const item = diffLists[index];
  if (!item) {
    toast({ key: 'custom', kind: 'warn', title: '没有可载入的名单', text: '先在「区域差异」里生成结果', timeout: 3000 });
    return;
  }

  let files = [];
  if (item.count > 0) {
    const result = await guard(() => window.api.readJson({ file: item.file }));
    if (result && result.text) {
      try {
        const data = JSON.parse(result.text);
        files = Array.isArray(data.files) ? data.files : [];
        customList.region = data.region || item.region;
        customList.platform = data.platform || item.platform;
      } catch (err) {
        files = [];
      }
    }
  }

  const pair = item.name.match(/^([A-Za-z0-9]+)2([A-Za-z0-9]+)_gen_/i);
  if (pair) {
    customList.base = pair[1].toUpperCase();
    customList.target = pair[2].toUpperCase();
  }

  customList.files = files;
  customList.region = item.region || customList.region;
  customList.platform = item.platform || customList.platform;
  $('custom-region').value = customList.region;
  $('custom-platform').value = customList.platform;
  renderCustomList();
}

export let downloadDone = null;

/* 展示下载完成结果 */
export function showDownloadDone(result: any, meta: any = {}) {
  downloadDone = {
    dir: result.dir,
    official: Boolean(result.official),
    platform: result.platform || meta.platform || (state.meta && state.meta.platform) || '',
    custom: Boolean(result.custom),
    region: result.region || '',
    base: result.official ? 'CN' : (meta.base || ''),
    target: result.official ? 'default' : (meta.target || ''),
  };

  $('dl-done-file').textContent = relPath(result.dir);
  const rows = [
    ['标签', result.official ? '官方默认包' : (result.pair || result.region)],
    ['区域', result.official ? '官方' : result.region],
    ['平台', downloadDone.platform],
    ['文件数', result.files],
    ['占用空间', fmtBytes(result.bytes)],
  ];
  $('dl-done-kv').innerHTML = rows
    .map(([key, value]) => `<div class="kv-tile"><b>${esc(key)}</b><span>${esc(String(value))}</span></div>`)
    .join('');

  $('dl-done-error').hidden = true;
  $('btn-dl-zip').disabled = false;
  $('btn-dl-zip').textContent = '打包压缩';
  $('dl-modal').hidden = false;
}

$('btn-dl-close').addEventListener('click', () => { $('dl-modal').hidden = true; });
$('dl-modal').addEventListener('click', (event) => {
  if (event.target === $('dl-modal')) $('dl-modal').hidden = true;
});

$('btn-dl-open').addEventListener('click', () => {
  if (downloadDone) window.api.openDir(downloadDone.dir);
});

$('btn-dl-zip').addEventListener('click', async () => {
  if (!downloadDone) return;
  const button = $('btn-dl-zip');
  button.disabled = true;
  button.textContent = '打包中…';

  const result = await runZipWithProgress(downloadDone);

  button.disabled = false;
  button.textContent = '打包压缩';
  if (!result) return;
  if (!result.ok) {
    $('dl-done-error').hidden = false;
    $('dl-done-error').textContent = result.error || '打包失败';
    return;
  }

  $('dl-done-error').hidden = true;
  say('SUCC', `已打包 ${basename(result.file)} · ${fmtBytes(result.bytes)} · 用时 ${result.seconds || 0}s`);
  toast({
    key: 'zip',
    kind: 'ok',
    title: '打包完成',
    text: `${basename(result.file)} · ${fmtBytes(result.bytes)} · ${result.seconds || 0}s`,
    timeout: 5000,
  });
});

/* 执行反和谐下载并展示结果 */
export async function runDownload(payload, label) {
  const button = $('btn-uncensor');
  button.hidden = true;
  $('btn-abort-uncensor').hidden = false;
  say('TIPS', `${label} 开始`);

  const current = {
    dir: $('uncensor-dir').value.trim(),
    timeout: Number($('uncensor-timeout').value) || 900,
    retries: Number($('uncensor-retries').value) || 3,
  };

  await guard(() => window.api.saveSettings({
    ...(state.settings || {}),
    uncensor: { ...((state.settings && state.settings.uncensor) || {}), ...current },
  }));

  const result = await guard(() => window.api.uncensor({
    platform: $('fetch-platform').value,
    uncensor: current,
    ...payload,
  }));

  state.settings = { ...(state.settings || {}), uncensor: { ...((state.settings && state.settings.uncensor) || {}), ...current } };

  $('btn-abort-uncensor').hidden = true;
  button.hidden = false;

  if (result && result.needFetcher) {
    say('WARN', '未找到 ResourceFetcher，请先下载或更新');
    await refreshFetched($('fetch-platform').value);
    applyFetcherState(state.meta, { reason: '资源下载时发现抓取器不可用' });
    $('fetcher-modal').hidden = false;
    return;
  }
  if (result && result.aborted) {
    say('WARN', `已中断 · ${result.official ? '官方' : String(result.region)} · ${result.files} 个文件已在 ${relPath(result.dir)}`);
  } else if (result && result.ok) {
    say('SUCC', `下载完成 · ${result.official ? '官方' : String(result.region)} · ${result.files} 个文件 · ${relPath(result.dir)}`);
    showDownloadDone(result, payload.meta || {});
  } else if (result) {
    say('ERRO', `下载失败 · ${result.error || result.region || ''}`);
  }
}

$('btn-uncensor').addEventListener('click', () => {
  const index = $('uncensor-list').selectedIndex;
  const item = diffLists[index];
  if (!item) {
    toast({ key: 'dl', kind: 'warn', title: '没有可用名单', text: '先在「区域差异」里生成结果', timeout: 3200 });
    return;
  }

  const pair = item.name.match(/^([A-Z0-9]+)2([A-Z0-9]+)_gen_/i);
  runDownload(
    {
      uncensor: { region: item.region, list: item.file },
      listPlatform: item.platform || $('fetch-platform').value,
      meta: { base: pair ? pair[1] : '', target: pair ? pair[2] : '', platform: item.platform },
    },
    `按选择下载（${item.name}）`,
  );
});

$('btn-uncensor-official').addEventListener('click', () => {
  runDownload({ official: true }, `按官方下载（${state.meta ? state.meta.platform : 'win'}）`);
});

$('btn-uncensor-run-custom').addEventListener('click', () => {

  if (!customList.files.length) {
    openCustomDialog();
    return;
  }
  $('custom-modal').hidden = false;
});

$('btn-custom-run').addEventListener('click', () => {
  const payload = {
    region: $('custom-region').value,
    platform: $('custom-platform').value,
    base: customList.base,
    target: customList.target,
    files: customList.files.map((item) => String(item).trim()).filter(Boolean),
  };
  if (!payload.files.length) {
    toast({ key: 'dl', kind: 'warn', title: 'files 为空', text: '先「载入当前选择」或新增文件', timeout: 3200 });
    return;
  }
  customList.region = payload.region;
  customList.platform = payload.platform;
  $('custom-modal').hidden = true;
  runDownload({ custom: payload }, `按自定义下载（${payload.region}）`);
});

$('btn-custom-from-list').addEventListener('click', loadCustomFromSelection);
$('btn-custom-add').addEventListener('click', () => {
  customList.files.push('');
  renderCustomList();
  const inputs = $('custom-list').querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

$('btn-custom-clear').addEventListener('click', () => {
  customList.files = [];
  renderCustomList();
});

$('custom-search').addEventListener('input', (event) => {
  customList.query = event.target.value;
  renderCustomList();
});

$('btn-custom-cancel').addEventListener('click', () => { $('custom-modal').hidden = true; });
$('custom-modal').addEventListener('click', (event) => {
  if (event.target === $('custom-modal')) $('custom-modal').hidden = true;
});

$('btn-custom-save').addEventListener('click', async () => {
  const payload = {
    region: $('custom-region').value,
    platform: $('custom-platform').value,
    files: customList.files.map((item) => String(item).trim()).filter(Boolean),
  };
  const result = await guard(() => window.api.writeCustomList(payload));
  if (!result || !result.ok) {
    $('custom-error').hidden = false;
    $('custom-error').textContent = (result && result.error) || '保存失败';
    return;
  }

  customList.region = payload.region;
  customList.platform = payload.platform;
  customList.saved = true;
  $('custom-modal').hidden = true;
  toast({ key: 'custom', kind: 'ok', title: '模板已保存', text: `${result.count} 项 → ${basename(result.file)}`, timeout: 3200 });
});
