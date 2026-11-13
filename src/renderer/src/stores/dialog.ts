import { defineStore } from 'pinia';
import { ref } from 'vue';
import { playSound } from './sound';

export const useDialogStore = defineStore('dialog', () => {
  const error = ref<{
    open: boolean;
    title: string;
    text: string;
    detail: { label: string; value: string } | null;
    showLog: boolean;
  }>({ open: false, title: '', text: '', detail: null, showLog: false });
  const confirm = ref({ open: false, title: '', text: '', okLabel: '确认删除', tone: 'danger' });

  const choice = ref<{
    open: boolean;
    title: string;
    text: string;
    options: Array<{ value: string; label: string; primary?: boolean }>;
  }>({ open: false, title: '', text: '', options: [] });

  let resolver: ((value: boolean) => void) | null = null;
  let choiceResolver: ((value: string | null) => void) | null = null;

  /** 打开错误弹窗并播放音效 */
  function showError(
    title: string,
    text: string,
    detail?: { label: string; value: string },
    showLog: boolean = false
  ): void {
    error.value = { open: true, title, text, detail: detail || null, showLog };
    playSound('error');
  }

  /** 关闭错误提示弹窗 */
  function closeError(): void {
    error.value.open = false;
    playSound('close');
  }

  /** 弹出确认框并等待用户选择 */
  function askConfirm(
    title: string,
    text: string,
    okLabel: string = '确认删除',
    tone: string = 'danger'
  ): Promise<boolean> {
    confirm.value = { open: true, title, text, okLabel, tone };
    playSound('open');
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
    });
  }

  /** 关闭确认框并返回选择结果 */
  function settleConfirm(value: boolean): void {
    confirm.value.open = false;
    playSound('close');
    if (resolver) {
      resolver(value);
      resolver = null;
    }
  }

  /** 弹出选项框并等待用户选择 */
  function askChoice(
    title: string,
    text: string,
    options: Array<{ value: string; label: string; primary?: boolean }>
  ): Promise<string | null> {
    choice.value = { open: true, title, text, options };
    playSound('open');
    return new Promise<string | null>((resolve) => {
      choiceResolver = resolve;
    });
  }

  /** 关闭选项框并返回选中值 */
  function settleChoice(value: string | null): void {
    choice.value.open = false;
    playSound('close');
    if (choiceResolver) {
      choiceResolver(value);
      choiceResolver = null;
    }
  }
  return { error, confirm, choice, showError, closeError, askConfirm, settleConfirm, askChoice, settleChoice };
});
