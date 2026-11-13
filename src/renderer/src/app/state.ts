import { reactive } from 'vue';

export const state: any = reactive({
  meta: null,
  settings: null,
  picked: new Set<string>(),
  fetcher: null,
  resources: null,
  diff: null,
  diffFilter: 'all',
  view: { platform: 'win', page: 1 }
});

/** 读取反和谐输出目录设置 */
export function outputDirSetting(): string {
  const uncensor = (state.settings && state.settings.uncensor) || {};
  return String(uncensor.dir || '');
}
