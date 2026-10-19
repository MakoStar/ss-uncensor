'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const log = require('../core/log/log');

/** 暴露给渲染进程的接口集合 */
contextBridge.exposeInMainWorld('api', {

  formatLog: (tag, message) => log.format(tag, message),

  meta: (options) => ipcRenderer.invoke('meta', options || {}),
  baseName: (platform) => ipcRenderer.invoke('base-name', { platform }),

  installFetcher: (options) => ipcRenderer.invoke('install-fetcher', options || {}),
  fetcherVersion: () => ipcRenderer.invoke('fetcher-version'),
  onRunProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('run:progress', listener);
    return () => ipcRenderer.removeListener('run:progress', listener);
  },

  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),

  fetchCommand: (options) => ipcRenderer.invoke('fetch-command', options),
  ping: (options) => ipcRenderer.invoke('ping', options),

  onPingProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ping:progress', listener);
    return () => ipcRenderer.removeListener('ping:progress', listener);
  },
  fetch: (options) => ipcRenderer.invoke('fetch', options),
  abort: () => ipcRenderer.invoke('abort'),
  uncensor: (options) => ipcRenderer.invoke('uncensor', options),
  diffLists: (options) => ipcRenderer.invoke('diff-lists', options),
  writeCustomList: (options) => ipcRenderer.invoke('write-custom-list', options),
  onRunLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('run:log', listener);
    return () => ipcRenderer.removeListener('run:log', listener);
  },

  listManifest: (query) => ipcRenderer.invoke('manifest-files', query),

  version: (options) => ipcRenderer.invoke('version', options || {}),
  diff: (options) => ipcRenderer.invoke('diff', options),
  diffResult: (options) => ipcRenderer.invoke('diff-result', options),
  saveDiffList: (options) => ipcRenderer.invoke('save-diff-list', options),
  readJson: (options) => ipcRenderer.invoke('read-json', options),
  writeJson: (options) => ipcRenderer.invoke('write-json', options),

  regionInfo: (options) => ipcRenderer.invoke('region-info', options),
  clearRegion: (options) => ipcRenderer.invoke('clear-region', options),

  openUrl: (url) => ipcRenderer.invoke('open-url', url),

  openDir: (dir) => ipcRenderer.invoke('open-dir', dir),
  openPath: (dir) => ipcRenderer.invoke('open-path', dir),
  backupResource: (payload) => ipcRenderer.invoke('backup-resource', payload),
  backupPackages: () => ipcRenderer.invoke('backup-packages'),
  matchPackageFiles: (payload) => ipcRenderer.invoke('match-package-files', payload),
  abortBackup: () => ipcRenderer.invoke('abort-backup'),
  onBackupProgress: (listener) => {
    ipcRenderer.on('backup:progress', listener);
    return () => ipcRenderer.removeListener('backup:progress', listener);
  },
  listBackups: () => ipcRenderer.invoke('list-backups'),
  deleteBackup: (payload) => ipcRenderer.invoke('delete-backup', payload),
  restoreBackup: (payload) => ipcRenderer.invoke('restore-backup', payload),
  onRestoreProgress: (listener) => {
    ipcRenderer.on('restore:progress', listener);
    return () => ipcRenderer.removeListener('restore:progress', listener);
  },
  replaceResource: (payload) => ipcRenderer.invoke('replace-resource', payload),
  abortReplace: () => ipcRenderer.invoke('abort-replace'),
  onReplaceProgress: (listener) => {
    ipcRenderer.on('replace:progress', listener);
    return () => ipcRenderer.removeListener('replace:progress', listener);
  },
  listReplaces: () => ipcRenderer.invoke('list-replaces'),
  removeReplace: (payload) => ipcRenderer.invoke('remove-replace', payload),
  resourceSummary: (options) => ipcRenderer.invoke('resource-summary', options),
  removeResource: (options) => ipcRenderer.invoke('remove-resource', options),
  removePackage: (options) => ipcRenderer.invoke('remove-package', options),
  packageZip: (options) => ipcRenderer.invoke('package-zip', options),
  onPackageProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('package:progress', listener);
    return () => ipcRenderer.removeListener('package:progress', listener);
  },
  diag: () => ipcRenderer.invoke('diag'),
  uninstallApp: () => ipcRenderer.invoke('uninstall-app'),

  selectDirectory: (options) => ipcRenderer.invoke('select-directory', options || {}),
  saveGameDir: (options) => ipcRenderer.invoke('save-game-dir', options || {}),
  detectGamePaths: (options) => ipcRenderer.invoke('detect-game-paths', options || {}),
  launcherPath: () => ipcRenderer.invoke('launcher-path'),
  launcherShortcut: (payload) => ipcRenderer.invoke('launcher-shortcut', payload || {}),
  pinStartMenu: () => ipcRenderer.invoke('pin-start-menu'),
  launchGame: () => ipcRenderer.invoke('launch-game'),
});
