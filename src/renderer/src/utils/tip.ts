const WIDTH = 430;
const MARGIN = 8;

let float: HTMLElement | null = null;
let wired = false;

const host = (): HTMLElement => {
  if (float && float.isConnected) return float;
  float = document.createElement('div');
  float.className = 'tip-float';
  float.setAttribute('role', 'tooltip');
  float.hidden = true;
  document.body.appendChild(float);
  return float;
};

const hide = (): void => {
  if (!float) return;
  float.hidden = true;
  float.innerHTML = '';
};

/** 在图标旁显示提示浮层 */
function show(icon: HTMLElement): void {
  const source = icon.querySelector('.tip-body');
  if (!source) return;

  const box = host();
  box.innerHTML = source.innerHTML;
  box.style.maxWidth = `${Math.min(WIDTH, window.innerWidth - MARGIN * 2)}px`;
  box.hidden = false;

  const rect = icon.getBoundingClientRect();
  const width = box.offsetWidth;
  box.style.left = `${Math.min(Math.max(MARGIN, rect.right - width), window.innerWidth - width - MARGIN)}px`;
  box.style.top = '0px';

  const height = box.offsetHeight;
  const below = rect.bottom + 8;
  box.style.top = `${below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, rect.top - height - 8) : below}px`;
}

/** 给容器内的提示图标绑定事件 */
export function installTips(root: ParentNode = document): void {
  for (const icon of root.querySelectorAll<HTMLElement>('.tip-icon')) {
    if (icon.dataset.tip) continue;
    icon.dataset.tip = '1';
    icon.addEventListener('mouseenter', () => show(icon));
    icon.addEventListener('mouseleave', hide);
    icon.addEventListener('focus', () => show(icon));
    icon.addEventListener('blur', hide);
  }

  if (wired) return;
  wired = true;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', hide, true);
}
