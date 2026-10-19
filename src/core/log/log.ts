'use strict';

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
const paint = (text, rgb, bold) =>
  !COLORED ? text : `[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${bold ? '[1m' : ''}${text}${RESET}`;
const dim = (text) => (!COLORED ? text : `[38;2;51;153;51m${text}${RESET}`);

const ANSI_RESET = '\x1b[0m';
const ansiPaint = (text, rgb, bold) =>
  `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${bold ? '\x1b[1m' : ''}${text}${ANSI_RESET}`;
const ansiDim = (text) => `\x1b[38;2;51;153;51m${text}${ANSI_RESET}`;

/* 把日志按级别拼成带颜色的终端文本 */
function format(tag, message) {
  const stamp = new Date().toLocaleString('sv-SE');
  const rgb = PALETTE[tag] || PALETTE.TEST;
  const bold = BOLD.has(tag);
  return `[${ansiDim(stamp)}][${ansiPaint(tag, rgb, bold)}] - ${ansiPaint(String(message), rgb, bold)}`;
}

let level = ORDER.INFO;
if (process.env.NODE_LOG) {
  const key = String(process.env.NODE_LOG).trim().toUpperCase();
  if (ORDER[key]) level = ORDER[key];
  else if (key.startsWith('DEBUG')) level = ORDER.DEBU;
}

/* 输出一行带时间戳的日志 */
function write(tag, message) {
  const stamp = new Date().toLocaleString('sv-SE');
  const rgb = PALETTE[tag];
  process.stderr.write(
    `[${dim(stamp)}][${paint(tag, rgb, BOLD.has(tag))}] - ${paint(String(message), rgb, BOLD.has(tag))}\n`
  );
}

/* 按级别过滤后输出日志 */
function emit(tag, message) {
  if (ORDER[tag] !== undefined ? ORDER[tag] < level : ORDER.WARN < level) return;
  write(tag, message);
}

/* 输出 TRAC 级别日志 */
const trace = (m) => emit('TRAC', m);
/* 输出 DEBU 级别日志 */
const debu = (m) => emit('DEBU', m);
/* 输出 INFO 级别日志 */
const info = (m) => emit('INFO', m);
/* 输出 WARN 级别日志 */
const warn = (m) => emit('WARN', m);
/* 输出 ERRO 级别日志 */
const erro = (m) => emit('ERRO', m);

/* 输出 SUCC 成功日志 */
const succ = (m) => write('SUCC', m);
/* 输出 FAIL 失败日志 */
const fail = (m) => write('FAIL', m);
/* 输出 STEP 阶段日志 */
const step = (m) => write('STEP', m);
/* 输出 TIPS 提示日志 */
const tips = (m) => write('TIPS', m);
/* 输出 NODE 进程日志 */
const node = (m) => write('NODE', m);
/* 输出 TEST 断言日志 */
const test = (m) => write('TEST', m);

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

/* 打印居中的分节标题 */
function head(message) {
  const width = Array.from(String(message)).reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0);
  const pad = Math.max(2, HEAD_WIDTH - width - 2);
  const left = Math.floor(pad / 2);
  node(`${'═'.repeat(left)} ${message} ${'═'.repeat(pad - left)}`);
}

/* 调整日志详细级别 */
function bump(delta = 1) {
  const keys = Object.keys(ORDER);
  const at = keys.indexOf(
    Object.keys(ORDER).find((k) => ORDER[k] === level) || 'INFO'
  );
  level = ORDER[keys[Math.min(keys.length - 1, Math.max(0, at - delta))]];
}

/* 按名称设置日志级别 */
function setLevel(name) {
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
