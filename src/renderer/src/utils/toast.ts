import { pinia } from '../stores/pinia';
import { useToastStore } from '../stores/toast';

/** 弹出一条全局通知 */
export const toast = (options?: { title?: string; text?: string; kind?: string; key?: string; timeout?: number }) =>
  useToastStore(pinia).show(options || {});

/** 读取当前通知的展示配置 */
export const toastConfig = () => useToastStore(pinia).toastConfig();
