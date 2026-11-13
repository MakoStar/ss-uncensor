const ANSI = /\x1b\[[0-9;]*m/g;
const NOISE = /\[(TRAC|DEBU|STEP|TIPS)\] - /;

/** 去掉颜色码并过滤噪音 */
function drain(output: unknown, quiet: boolean): string {
  const text = String(output || '').replace(ANSI, '');
  if (!quiet) return text;
  return text
    .split(/\r?\n/)
    .filter((line) => !NOISE.test(line))
    .join('\n');
}

module.exports = { drain, ANSI, NOISE };