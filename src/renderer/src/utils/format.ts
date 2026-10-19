import { $ } from './dom'
import { logLine } from './log'
import { state } from '../app/state'
import { toSlash } from '@shared/utils'

/* 按标签格式化后写入运行日志 */
export const say = (tag, message) => logLine(window.api.formatLog(tag, message), 'out');

/* 压缩错误信息只保留首行 */
export function cleanError(message) {
  return String(message || '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim();
}

/* 把字节数格式化成易读大小 */
export const fmtSize = (bytes) => {
  if (!bytes) return '0B';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
};

/* 把长路径压缩成简短形式 */
export function shortPath(full) {
  const norm = (value) => String(value || '').replace(/\\/g, '/');
  const root = norm(state.meta && state.meta.dirs ? state.meta.dirs.output : '');
  const text = norm(full);
  if (!root || !text.startsWith(root)) return text;
  return text.slice(root.length).replace(/^\/+/, '');
}

/* 把绝对路径转成相对路径 */
export function relPath(target) {
  const text = toSlash(target);
  const root = toSlash(state.meta && state.meta.cwd);
  if (root && text.startsWith(root)) return text.slice(root.length).replace(/^\/+/, '');
  return text;
}

/* 取路径最后一段文件名 */
export const basename = (file) => String(file || '').split(/[\\/]/).pop() || '';

/* 把字节数格式化成易读大小 */
export const sizeText = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
};
