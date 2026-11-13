const PALETTE = {
  TRAC: [114, 115, 116],
  DEBU: [114, 115, 116],
  INFO: [102, 255, 153],
  WARN: [255, 255, 102],
  ERRO: [255, 102, 102],
  SUCC: [102, 255, 102],
  FAIL: [255, 153, 102],
  STEP: [153, 255, 255],
  TIPS: [255, 102, 255],
  NODE: [102, 102, 255],
  TEST: [204, 204, 204],
};

const ORDER = { TRAC: 10, DEBU: 20, INFO: 30, WARN: 40, ERRO: 50 };

const HEAD_WIDTH = 64;
const BOLD = new Set(['TEST']);
const COLORED = Boolean(process.stderr && process.stderr.isTTY) && !process.env.NO_COLOR;

const RESET = '[0m';

/** 按颜色渲染文本 */
const paint = (text: string, rgb: number[], bold: boolean): string =>
  !COLORED ? text : `[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${bold ? '[1m' : ''}${text}${RESET}`;

/** 渲染灰色时间戳 */
const dim = (text: string): string => (!COLORED ? text : `[38;2;51;153;51m${text}${RESET}`);

const ANSI_RESET = '\x1b[0m';

/** 用转义码渲染彩色文本 */
const ansiPaint = (text: string, rgb: number[], bold: boolean): string =>
  `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${bold ? '\x1b[1m' : ''}${text}${ANSI_RESET}`;

/** 用转义码生成灰色文本 */
const ansiDim = (text: string): string => `\x1b[38;2;51;153;51m${text}${ANSI_RESET}`;

/** 拼出带时间与颜色的日志行 */
function format(tag: string, message: unknown): string {
  const stamp = new Date().toLocaleString('sv-SE');
  const rgb = PALETTE[tag] || PALETTE.TEST;
  const bold = BOLD.has(tag);
  return `[${ansiDim(stamp)}] - ${ansiPaint(String(message), rgb, bold)}`;
}

let level = ORDER.INFO;
if (process.env.NODE_LOG) {
  const key = String(process.env.NODE_LOG).trim().toUpperCase();
  if (ORDER[key]) level = ORDER[key];
  else if (key.startsWith('DEBUG')) level = ORDER.DEBU;
}

/** 把日志写到标准错误 */
function write(tag: string, message: unknown): void {
  const stamp = new Date().toLocaleString('sv-SE');
  const rgb = PALETTE[tag];
  process.stderr.write(
    `[${dim(stamp)}] - ${paint(String(message), rgb, BOLD.has(tag))}\n`
  );
}

/** 按级别阈值输出日志 */
function emit(tag: string, message: unknown): void {
  if (ORDER[tag] !== undefined ? ORDER[tag] < level : ORDER.WARN < level) return;
  write(tag, message);
}

/** 输出跟踪级别日志 */
const trace = (m: unknown): void => emit('TRAC', m);

/** 输出调试级别日志 */
const debu = (m: unknown): void => emit('DEBU', m);

/** 输出信息级别日志 */
const info = (m: unknown): void => emit('INFO', m);

/** 输出警告级别日志 */
const warn = (m: unknown): void => emit('WARN', m);

/** 输出错误级别日志 */
const erro = (m: unknown): void => emit('ERRO', m);

/** 输出成功级别日志 */
const succ = (m: unknown): void => write('SUCC', m);

/** 输出失败级别日志 */
const fail = (m: unknown): void => write('FAIL', m);

/** 输出步骤级别日志 */
const step = (m: unknown): void => write('STEP', m);

/** 输出提示级别日志 */
const tips = (m: unknown): void => write('TIPS', m);

/** 输出节点级别日志 */
const node = (m: unknown): void => write('NODE', m);

/** 输出测试级别日志 */
const test = (m: unknown): void => write('TEST', m);

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

/** 打印带边框的标题 */
function head(message: unknown): void {
  const width = Array.from(String(message)).reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0);
  const pad = Math.max(2, HEAD_WIDTH - width - 2);
  const left = Math.floor(pad / 2);
  node(`${'═'.repeat(left)} ${message} ${'═'.repeat(pad - left)}`);
}

/** 调整日志级别阈值 */
function bump(delta: number = 1): void {
  const keys = Object.keys(ORDER);
  const at = keys.indexOf(
    Object.keys(ORDER).find((k) => ORDER[k] === level) || 'INFO'
  );
  level = ORDER[keys[Math.min(keys.length - 1, Math.max(0, at - delta))]];
}

/** 按名称设置日志级别 */
function setLevel(name: unknown): void {
  const key = String(name).trim().toUpperCase();
  if (key in ORDER) level = ORDER[key];
}

module.exports = {
  COLORED,
  HEAD_WIDTH,
  ORDER,
  PALETTE,
  trace,
  debu,
  info,
  warn,
  erro,
  succ,
  fail,
  step,
  tips,
  node,
  test,
  head,
  bump,
  setLevel,
  get level() {
    return level;
  },
  raw: write,
  format,
};