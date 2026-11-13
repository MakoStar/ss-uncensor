import { pinia } from '../stores/pinia';
import { useDialogStore } from '../stores/dialog';

/** 打开错误提示弹窗 */
export function showError(
  title: string,
  text: string,
  detail?: { label: string; value: string },
  showLog = false
): void {
  useDialogStore(pinia).showError(title, text, detail, showLog);
}

/** 打开确认弹窗等待用户选择 */
export function askConfirm(
  title: string,
  text: string,
  okLabel = '确认删除',
  tone: 'danger' | 'primary' = 'danger'
): Promise<boolean> {
  return useDialogStore(pinia).askConfirm(title, text, okLabel, tone);
}

/** 打开选项弹窗等待用户选择 */
export function askChoice(
  title: string,
  text: string,
  options: Array<{ value: string; label: string; primary?: boolean }>
): Promise<string> {
  return useDialogStore(pinia).askChoice(title, text, options);
}
