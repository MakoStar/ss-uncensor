import { guard } from '../app/api'
import { $, esc } from '../utils/dom'
import { basename, relPath, say, sizeText } from '../utils/format'
import { state } from '../app/state'
import { toast } from '../utils/toast'
import { closeClear, refreshFetched, renderConfigLine } from './fetch'
import { closeVersionDialog } from './settings'

export const DIFF_KIND_TEXT = { size: '体积不同', hash: '哈希不同', missing_in_base: '目标新增' };

/* 渲染一个差异单元格 */
export function diffCell(snapshot, file, kinds, missingClass, missingText) {
  if (!snapshot) {
    return `<div class="diff-cell ${missingClass}"><span class="none">${esc(missingText)}</span></div>`;
  }
  const hash = String(snapshot.hash || '').slice(0, 8);
  const tags = (kinds || []).map((kind) => `<span class="diff-tag">${esc(DIFF_KIND_TEXT[kind] || kind)}</span>`).join('');
  return `<div class="diff-cell">
      <span class="f mono" title="${esc(file)}">${esc(file)}</span>
      <span class="m">${sizeText(snapshot.size)}${hash ? ` · ${hash}` : ''}</span>
      ${tags}
    </div>`;
}

/* 按过滤条件取差异行 */
export function diffRowsOf(result, filter) {
  const items = result.items || [];
  const same = result.same || [];

  if (filter === 'same') return { rows: same, changed: false, label: '一致' };
  if (filter === 'onlyTarget') return { rows: items.filter((item) => !item.base), changed: true, label: '仅目标有' };
  if (filter === 'onlyBase') return { rows: items.filter((item) => !item.target), changed: true, label: '仅基准有' };
  if (filter === 'size') return { rows: items.filter((item) => (item.diff || []).includes('size')), changed: true, label: '体积不同' };
  return { rows: items, changed: true, label: '差异项' };
}

/* 渲染差异明细行 */
export function renderDiffRows(result) {
  const box = $('diff-files');
  box.innerHTML = '';
  $('diff-base-name').textContent = result.baseRegion || '—';
  $('diff-target-name').textContent = result.targetRegion || '—';

  const filter = state.diffFilter || 'all';
  const { rows, changed, label } = diffRowsOf(result, filter);
  const shown = rows.slice(0, 2000);

  if (!shown.length) {
    box.innerHTML = `<div class="rule-empty">没有${esc(label)}</div>`;
    return;
  }

  box.innerHTML = shown.map((item) => `
    <div class="diff-row${changed ? ' changed' : ''}">
      ${diffCell(item.base, item.file, item.diff, item.base ? '' : 'only-target', '仅目标有（基准缺失）')}
      ${diffCell(item.target, item.file, item.diff, item.target ? '' : 'only-base', '仅基准有（目标缺失）')}
    </div>`).join('');

  if (rows.length > shown.length) {
    const more = document.createElement('div');
    more.className = 'rule-empty';
    more.textContent = `… 其余 ${rows.length - shown.length} 个见名单文件`;
    box.appendChild(more);
  }
}

/* 渲染差异汇总区 */
export function renderDiffSummary(result) {
  const s = result.summary || {};
  const tiles = [
    [null, s.baseCount, '基础资源'],
    [null, s.targetCount, '目标资源'],
    ['same', s.same, '一致资源'],
    ['onlyBase', s.onlyInBase, '仅基准有'],
    ['onlyTarget', s.onlyInTarget, '仅目标有'],
    ['all', s.diffTotal, '差异文件'],
  ];

  $('diff-summary').innerHTML = tiles.map(([filter, value, label]) => `
    <div class="stat${filter ? ' clickable' : ''}${filter && filter === (state.diffFilter || 'all') ? ' on' : ''}"
         ${filter ? `data-filter="${filter}"` : ''} title="${filter ? '点击筛选该类文件' : ''}">
      <b>${value}</b><span>${esc(label)}</span>
    </div>`).join('');

  for (const tile of $('diff-summary').querySelectorAll('.stat[data-filter]')) {
    tile.addEventListener('click', () => {
      state.diffFilter = tile.dataset.filter;
      renderDiffSummary(state.diff);
      renderDiffRows(state.diff);
      $('diff-files').scrollTop = 0;
    });
  }

  const rebuilt = result.rebuilt && result.rebuilt.length ? `已自动合成 ${result.rebuilt.join(', ')} · ` : '';
  const filterLabel = { all: '差异项', same: '一致', onlyTarget: '仅目标有', onlyBase: '仅基准有', size: '体积不同' }[state.diffFilter || 'all'];
  const shown = diffRowsOf(result, state.diffFilter || 'all').rows.length;
  $('diff-total').textContent = `${rebuilt}${filterLabel} ${shown} / ${result.files.length}`;
  $('diff-total').title = `当前显示 ${shown} 条，共 ${result.files.length} 个差异项`;
}

$('diff-platform').addEventListener('change', async () => {
  const target = $('diff-platform').value;
  await guard(async () => {
    await refreshFetched(target);
    $('fetch-platform').value = target;
    $('browse-platform').value = target;
    $('version-platform').value = target;
    renderConfigLine();
  });

  state.diff = null;
  $('diff-files-card').hidden = true;
  $('diff-summary').textContent = '尚未对比';
  $('diff-total').textContent = '';
  $('diff-out').textContent = '';
});

$('btn-diff').addEventListener('click', async () => {
  const base = $('diff-base').value;
  const target = $('diff-target').value;
  if (base === target) {
    say('WARN', '基准与目标不能相同');
    return;
  }

  $('diff-summary').textContent = '对比中…';
  $('diff-files').innerHTML = '';
  $('diff-total').textContent = '';
  $('diff-out').textContent = '';

  const result = await guard(() => window.api.diff({ base, target, platform: $('diff-platform').value }));
  if (!result) {
    $('diff-summary').textContent = '对比失败';
    return;
  }
  if (result.error) {
    $('diff-summary').textContent = result.error;
    return;
  }

  state.diff = { ...result, baseRegion: base, targetRegion: target };

  $('diff-files-card').hidden = false;
  renderDiffSummary(state.diff);
  renderDiffRows(state.diff);
  $('diff-out').textContent = `预览模式：${basename(result.listFile)} / ${basename(result.outFile)} 尚未写入磁盘，点「生成结果」才会落盘。`;
});

export const resultState = {
  base: 'CN',
  target: 'TW',
  platform: 'win',
  list: [],
  rules: [],
  query: '',
  outFile: '',
  listFile: '',
  reportJson: '',
};

/* 生成当前差异名单的 JSON 文本 */
export const listJsonText = () => JSON.stringify(
  { region: resultState.target, platform: resultState.platform, files: resultState.list },
  null,
  2,
);

/* 渲染结果弹窗某一侧的行 */
export function renderSideRows(target, rows) {
  $(target).innerHTML = rows
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `<div class="side-row"><span>${esc(key)}</span><b>${esc(String(value))}</b></div>`)
    .join('');
}

/* 渲染结果弹窗的键值信息 */
export function renderResultKv(result) {
  const s = result.summary || {};
  const cfg = result.config || {};
  const base = cfg.base || {};
  const target = cfg.target || {};

  $('rc-base-region').textContent = result.baseRegion || '—';
  $('rc-target-region').textContent = result.targetRegion || '—';

  renderSideRows('rc-base-rows', [
    ['资源总数', s.baseCount],
    ['独有文件', s.onlyInBase],
    ['RES_VER', base.RES_VER],
    ['CLIENT_VER', base.CLIENT_VER],
    ['GAME_VER', base.GAME_VER],
  ]);
  renderSideRows('rc-target-rows', [
    ['资源总数', s.targetCount],
    ['独有文件', s.onlyInTarget],
    ['RES_VER', target.RES_VER],
    ['CLIENT_VER', target.CLIENT_VER],
    ['GAME_VER', target.GAME_VER],
  ]);

  const stats = [
    ['差异文件', s.diffTotal],
    ['一致', s.same],
    ['体积不同', s.sizeDiff],
    ['哈希不同', s.hashDiff],
    ['扩展名', result.ext || ''],
  ];
  $('result-kv').innerHTML = stats
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `<div class="kv-tile"><b>${esc(key)}</b><span>${esc(String(value))}</span></div>`)
    .join('');
}

/* 渲染结果弹窗的列表 */
export function renderResultList() {
  const box = $('result-list');
  box.innerHTML = '';

  const query = resultState.query.trim().toLowerCase();
  const rows = resultState.list
    .map((file, index) => ({ file, index }))
    .filter((row) => !query || row.file.toLowerCase().includes(query));
  $('result-count').textContent = `${resultState.list.length} 项${query ? ` · 过滤出 ${rows.length}` : ''}`;

  const head = document.createElement('div');
  head.className = 'list-head';
  head.innerHTML = '<span class="idx">#</span><span>文件名</span><span class="op">操作</span>';
  box.appendChild(head);

  if (!rows.length) {
    const none = document.createElement('div');
    none.className = 'rule-empty';
    none.style.padding = '10px';
    none.textContent = '没有匹配的文件';
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
    input.addEventListener('change', () => { resultState.list[row.index] = input.value.trim(); });
    line.querySelector('button').addEventListener('click', () => {
      resultState.list.splice(row.index, 1);
      renderResultList();
    });
    box.appendChild(line);
  }
}

/* 渲染结果弹窗的规则说明 */
export function renderRules() {
  const box = $('rule-chips');
  box.innerHTML = '';
  if (!resultState.rules.length) {
    box.innerHTML = '<span class="rule-empty">还没有应用排除规则</span>';
    return;
  }
  for (const [index, rule] of resultState.rules.entries()) {
    const chip = document.createElement('button');
    chip.className = 'rule-chip';
    chip.type = 'button';
    chip.title = '点击移除这条规则（已移除的文件不会恢复）';
    chip.textContent = `${rule.label} ×`;
    chip.addEventListener('click', () => {
      resultState.rules.splice(index, 1);
      renderRules();
    });
    box.appendChild(chip);
  }
}

export const MODE_LABEL = {
  contains: '包含',
  startsWith: '开头匹配',
  endsWith: '结尾匹配',
  exact: '完全相同',
  regex: '正则',
};

/* 按规则模式构造匹配函数 */
export function ruleMatcher(mode, pattern) {
  const raw = String(pattern || '');
  const text = raw.startsWith('^') ? raw.slice(1) : raw;
  const lower = text.toLowerCase();

  if (mode === 'contains') return (file) => file.toLowerCase().includes(lower);
  if (mode === 'startsWith') return (file) => file.toLowerCase().startsWith(lower);
  if (mode === 'endsWith') return (file) => file.toLowerCase().endsWith(lower);
  if (mode === 'exact') return (file) => file === text;
  try {
    const re = new RegExp(raw);
    return (file) => re.test(file);
  } catch (err) {
    return null;
  }
}

/* 打开结果弹窗 */
export async function openResultDialog() {
  const base = $('diff-base').value;
  const target = $('diff-target').value;
  if (base === target) {
    say('WARN', '基准与目标不能相同');
    return;
  }

  $('result-modal').hidden = false;
  $('result-file').textContent = '正在计算差异…';
  $('result-kv').innerHTML = '';
  $('result-list').innerHTML = '';
  $('result-count').textContent = '';
  $('result-error').hidden = true;

  const result = await guard(() => window.api.diffResult({
    base,
    target,
    platform: $('diff-platform').value,
  }));
  if (!result || result.error) {
    $('result-file').textContent = '生成失败';
    $('result-error').hidden = false;
    $('result-error').textContent = (result && result.error) || '生成失败，请查看运行日志';
    return;
  }

  resultState.base = base;
  resultState.target = target;
  resultState.platform = result.platform || (state.meta && state.meta.platform) || 'win';
  resultState.reportJson = result.reportJson || '';
  resultState.outFile = result.outFile || '';
  resultState.listFile = result.listFile || '';
  resultState.list = [...(result.list || [])];
  resultState.rules = [];
  resultState.query = '';
  $('result-search').value = '';

  $('result-file').textContent = `${relPath(result.listFile)} · ${result.list.length} 项`;
  $('res-out-name').textContent = basename(result.outFile);
  $('res-out-name').title = relPath(result.outFile || '');
  $('res-list-name').textContent = basename(result.listFile);
  $('res-list-name').title = relPath(result.listFile || '');
  $('result-hint').textContent = `${resultState.rules.length} 条排除规则已应用，保存后资源下载按这份名单下载`;

  renderResultKv(result);
  renderResultList();
  renderRules();
}

$('btn-diff-result').addEventListener('click', openResultDialog);

$('result-search').addEventListener('input', (event) => {
  resultState.query = event.target.value;
  renderResultList();
});

$('btn-result-add').addEventListener('click', () => {
  resultState.list.push('');
  renderResultList();
  const inputs = $('result-list').querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

$('btn-rule-apply').addEventListener('click', () => {
  const pattern = $('rule-pattern').value.trim();
  const mode = $('rule-mode').value;
  if (!pattern) {
    toast({ key: 'rule', kind: 'warn', title: '排除规则', text: '请先填写要排除的内容', timeout: 3000 });
    return;
  }

  const match = ruleMatcher(mode, pattern);
  if (!match) {
    $('result-error').hidden = false;
    $('result-error').textContent = `正则不合法：${pattern}`;
    return;
  }
  $('result-error').hidden = true;

  const before = resultState.list.length;
  resultState.list = resultState.list.filter((file) => !match(file));
  const removed = before - resultState.list.length;

  resultState.rules.push({ mode, pattern, label: `${MODE_LABEL[mode]} ${pattern}`, removed });
  $('rule-pattern').value = '';
  renderResultList();
  renderRules();
  toast({
    key: 'rule',
    kind: removed ? 'ok' : 'info',
    title: '排除规则已应用',
    text: removed ? `${MODE_LABEL[mode]} ${pattern} · 移除 ${removed} 项` : `${MODE_LABEL[mode]} ${pattern} · 没有匹配项`,
    timeout: 3200,
  });
});

$('btn-result-cancel').addEventListener('click', () => { $('result-modal').hidden = true; });
$('result-modal').addEventListener('click', (event) => {
  if (event.target === $('result-modal')) $('result-modal').hidden = true;
});

$('btn-result-save').addEventListener('click', async () => {
  const button = $('btn-result-save');
  button.disabled = true;
  button.textContent = '保存中…';

  const result = await guard(() => window.api.saveDiffList({
    base: resultState.base,
    target: resultState.target,
    list: resultState.list,
  }));

  button.disabled = false;
  button.textContent = '保存名单';

  if (!result || !result.ok) {
    $('result-error').hidden = false;
    $('result-error').textContent = '保存失败，请查看运行日志';
    return;
  }

  $('result-modal').hidden = true;
  toast({ key: 'list', kind: 'ok', title: '名单已保存', text: `${result.count} 项 → ${relPath(result.file)}`, timeout: 4000 });
});

export let jsonState = { file: '', editable: false };

/* 打开 JSON 查看或编辑弹窗 */
export async function openJsonView(file, edit = false, initialText = '') {
  jsonState = { file, editable: edit };
  $('json-error').hidden = true;
  $('json-modal-title').textContent = edit ? '编辑 JSON' : '预览 JSON';
  $('json-file').textContent = relPath(file) || '（没有文件）';
  $('json-body').readOnly = !edit;
  $('btn-json-save').hidden = !edit;
  $('json-modal').hidden = false;

  if (initialText) {
    $('json-body').value = initialText;
    return;
  }

  $('json-body').value = '加载中…';
  const result = await guard(() => window.api.readJson({ file }));
  if (!result || result.error) {
    $('json-body').value = (result && result.error) || '读取失败';
    return;
  }

  $('json-file').textContent = `${relPath(result.file)} · ${(result.size / 1024).toFixed(1)}KB`;
  $('json-body').value = result.text;
}

$('btn-out-preview').addEventListener('click', () => openJsonView(resultState.outFile, false, resultState.reportJson));
$('btn-out-edit').addEventListener('click', () => openJsonView(resultState.outFile, true, resultState.reportJson));
$('btn-list-preview').addEventListener('click', () => openJsonView(resultState.listFile, false, listJsonText()));
$('btn-list-edit').addEventListener('click', () => openJsonView(resultState.listFile, true, listJsonText()));

$('btn-json-save').addEventListener('click', async () => {
  const button = $('btn-json-save');
  button.disabled = true;
  button.textContent = '保存中…';

  const result = await guard(() => window.api.writeJson({ file: jsonState.file, text: $('json-body').value }));

  button.disabled = false;
  button.textContent = '保存修改';

  if (!result || !result.ok) {
    $('json-error').hidden = false;
    $('json-error').textContent = (result && result.error) || '保存失败';
    return;
  }
  toast({ key: 'json', kind: 'ok', title: '已保存', text: `${basename(result.file)} · ${(result.bytes / 1024).toFixed(1)}KB`, timeout: 3000 });
});

$('btn-json-close').addEventListener('click', () => { $('json-modal').hidden = true; });
$('json-modal').addEventListener('click', (event) => {
  if (event.target === $('json-modal')) $('json-modal').hidden = true;
});

$('btn-json-copy').addEventListener('click', async () => {
  const text = $('json-body').value;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast({ key: 'json', kind: 'ok', title: '已复制', text: `${text.length} 个字符`, timeout: 2500 });
});
