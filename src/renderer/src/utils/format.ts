import { $ } from './dom';
import { logLine } from './log';
import { state } from '../app/state';
import { toSlash } from '@shared/utils';

export const say = (tag: string, message: string, scope?: string): void =>
  logLine(window.api.formatLog(tag, message), 'out', undefined, true, scope);

/** 清理错误信息里的调用链前缀 */
export function cleanError(message: any): string {
  return String(message || '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim();
}

export const fmtSize = (bytes: number): string => {
  if (!bytes) return '0B';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
};

export const exactSize = (bytes: any): string => {
  if (bytes === null || bytes === undefined || bytes === '') return '—';
  const value = Number(bytes);
  return Number.isFinite(value) ? `${value.toLocaleString('en-US')} B` : String(bytes);
};

/** 把路径裁成相对输出目录的短路径 */
export function shortPath(full: string): string {
  const norm = (value: string): string => String(value || '').replace(/\\/g, '/');
  const root = norm(state.meta && state.meta.dirs ? state.meta.dirs.output : '');
  const text = norm(full);
  if (!root || !text.startsWith(root)) return text;
  return text.slice(root.length).replace(/^\/+/, '');
}

/** 把路径裁成相对应用目录的路径 */
export function relPath(target: string): string {
  const text = toSlash(target);
  const root = toSlash(state.meta && state.meta.cwd);
  if (root && text.startsWith(root)) return text.slice(root.length).replace(/^\/+/, '');
  return text;
}

export const basename = (file: string): string =>
  String(file || '')
    .split(/[\\/]/)
    .pop() || '';

export const sizeText = (bytes: number): string => {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
};
