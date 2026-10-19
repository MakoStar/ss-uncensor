/* 把路径分隔符统一成斜杠 */
export function toSlash(target: unknown): string {
  return String(target || '').split('\\').join('/')
}

/* 把字节数格式化成易读大小 */
export function fmtBytes(bytes: unknown): string {
  const value = Number(bytes) || 0
  if (value >= 1073741824) return `${(value / 1073741824).toFixed(2)}GB`
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)}MB`
  if (value >= 1024) return `${Math.round(value / 1024)}KB`
  return `${value}B`
}

/* 把 ISO 时间格式化成本地字符串 */
export function fmtTime(iso: string): string {
  return iso ? new Date(iso).toLocaleString('sv-SE') : ''
}
