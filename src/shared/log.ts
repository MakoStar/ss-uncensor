/** 给日志消息加上时间前缀 */
export function format(tag: string, message: unknown): string {
  const stamp = new Date().toLocaleString('sv-SE');
  return `[${stamp}] - ${message}`;
}
