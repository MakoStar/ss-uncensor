import { $, esc } from './dom';

export const ANSI_BASIC = [
  '#2b303b',
  '#ef6461',
  '#3ecf8e',
  '#f2c14e',
  '#4f8cff',
  '#c678dd',
  '#56b6c2',
  '#d7dae0',
  '#5c6370',
  '#ff7b72',
  '#56d364',
  '#e3b341',
  '#79b8ff',
  '#d2a8ff',
  '#7ee0ea',
  '#ffffff'
];

export const ansi256 = (n: number): string => {
  if (n < 16) return ANSI_BASIC[n];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const i = n - 16;
  const steps = [0, 95, 135, 175, 215, 255];
  return `rgb(${steps[Math.floor(i / 36)]},${steps[Math.floor((i % 36) / 6)]},${steps[i % 6]})`;
};

/** 把带 ANSI 码的文本转成网页片段 */
export function ansiToHtml(text: string): string {
  const out = [];
  let color = null;
  let bold = false;
  let last = 0;

  const push = (chunk: string): void => {
    if (!chunk) return;
    const body = esc(chunk);
    const style = [color ? `color:${color}` : '', bold ? 'font-weight:600' : ''].filter(Boolean).join(';');
    out.push(style ? `<span style="${style}">${body}</span>` : body);
  };

  const re = /\x1b\[([0-9;]*)m/g;
  let hit;
  while ((hit = re.exec(text)) !== null) {
    push(text.slice(last, hit.index));
    const params = hit[1]
      .split(';')
      .filter((v) => v !== '')
      .map(Number);

    for (let i = 0; i < params.length; i += 1) {
      const code = params[i];
      if (code === 0) {
        color = null;
        bold = false;
      } else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) color = null;
      else if (code === 38 && params[i + 1] === 2) {
        color = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 4;
      } else if (code === 38 && params[i + 1] === 5) {
        color = ansi256(params[i + 2]);
        i += 2;
      } else if (code >= 30 && code <= 37) color = ANSI_BASIC[code - 30];
      else if (code >= 90 && code <= 97) color = ANSI_BASIC[code - 90 + 8];
    }
    last = re.lastIndex;
  }
  push(text.slice(last));
  return out.join('');
}

/** 找出当前激活面板对应的作用域 */
function activeScope(): string {
  const uncensor = $('panel-uncensor');
  if (uncensor && uncensor.classList.contains('active')) return 'uncensor';
  const fetchPanel = $('panel-fetch');
  if (fetchPanel && fetchPanel.classList.contains('active')) return 'fetch';
  return 'other';
}

const boxForScope = (scope: string): any => {
  if (scope === 'uncensor') return $('dl-log');
  if (scope === 'fetch') return $('run-log');
  return null;
};
const pending = [];
let flushTimer = null;

/** 把日志行排队写入日志文件 */
function queueFile(text: string): void {
  pending.push(text);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const lines = pending.splice(0, pending.length);
    try {
      window.api.appendLog(lines);
    } catch (err) {}
  }, 200);
}

window.addEventListener('beforeunload', () => {
  if (!pending.length) return;
  try {
    window.api.appendLog(pending.splice(0, pending.length));
  } catch (err) {}
});

export const logToFile = (text: string): void => {
  if (text) queueFile(text);
};

/** 往界面日志区写一行日志 */
export function logLine(text: string, kind = 'out', target?: any, persist = true, scope?: string): void {
  const box = target || (scope ? boxForScope(scope) : boxForScope(activeScope()));
  if (box) {
    const line = document.createElement('div');
    line.className = `l-${kind}`;
    if (kind === 'out') line.innerHTML = ansiToHtml(text);
    else line.textContent = text;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    while (box.childElementCount > 4000) box.removeChild(box.firstChild);
  }
  if (persist) queueFile(text);
}

window.api.onRunLog(({ line, stream, scope }: any) =>
  logLine(line, stream === 'err' ? 'err' : 'out', undefined, false, scope)
);
