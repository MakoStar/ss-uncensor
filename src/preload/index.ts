const { contextBridge, ipcRenderer } = require('electron');
const log = require('../shared/log');

contextBridge.exposeInMainWorld('api', {
  formatLog: (tag: string, message: string): string => log.format(tag, message),

  meta: (options: unknown): Promise<unknown> => ipcRenderer.invoke('meta', options || {}),
  baseName: (platform: string): Promise<unknown> => ipcRenderer.invoke('base-name', { platform }),

  installFetcher: (options: Record<string, any>): Promise<unknown> =>
    ipcRenderer.invoke('install-fetcher', options || {}),
  fetcherVersion: (): Promise<unknown> => ipcRenderer.invoke('fetcher-version'),
  cancelFetcher: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('cancel-fetcher'),
  fetcherReleases: (): Promise<unknown> => ipcRenderer.invoke('fetcher-releases'),
  onRunProgress: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('run:progress', listener);
    return () => ipcRenderer.removeListener('run:progress', listener);
  },

  saveSettings: (settings: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('save-settings', settings),
  configText: (): Promise<unknown> => ipcRenderer.invoke('config-text'),
  configWrite: (payload: { text: string }): Promise<unknown> => ipcRenderer.invoke('config-write', payload || {}),
  resetSettings: (): Promise<unknown> => ipcRenderer.invoke('reset-settings'),
  onConfigChanged: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('config:changed', listener);
    return () => ipcRenderer.removeListener('config:changed', listener);
  },

  fetchCommand: (options: { platform: string; regions: string[] }): Promise<unknown> =>
    ipcRenderer.invoke('fetch-command', options),
  ping: (options: { platform: string; regions: string[] }): Promise<unknown> => ipcRenderer.invoke('ping', options),

  onPingProgress: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ping:progress', listener);
    return () => ipcRenderer.removeListener('ping:progress', listener);
  },
  fetch: (options: { platform: string; regions: string[] }): Promise<unknown> => ipcRenderer.invoke('fetch', options),
  abort: (): Promise<unknown> => ipcRenderer.invoke('abort'),
  uncensor: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('uncensor', options),
  uncensorPreview: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('uncensor-preview', options),
  syncScan: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('sync-scan', options),
  syncClean: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('sync-clean', options),
  onSyncProgress: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sync:progress', listener);
    return () => ipcRenderer.removeListener('sync:progress', listener);
  },
  diffLists: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('diff-lists', options),
  writeCustomList: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('write-custom-list', options),
  appendLog: (lines: string[]): void => ipcRenderer.send('log-append', lines),
  onRunLog: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('run:log', listener);
    return () => ipcRenderer.removeListener('run:log', listener);
  },

  listManifest: (query: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('manifest-files', query),
  manifestText: (query: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('manifest-text', query),

  version: (options: unknown): Promise<unknown> => ipcRenderer.invoke('version', options || {}),
  manifestStatus: (payload: { regions: string[]; platform: string }): Promise<{ ok: boolean; missing: string[] }> =>
    ipcRenderer.invoke('manifest-status', payload || {}),
  diff: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('diff', options),
  diffResult: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('diff-result', options),
  rebuildMani: (payload: { platform: string }): Promise<unknown> => ipcRenderer.invoke('rebuild-mani', payload || {}),
  saveDiffList: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('save-diff-list', options),
  listDiffResult: (payload: Record<string, any>): Promise<unknown> =>
    ipcRenderer.invoke('list-diff-result', payload || {}),
  deleteDiffResult: (payload: { name: string }): Promise<unknown> =>
    ipcRenderer.invoke('delete-diff-result', payload || {}),
  clearDiffResult: (): Promise<unknown> => ipcRenderer.invoke('clear-diff-result'),
  readJson: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('read-json', options),
  writeJson: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('write-json', options),

  regionInfo: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('region-info', options),
  clearRegion: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('clear-region', options),

  openUrl: (url: string): Promise<unknown> => ipcRenderer.invoke('open-url', url),

  backgroundConfig: (): Promise<unknown> => ipcRenderer.invoke('background-config'),
  backgroundImage: (options: { url: string }): Promise<unknown> =>
    ipcRenderer.invoke('background-image', options || {}),
  backgroundSave: (options: { url: string; dir: string }): Promise<unknown> =>
    ipcRenderer.invoke('background-save', options || {}),

  openDir: (dir: string): Promise<unknown> => ipcRenderer.invoke('open-dir', dir),
  manifestTree: (payload: { platform: string }): Promise<unknown> => ipcRenderer.invoke('manifest-tree', payload),
  openPath: (dir: string): Promise<unknown> => ipcRenderer.invoke('open-path', dir),
  locateFile: (payload: { file: string; roots: string[] }): Promise<{ ok: boolean; dir: string }> =>
    ipcRenderer.invoke('locate-file', payload || {}),
  backupResource: (payload: { targets: string[]; dest: string; packageFile: string }): Promise<unknown> =>
    ipcRenderer.invoke('backup-resource', payload),
  backupPackages: (): Promise<{ items: any[] }> => ipcRenderer.invoke('backup-packages'),
  matchPackageFiles: (payload: { file: string }): Promise<unknown> =>
    ipcRenderer.invoke('match-package-files', payload),
  abortBackup: (): Promise<unknown> => ipcRenderer.invoke('abort-backup'),
  onBackupProgress: (listener: (event: any, payload: any) => void): (() => void) => {
    ipcRenderer.on('backup:progress', listener);
    return () => ipcRenderer.removeListener('backup:progress', listener);
  },
  listBackups: (): Promise<{ items: any[]; missing?: number }> => ipcRenderer.invoke('list-backups'),
  deleteBackup: (payload: { file: string }): Promise<unknown> => ipcRenderer.invoke('delete-backup', payload),
  restoreBackup: (payload: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('restore-backup', payload),
  onRestoreProgress: (listener: (event: any, payload: any) => void): (() => void) => {
    ipcRenderer.on('restore:progress', listener);
    return () => ipcRenderer.removeListener('restore:progress', listener);
  },
  replaceResource: (payload: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('replace-resource', payload),
  abortReplace: (): Promise<unknown> => ipcRenderer.invoke('abort-replace'),
  onReplaceProgress: (listener: (event: any, payload: any) => void): (() => void) => {
    ipcRenderer.on('replace:progress', listener);
    return () => ipcRenderer.removeListener('replace:progress', listener);
  },
  listReplaces: (): Promise<unknown> => ipcRenderer.invoke('list-replaces'),
  clearReplaces: (): Promise<unknown> => ipcRenderer.invoke('clear-replaces'),
  saveReplaces: (payload: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('save-replaces', payload || {}),
  removeReplace: (payload: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('remove-replace', payload),
  resourceSummary: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('resource-summary', options),
  removeResource: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('remove-resource', options),
  removePackage: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('remove-package', options),
  packageZip: (options: Record<string, any>): Promise<unknown> => ipcRenderer.invoke('package-zip', options),
  onPackageProgress: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('package:progress', listener);
    return () => ipcRenderer.removeListener('package:progress', listener);
  },
  diag: (): Promise<unknown> => ipcRenderer.invoke('diag'),
  uninstallApp: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('uninstall-app'),

  selectDirectory: (options: Record<string, any>): Promise<{ path: string | null }> =>
    ipcRenderer.invoke('select-directory', options || {}),
  selectFile: (options: Record<string, any>): Promise<{ path: string | null }> =>
    ipcRenderer.invoke('select-file', options || {}),
  saveGameDir: (options: { path: string }): Promise<unknown> => ipcRenderer.invoke('save-game-dir', options || {}),
  detectGamePaths: (options: { dir: string }): Promise<unknown> =>
    ipcRenderer.invoke('detect-game-paths', options || {}),
  launcherPath: (): Promise<unknown> => ipcRenderer.invoke('launcher-path'),
  launcherShortcut: (payload: { kind: string }): Promise<unknown> =>
    ipcRenderer.invoke('launcher-shortcut', payload || {}),
  pinStartMenu: (): Promise<unknown> => ipcRenderer.invoke('pin-start-menu'),
  launchGame: (): Promise<unknown> => ipcRenderer.invoke('launch-game')
});
