import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { guard } from '../app/api';
import { showError } from '../app/dialog';
import { toSlash } from '@shared/utils';
import { MIN_LOADING_MS } from './browse';
import { useMetaStore } from './meta';
import { useUiStore } from './ui';

export interface VersionRow {
  region: string;
  clientVer?: string;
  gameVer?: string;
  patchNum?: string;
  versionStr?: string;
  missing?: boolean;
}

/** 把长文本里的文件路径换成文件名 */
function shortMessage(text: string, fileRel: string): string {
  const rel = toSlash(fileRel || '');
  if (!rel) return text;
  const name = rel.split('/').pop() || rel;
  return text.includes(rel) ? text.split(rel).join(name) : text;
}

export const useVersionStore = defineStore('version', () => {
  const meta = useMetaStore();
  const ui = useUiStore();

  const status = ref('');
  const rows = ref<VersionRow[]>([]);
  const errorText = ref('');
  const loading = ref(false);
  const renderKey = ref(0);
  let loadedPlatform = '';

  /** 读取版本登记并生成表格数据 */
  async function load({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
    const platform = meta.platform;
    const file = meta.versionPath.trim();
    loadedPlatform = platform;

    loading.value = true;
    errorText.value = '';
    status.value = '读取中…';
    const startedAt = Date.now();

    const result = await guard(() => window.api.version({ platform, file }));

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
    loading.value = false;

    if (!result) {
      rows.value = [];
      status.value = '读取失败';
      return;
    }

    meta.versionPath = toSlash(result.fileRel);

    if (result.error) {
      const reason = shortMessage(result.error, result.fileRel || file);
      rows.value = [];
      errorText.value = reason;
      status.value = reason;
      if (!quiet) showError('无法读取版本登记', reason, { label: '当前路径', value: toSlash(result.fileRel) });
      return;
    }

    const registered = Object.keys(result.regions);
    const fetched = result.fetched || [];
    const names = [...new Set([...registered, ...fetched])];
    const missing = fetched.filter((region: string) => !registered.includes(region));

    status.value = missing.length
      ? `${result.platform} · ${registered.length} 个区域有版本记录 · ${missing.join(', ')} 无记录`
      : `${result.platform} · ${registered.length} 个区域有版本记录`;

    rows.value = names.map((region: string) => {
      const info = result.regions[region];
      if (!info) return { region, missing: true };
      return {
        region,
        clientVer: info.client_ver,
        gameVer: info.game_ver,
        patchNum: info.patch_num,
        versionStr: info.version_str
      };
    });
    renderKey.value += 1;
  }

  watch(
    () => meta.platform,
    () => {
      if (ui.activeTab !== 'version') return;
      if (loadedPlatform === meta.platform) return;
      void load({ quiet: true });
    }
  );

  /** 打开版本登记所在目录 */
  function openDir(): void {
    const dir = meta.meta && meta.meta.dirs && meta.meta.dirs.manifest;
    if (dir) window.api.openPath(dir);
  }
  return { status, rows, errorText, loading, renderKey, load, openDir };
});
