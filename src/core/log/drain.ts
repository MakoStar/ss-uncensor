'use strict';

const ANSI = /\x1b\[[0-9;]*m/g;
const NOISE = /\[(TRAC|DEBU|STEP|TIPS)\] - /;

/* 按行读取子进程输出并去掉 ANSI 色码 */
function drain(output, quiet) {
  const text = String(output || '').replace(ANSI, '');
  if (!quiet) return text;
  return text
    .split(/\r?\n/)
    .filter((line) => !NOISE.test(line))
    .join('\n');
}

module.exports = { drain, ANSI, NOISE };
