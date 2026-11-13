import { defineStore } from 'pinia';
import { state } from '../app/state';
import { logToFile } from '../utils/log';

const DB_NAME = 'ssuncensor-ui';
const DB_VERSION = 1;
const STORE = 'image';

/** 创建背景图缓存仓库 */
type ImageRepo = {
  get: (hash: string) => Promise<any>;
  all: () => Promise<any[]>;
  set: (hash: string, base64: string) => Promise<void>;
};

/** 创建背景图缓存仓库 */
function useImageStore(): ImageRepo {
  const open = () =>
    new Promise<any>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(new Error('数据库打开报错'));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'hash' });
      };
      request.onsuccess = () => resolve(request.result);
    });

  return {
    /** 按哈希取缓存图 */
    async get(hash: string): Promise<any> {
      if (!hash) return { hash: '', base64: '' };
      const db = await open();
      return new Promise<any>((resolve) => {
        try {
          const store = db.transaction([STORE], 'readonly').objectStore(STORE);
          const request = store.get(hash);
          request.onerror = () => resolve({ hash: '', base64: '' });
          request.onsuccess = () => resolve(request.result || { hash: '', base64: '' });
        } catch (err) {
          resolve({ hash: '', base64: '' });
        } finally {
          db.close();
        }
      });
    },

    /** 读取全部缓存图 */
    async all(): Promise<any[]> {
      const db = await open();
      return new Promise<any[]>((resolve) => {
        try {
          const store = db.transaction([STORE], 'readonly').objectStore(STORE);
          const request = store.getAll();
          request.onerror = () => resolve([]);
          request.onsuccess = () => resolve((request.result || []) as any[]);
        } catch (err) {
          resolve([]);
        } finally {
          db.close();
        }
      });
    },
    /** 写入一张缓存图 */
    async set(hash: string, base64: string): Promise<void> {
      if (!hash || !base64) return;
      const db = await open();
      await new Promise<void>((resolve) => {
        try {
          const store = db.transaction([STORE], 'readwrite').objectStore(STORE);
          const request = store.put({ hash, base64 });
          request.onerror = () => resolve();
          request.onsuccess = () => resolve();
        } catch (err) {
          resolve();
        } finally {
          db.close();
        }
      });
    }
  };
}

/** 把背景图铺到页面底层 */
function paint(base64: string): void {
  const box = document.getElementById('bg-layer');
  if (!box || !base64) return;
  box.style.backgroundImage = `url("${base64}")`;
  box.dataset.ready = '1';
  document.getElementById('bg-anim')?.classList.remove('on');
}

/** 清掉背景图恢复兜底背景 */
function clear(): void {
  const box = document.getElementById('bg-layer');
  if (box) {
    box.style.backgroundImage = 'none';
    delete box.dataset.ready;
  }
  document.getElementById('bg-anim')?.classList.add('on');
}

/** 判断背景图开关是否打开 */
const enabled = (): boolean => Boolean(state.settings && state.settings.background !== false);

export const useBackgroundStore = defineStore('background', () => {
  /** 加载背景图并写入缓存 */
  async function apply(): Promise<void> {
    if (!enabled()) return clear();

    let config;
    try {
      config = await window.api.backgroundConfig();
    } catch (err) {
      logToFile(`背景图配置获取异常，使用兜底背景：${err.message}`);
      return clear();
    }
    if (!config.ok || !config.url) {
      if (config.error) logToFile(`背景图加载失败，使用兜底背景：${config.error}`);
      return clear();
    }

    const store = useImageStore();
    const hit = await store.get(config.crc64);
    if (hit.base64) return paint(hit.base64);

    const fresh = await window.api.backgroundImage({ url: config.url });
    if (!fresh.ok || !fresh.base64) {
      if (fresh.error) logToFile(`背景图下载失败，使用兜底背景：${fresh.error}`);
      return clear();
    }
    await store.set(config.crc64, fresh.base64);
    paint(fresh.base64);
  }

  /** 重新下载背景图并更新缓存 */
  async function refresh(): Promise<{ ok: boolean; error?: string; crc64?: string }> {
    const config = await window.api.backgroundConfig();
    if (!config.ok || !config.url) return { ok: false, error: '配置里没有背景图' };

    const fresh = await window.api.backgroundImage({ url: config.url });
    if (!fresh.ok || !fresh.base64) return { ok: false, error: fresh.error || '下载失败' };

    await useImageStore().set(config.crc64, fresh.base64);
    paint(fresh.base64);
    logToFile(`背景图已更新（${config.crc64}）`);
    return { ok: true, crc64: config.crc64 };
  }

  /** 按开关状态应用或清除背景 */
  function sync(): void {
    if (enabled()) {
      void apply();
      return;
    }
    clear();
  }

  /** 读取当前背景配置信息 */
  async function current(): Promise<{ ok: boolean; error?: string; url?: string; crc64?: string }> {
    try {
      const config = await window.api.backgroundConfig();
      if (config && config.ok && config.url) return { ok: true, url: config.url, crc64: config.crc64 || '' };
      return { ok: false, error: (config && config.error) || '配置里没有背景图' };
    } catch (err: any) {
      return { ok: false, error: err && err.message ? err.message : '获取背景配置失败' };
    }
  }

  /** 列出全部缓存过的背景图 */
  async function history(): Promise<Array<{ hash: string; base64: string }>> {
    const rows = await useImageStore().all();
    return rows
      .filter((row) => row && row.hash && row.base64)
      .map((row) => ({ hash: String(row.hash), base64: String(row.base64) }));
  }

  /** 直接按哈希启用缓存背景 */
  async function useHash(hash: string): Promise<{ ok: boolean; error?: string }> {
    const hit = await useImageStore().get(hash);
    if (!hit.base64) return { ok: false, error: '该背景已不在缓存里' };
    paint(hit.base64);
    return { ok: true };
  }
  return { apply, refresh, sync, current, history, useHash };
});
