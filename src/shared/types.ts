export interface Meta {
  platform: string;
  platforms: string[];
  regions: string[];
  fetched: string[];
  fetcher: string;
  fetcherOk: boolean;
  fetcherTarget: string;
  versionFile: string;
  releases: string;
  cwd: string;
  dirs: Record<string, string>;
  config: Record<string, unknown>;
  settingsFile: string;
  node: string;
  electron: string;
}

export interface BackupItem {
  file: string;
  name: string;
  target: string;
  bytes: number;
  time: string;
  scope?: string;
  tag?: string;
  packageFile?: string;
}

export interface PackageItem {
  file: string;
  name: string;
  tag: string;
  bytes: number;
  mtime: number;
}

export interface ReplaceRecord {
  tag: string;
  file: string;
  targets: string[];
  counts: Record<string, number>;
  bytes: number;
  time: string;
  missing?: boolean;
}

export interface ProgressData {
  target?: string;
  written?: number;
  total?: number;
  line?: string;
  stream?: string;
  label?: string;
  scope?: string;
  at?: string;
}

export interface ToastOptions {
  title?: string;
  text?: string;
  kind?: string;
  key?: string;
  timeout?: number;
}

export interface ManifestFile {
  name: string;
  path: string;
  rel: string;
  bytes: number;
  mtime: number;
}

export interface ManifestRegion {
  region: string;
  dir: string;
  rel: string;
  files: ManifestFile[];
}

export interface ManifestTree {
  ok: boolean;
  platform: string;
  root: string;
  rel: string;
  regions: ManifestRegion[];
}

export interface Api {
  formatLog(tag: string, message: string): string;
  appendLog(lines: string[]): void;
  meta(options?: unknown): Promise<Meta>;
  baseName(platform: string): Promise<unknown>;
  diag(): Promise<unknown>;
  uninstallApp(): Promise<{ ok: boolean; error?: string; uninstaller?: string }>;
  selectDirectory(options?: unknown): Promise<{ path: string | null }>;
  selectFile(options?: unknown): Promise<{ path: string | null }>;
  saveGameDir(options: unknown): Promise<unknown>;
  detectGamePaths(
    options?: unknown
  ): Promise<{ persistentStore: string | null; installResource: string | null; launcher: string | null }>;
  saveSettings(
    settings: unknown
  ): Promise<{ ok?: boolean; config: Record<string, unknown>; meta: Meta; error?: string }>;
  resetSettings(): Promise<{ ok?: boolean; config: Record<string, unknown>; meta: Meta; error?: string }>;
  configText(): Promise<{ ok: boolean; file: string; text?: string; error?: string }>;
  configWrite(payload: { text: string }): Promise<{
    ok: boolean;
    file: string;
    text?: string;
    config?: Record<string, unknown>;
    meta?: Meta;
    error?: string;
  }>;
  installFetcher(options?: unknown): Promise<unknown>;
  fetcherVersion(): Promise<unknown>;
  cancelFetcher(): Promise<{ ok: boolean }>;
  fetcherReleases(): Promise<{
    ok: boolean;
    releases?: Array<{ tag: string; name?: string; date?: string }>;
    error?: string;
  }>;
  fetchCommand(options?: unknown): Promise<{ commands: string[] }>;
  ping(options?: unknown): Promise<unknown>;
  fetch(options?: unknown): Promise<unknown>;
  abort(): Promise<unknown>;
  uncensor(options?: unknown): Promise<unknown>;
  uncensorPreview(options?: unknown): Promise<unknown>;
  syncScan(options?: unknown): Promise<unknown>;
  syncClean(options?: unknown): Promise<unknown>;
  diffLists(options?: unknown): Promise<unknown>;
  writeCustomList(options?: unknown): Promise<unknown>;
  listDiffResult(options?: unknown): Promise<unknown>;
  deleteDiffResult(payload: { name: string }): Promise<unknown>;
  clearDiffResult(): Promise<unknown>;
  listManifest(query?: unknown): Promise<unknown>;
  manifestText(query?: unknown): Promise<unknown>;
  version(options?: unknown): Promise<unknown>;
  manifestStatus(payload: {
    regions: string[];
    platform?: string;
  }): Promise<{ ok: boolean; fetched: string[]; missing: string[] }>;
  diff(options?: unknown): Promise<unknown>;
  diffResult(options?: unknown): Promise<unknown>;
  rebuildMani(payload: { regions?: string[]; platform?: string; mode?: string }): Promise<{
    ok: boolean;
    platform: string;
    missing: string[];
    rebuilt: Array<{
      region: string;
      out: string;
      resources: number;
      resVer: string;
      clientVer: string;
      gameVer: string;
      changed: boolean;
    }>;
  }>;
  saveDiffList(options?: unknown): Promise<unknown>;
  readJson(options?: unknown): Promise<unknown>;
  writeJson(options?: unknown): Promise<unknown>;
  regionInfo(options?: unknown): Promise<unknown>;
  clearRegion(options?: unknown): Promise<unknown>;
  openUrl(url: string): Promise<unknown>;
  openDir(dir: string): Promise<unknown>;
  manifestTree(payload?: { platform?: string }): Promise<ManifestTree>;
  backgroundConfig(): Promise<{ ok: boolean; url?: string; crc64?: string; error?: string }>;
  backgroundImage(options?: { url: string }): Promise<{ ok: boolean; base64?: string; error?: string }>;
  backgroundSave(options?: {
    url: string;
    dir: string;
  }): Promise<{ ok: boolean; file?: string; bytes?: number; error?: string }>;
  openPath(dir: string): Promise<unknown>;
  locateFile(payload: {
    file: string;
    roots?: string[];
  }): Promise<{ ok: boolean; dir: string; file?: string; root?: string }>;
  backupResource(payload: unknown): Promise<unknown>;
  backupPackages(): Promise<{ items: PackageItem[] }>;
  matchPackageFiles(payload: unknown): Promise<unknown>;
  abortBackup(): Promise<unknown>;
  listBackups(): Promise<{ items: BackupItem[]; backupDir: string }>;
  deleteBackup(payload: unknown): Promise<unknown>;
  restoreBackup(payload: unknown): Promise<unknown>;
  replaceResource(payload: unknown): Promise<unknown>;
  abortReplace(): Promise<unknown>;
  listReplaces(): Promise<{ items: ReplaceRecord[]; missing?: number }>;
  clearReplaces(): Promise<{ ok: boolean; removed: number }>;
  saveReplaces(payload: { items: unknown[] }): Promise<{ ok: boolean; items?: unknown[]; error?: string }>;
  removeReplace(payload: unknown): Promise<unknown>;
  resourceSummary(options?: unknown): Promise<unknown>;
  removeResource(options?: unknown): Promise<unknown>;
  removePackage(options?: unknown): Promise<unknown>;
  packageZip(options?: unknown): Promise<unknown>;
  launcherPath(): Promise<{ launcher: string | null }>;
  launcherShortcut(payload?: unknown): Promise<unknown>;
  pinStartMenu(): Promise<unknown>;
  launchGame(): Promise<unknown>;
  onConfigChanged(callback: (payload: { config: Record<string, any>; silent?: boolean }) => void): () => void;
  onRunProgress(callback: (event: unknown, payload: ProgressData) => void): () => void;
  onPingProgress(callback: (event: unknown, payload: ProgressData) => void): () => void;
  onRunLog(callback: (event: unknown, payload: ProgressData) => void): () => void;
  onBackupProgress(listener: (event: unknown, payload: ProgressData) => void): () => void;
  onRestoreProgress(listener: (event: unknown, payload: ProgressData) => void): () => void;
  onReplaceProgress(listener: (event: unknown, payload: ProgressData) => void): () => void;
  onPackageProgress(callback: (event: unknown, payload: ProgressData) => void): () => void;
  onSyncProgress(callback: (event: unknown, payload: ProgressData) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}
