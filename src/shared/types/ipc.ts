export interface Meta {
  platform: string
  platforms: string[]
  regions: string[]
  fetched: string[]
  fetcher: string
  fetcherOk: boolean
  fetcherTarget: string
  versionFile: string
  releases: string
  cwd: string
  dirs: Record<string, string>
  config: Record<string, unknown>
  settingsFile: string
  node: string
  electron: string
}

export interface BackupItem {
  file: string
  name: string
  target: string
  bytes: number
  time: string
  scope?: string
  tag?: string
  packageFile?: string
}

export interface PackageItem {
  file: string
  name: string
  tag: string
  bytes: number
  mtime: number
}

export interface ReplaceRecord {
  tag: string
  file: string
  targets: string[]
  counts: Record<string, number>
  bytes: number
  time: string
}

export interface ProgressData {
  target?: string
  written?: number
  total?: number
  line?: string
  stream?: string
  label?: string
  at?: string
}

export interface ToastOptions {
  title?: string
  text?: string
  kind?: string
  key?: string
  timeout?: number
}

export interface Api {
  formatLog(tag: string, message: string): string
  meta(options?: unknown): Promise<Meta>
  baseName(platform: string): Promise<unknown>
  diag(): Promise<unknown>
  uninstallApp(): Promise<{ ok: boolean; error?: string; uninstaller?: string }>
  selectDirectory(options?: unknown): Promise<{ path: string | null }>
  saveGameDir(options: unknown): Promise<unknown>
  detectGamePaths(options?: unknown): Promise<{ persistentStore: string | null; installResource: string | null; launcher: string | null }>
  saveSettings(settings: unknown): Promise<{ config: Record<string, unknown>; meta: Meta }>
  resetSettings(): Promise<{ config: Record<string, unknown>; meta: Meta }>
  installFetcher(options?: unknown): Promise<unknown>
  fetcherVersion(): Promise<unknown>
  fetchCommand(options?: unknown): Promise<{ commands: string[] }>
  ping(options?: unknown): Promise<unknown>
  fetch(options?: unknown): Promise<unknown>
  abort(): Promise<unknown>
  uncensor(options?: unknown): Promise<unknown>
  diffLists(options?: unknown): Promise<unknown>
  writeCustomList(options?: unknown): Promise<unknown>
  listManifest(query?: unknown): Promise<unknown>
  version(options?: unknown): Promise<unknown>
  diff(options?: unknown): Promise<unknown>
  diffResult(options?: unknown): Promise<unknown>
  saveDiffList(options?: unknown): Promise<unknown>
  readJson(options?: unknown): Promise<unknown>
  writeJson(options?: unknown): Promise<unknown>
  regionInfo(options?: unknown): Promise<unknown>
  clearRegion(options?: unknown): Promise<unknown>
  openUrl(url: string): Promise<unknown>
  openDir(dir: string): Promise<unknown>
  openPath(dir: string): Promise<unknown>
  backupResource(payload: unknown): Promise<unknown>
  backupPackages(): Promise<{ items: PackageItem[] }>
  matchPackageFiles(payload: unknown): Promise<unknown>
  abortBackup(): Promise<unknown>
  listBackups(): Promise<{ items: BackupItem[]; backupDir: string }>
  deleteBackup(payload: unknown): Promise<unknown>
  restoreBackup(payload: unknown): Promise<unknown>
  replaceResource(payload: unknown): Promise<unknown>
  abortReplace(): Promise<unknown>
  listReplaces(): Promise<{ items: ReplaceRecord[] }>
  removeReplace(payload: unknown): Promise<unknown>
  resourceSummary(options?: unknown): Promise<unknown>
  removeResource(options?: unknown): Promise<unknown>
  removePackage(options?: unknown): Promise<unknown>
  packageZip(options?: unknown): Promise<unknown>
  launcherPath(): Promise<{ launcher: string | null }>
  launcherShortcut(payload?: unknown): Promise<unknown>
  pinStartMenu(): Promise<unknown>
  launchGame(): Promise<unknown>
  onRunProgress(callback: (event: unknown, payload: ProgressData) => void): () => void
  onPingProgress(callback: (event: unknown, payload: ProgressData) => void): () => void
  onRunLog(callback: (event: unknown, payload: ProgressData) => void): () => void
  onBackupProgress(listener: (event: unknown, payload: ProgressData) => void): () => void
  onRestoreProgress(listener: (event: unknown, payload: ProgressData) => void): () => void
  onReplaceProgress(listener: (event: unknown, payload: ProgressData) => void): () => void
  onPackageProgress(callback: (event: unknown, payload: ProgressData) => void): () => void
}

declare global {
  interface Window {
    api: Api
  }
}
