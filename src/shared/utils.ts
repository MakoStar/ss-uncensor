/** 把反斜杠路径改成斜杠 */
export function toSlash(target: unknown): string {
  return String(target || '')
    .split('\\')
    .join('/');
}

/** 把字节数格式化成可读大小 */
export function fmtBytes(bytes: unknown): string {
  const value = Number(bytes) || 0;
  if (value >= 1073741824) return `${(value / 1073741824).toFixed(2)}GB`;
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)}MB`;
  if (value >= 1024) return `${Math.round(value / 1024)}KB`;
  return `${value}B`;
}

/** 按目录名判断游戏所属渠道 */
export function detectGameChannel(dir: unknown): { key: 'official' | 'bili' | 'unknown'; label: string; note: string } {
  const raw = String(dir || '');
  const parts = raw.split(/[\\/]/).filter(Boolean);
  const base = (parts[parts.length - 1] || '').toLowerCase().replace(/[\s_-]+/g, '');
  const full = raw.toLowerCase();

  if (base === 'stellasoracn' || /stellasora_cn/i.test(raw)) {
    return { key: 'official', label: '官服', note: '官方服安装目录（StellaSora_CN）' };
  }
  if (base === 'stellasoragame' || /stellasora\s*game/i.test(raw) || /bilibili/i.test(full)) {
    return { key: 'bili', label: 'B服', note: 'Bilibili 服安装目录（StellaSora Game）' };
  }
  return { key: 'unknown', label: '未知渠道', note: '无法从目录名判断官服 / B服' };
}

/** 把时间戳格式化成日期时间 */
export function fmtTime(iso: string | number): string {
  return iso ? new Date(iso).toLocaleString('sv-SE') : '';
}
