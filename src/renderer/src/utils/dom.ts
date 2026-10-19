import { state } from '../app/state'
/* 按 id 取元素 */
export const $ = (id: string): any => document.getElementById(id);

/* 转义文本防止注入 HTML */
export const esc = (text) => String(text ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* 填充下拉选项并尽量保留原选择 */
export function fillSelect(select, values, keep) {
  select.innerHTML = '';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if (keep === value) option.selected = true;
    select.appendChild(option);
  }
}

/* 给所有下拉套一层容器用于自绘箭头 */
export function wrapSelects(root = document) {
  for (const select of root.querySelectorAll('select')) {
    const parent = select.parentElement;
    if (parent && parent.classList.contains('select-wrap')) continue;

    const wrap = document.createElement('span');
    wrap.className = 'select-wrap';
    select.replaceWith(wrap);
    wrap.appendChild(select);

    select.addEventListener('focus', () => wrap.classList.add('open'));

    select.addEventListener('mousedown', () => wrap.classList.add('open'));
    select.addEventListener('blur', () => wrap.classList.remove('open'));
    select.addEventListener('change', () => wrap.classList.remove('open'));
  }
}

/* 判断下拉里是否已有某选项 */
export const optionExists = (select, value) => [...select.options].some((option) => option.value === value);

/* 切换列表卡的加载态 */
export function setListLoading(card, on) {
  card.classList.toggle('is-loading', on);
}

/* 让表格行依次淡入 */
export function staggerRows(body) {
  [...body.children].forEach((row, index) => {
    row.style.animationDelay = `${Math.min(index, 14) * 14}ms`;
  });
}
