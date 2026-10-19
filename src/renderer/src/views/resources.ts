import { toSlash } from '@shared/utils'
import { guard } from '../app/api'
import { $, esc, setListLoading } from '../utils/dom'
import { basename, relPath, say } from '../utils/format'
import { state } from '../app/state'
import { toast, toastConfig } from '../utils/toast'
import { askConfirm } from '../app/dialog'
import { MIN_LOADING_MS } from './browse'
import { renderConfigLine } from './fetch'
import { renderSettings } from './settings'
import { fmtBytes } from '@shared/utils'

/* 载入查看资源页数据 */
export async function loadResources() {
  const started = Date.now();
  const card = $('res-table').closest('.card');
  setListLoading(card, true);

  const result = await guard(() => window.api.resourceSummary({}));
  const elapsed = Date.now() - started;
  if (elapsed < MIN_LOADING_MS) await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
  setListLoading(card, false);
  if (!result) return;

  state.resources = result;

  const rootText = relPath(result.root);
  $('res-root').textContent = rootText;
  $('res-root').title = result.root;
  $('res-files').textContent = `${rootText}/<A>2<B>/<平台>/`;
  $('res-files').title = '形如 output/Uncensor/Resource/CN2JP/and/';
  $('res-pack').textContent = relPath(result.packageDir) + '/';
  $('res-pack').title = result.packageDir;
  $('res-total').textContent = `${result.totals.files} 个文件 · ${fmtBytes(result.totals.bytes)}`;
  $('res-pack-total').textContent = `${result.totals.packages} 个包 · ${fmtBytes(result.totals.packageBytes)}`;

  const body = $('res-table').querySelector('tbody');
  body.innerHTML = result.regions.map((item) => `
      <tr>
        <td>${esc(item.pair)}</td>
        <td class="mono">${esc(item.platform)}</td>
        <td class="mono">${item.files}</td>
        <td class="mono">${fmtBytes(item.bytes)}</td>
        <td class="mono dim" title="${esc(relPath(item.dir))}">${esc(relPath(item.dir))}</td>
        <td class="ops">
          <button class="btn ghost tiny" data-act="open" data-key="${esc(item.pair)}/${esc(item.platform)}">查看目录</button>
          <button class="btn ghost tiny" data-act="repack" data-key="${esc(item.pair)}/${esc(item.platform)}">重新打包</button>
          <button class="btn danger tiny" data-act="remove" data-key="${esc(item.pair)}/${esc(item.platform)}">删除</button>
        </td>
      </tr>`).join('');

  if (!result.regions.length) body.innerHTML = '<tr><td colspan="6">还没有下载任何资源</td></tr>';
  for (const button of body.querySelectorAll('button[data-act]')) {
    button.addEventListener('click', () => {
      const row = result.regions.find((entry) => `${entry.pair}/${entry.platform}` === button.dataset.key);
      if (!row) return;
      if (button.dataset.act === 'open') window.api.openDir(row.dir);
      if (button.dataset.act === 'repack') repackageResource(row);
      if (button.dataset.act === 'remove') removeResource(row);
    });
  }

  const packBody = $('res-pack-table').querySelector('tbody');
  packBody.innerHTML = result.packages.map((item) => `
      <tr>
        <td class="mono">${esc(item.name)}</td>
        <td class="mono">${fmtBytes(item.bytes)}</td>
        <td class="mono dim">${esc(new Date(item.mtime).toLocaleString('sv-SE'))}</td>
        <td class="ops">
          <button class="btn ghost tiny" data-pact="open" data-name="${esc(item.name)}">打开目录</button>
          <button class="btn danger tiny" data-pact="remove" data-name="${esc(item.name)}">删除</button>
        </td>
      </tr>`).join('');

  if (!result.packages.length) packBody.innerHTML = '<tr><td colspan="4">还没有打包过资源</td></tr>';
  for (const button of packBody.querySelectorAll('button[data-pact]')) {
    button.addEventListener('click', () => {
      const pack = result.packages.find((entry) => entry.name === button.dataset.name);
      if (!pack) return;
      if (button.dataset.pact === 'open') window.api.openDir(pack.dir);
      if (button.dataset.pact === 'remove') removePackage(pack);
    });
  }
}

$('btn-res-refresh').addEventListener('click', () => loadResources());
$('btn-res-open-root').addEventListener('click', () => {
  if (state.resources) window.api.openDir(state.resources.root);
});

/* 取文件路径的名称部分 */
export function pathName(file) {
  return String(file || '').split(/[\\/]/).pop() || '';
}

export let zipStartedAt = 0;
export let zipDone = 0;
export let zipTotal = 0;

window.api.onPackageProgress(({ done, total }) => {
  if ($('zip-modal').hidden) return;
  zipTotal = total || zipTotal;
  zipDone = done;

  const pct = zipTotal ? Math.min(100, Math.round((done / zipTotal) * 100)) : 0;
  const seconds = zipStartedAt ? Math.round((Date.now() - zipStartedAt) / 1000) : 0;
  $('zip-bar').style.width = `${pct}%`;
  $('zip-text').textContent = zipTotal
    ? `${fmtBytes(done)} / ${fmtBytes(zipTotal)} · ${pct}% · ${seconds}s`
    : `正在打包 · 已用 ${seconds}s`;
});

export let zipTimer = setInterval(() => {
  if ($('zip-modal').hidden || zipTotal) return;
  const seconds = zipStartedAt ? Math.round((Date.now() - zipStartedAt) / 1000) : 0;
  $('zip-bar').style.width = `${30 + 20 * Math.sin(seconds * 2)}%`;
  $('zip-text').textContent = `正在打包 · 已用 ${seconds}s`;
}, 400);

/* 带进度条执行打包 */
export async function runZipWithProgress(options) {

  const probe = await guard(() => window.api.packageZip({ ...options, dryRun: true }));
  if (!probe) return null;

  let overwrite = false;
  if (probe.needConfirm) {
    const ok = await askConfirm(
      '已存在同名压缩包',
      `${probe.name}（${fmtBytes(probe.bytes)}）已经在打包目录里，要覆盖吗？`,
      '覆盖',
    );
    if (!ok) return null;
    overwrite = true;
  }

  say('TIPS', `开始打包 ${probe.name} …`);
  zipStartedAt = Date.now();
  zipDone = 0;
  zipTotal = 0;
  openZipProgress(options.dir || '');
  const result = await guard(() => window.api.packageZip(overwrite ? { ...options, overwrite: true } : options));
  closeZipProgress();
  zipStartedAt = 0;
  zipTotal = 0;
  return result;
}

/* 重新打包某个资源目录 */
export async function repackageResource(item) {
  const ok = await askConfirm(
    `重新打包 ${item.pair} · ${item.platform}`,
    `将把 ${relPath(item.dir)} 下的 ${item.files} 个文件（${fmtBytes(item.bytes)}）重新打包成 zip。`,
    '开始打包',
  );
  if (!ok) return;

  say('TIPS', `正在打包 ${item.pair} · ${item.platform} …`);
  const official = item.pair === '官方默认' || item.rel === 'Default';
  const custom = item.pair === 'Custom';
  const result = await runZipWithProgress({
    dir: item.dir,
    platform: item.platform,
    official,
    custom,
    region: item.region || '',
    base: official || custom ? '' : item.base,
    target: official || custom ? '' : item.target,
  });

  if (!result) return;
  if (!result.ok) {
    toast({ key: 'zip', kind: 'err', title: '打包失败', text: result.error || '未知错误', timeout: 5000 });
    return;
  }
  say('SUCC', `已打包 ${basename(result.file)} · ${fmtBytes(result.bytes)} · 用时 ${result.seconds || 0}s`);
  toast({ key: 'zip', kind: 'ok', title: '打包完成', text: `${basename(result.file)} · ${fmtBytes(result.bytes)} · ${result.seconds || 0}s`, timeout: 5000 });
  loadResources();
}

/* 删除某个已下载资源目录 */
export async function removeResource(item) {
  const ok = await askConfirm(
    `删除 ${item.pair} · ${item.platform} 的资源`,
    `将永久删除 ${relPath(item.dir)} 下的 ${item.files} 个文件（${fmtBytes(item.bytes)}），之后需要重新下载。`,
  );
  if (!ok) return;

  const result = await guard(() => window.api.removeResource({ pair: item.pair, platform: item.platform }));
  if (!result) return;
  if (!result.ok) {
    toast({ key: 'rm', kind: 'err', title: '删除失败', text: result.error || '未知错误', timeout: 4000 });
    return;
  }
  say('SUCC', `已删除 ${item.pair} · ${item.platform} · ${result.files} 个文件 · ${fmtBytes(result.bytes)}`);
  loadResources();
}

/* 删除某个已打包压缩包 */
export async function removePackage(item) {
  const ok = await askConfirm(
    `删除压缩包 ${item.name}`,
    `将删除 ${relPath(item.file)}（${fmtBytes(item.bytes)}），已下载的资源目录不受影响。`,
  );
  if (!ok) return;

  const result = await guard(() => window.api.removePackage({ file: item.file }));
  if (!result) return;
  if (!result.ok) {
    toast({ key: 'rm', kind: 'err', title: '删除失败', text: result.error || '未知错误', timeout: 4000 });
    return;
  }
  say('SUCC', `已删除压缩包 ${relPath(result.file)}`);
  loadResources();
}

$('btn-reset-settings').addEventListener('click', async () => {
  const result = await guard(() => window.api.resetSettings());
  if (!result) return;
  state.meta = result.meta;
  state.settings = { ...result.config };
  state.picked = new Set(result.config.regions || []);
  renderSettings();
  renderConfigLine();
  toastConfig();
  say('TIPS', '配置已恢复默认');
});

/* 打开打包进度弹窗 */
export function openZipProgress(file) {
  $('zip-file').textContent = file ? pathName(toSlash(file)) : '';
  $('zip-bar').style.width = '0%';
  $('zip-text').textContent = '0 / 0';
  $('zip-modal').hidden = false;
}

/* 关闭打包进度弹窗 */
export function closeZipProgress() {
  $('zip-modal').hidden = true;
}
