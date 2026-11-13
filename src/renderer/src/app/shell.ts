import { cleanError, say } from '../utils/format';
import { useSettingsStore } from '../stores/settings';
import { useFetchStore } from '../stores/fetch';
import { pinia } from '../stores/pinia';
import { useDialogStore } from '../stores/dialog';

const dialog = useDialogStore(pinia);
const settings = useSettingsStore(pinia);
const fetch = useFetchStore(pinia);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (fetch.clearModal.open) fetch.clearModal.open = false;
  if (fetch.fetcherModal.open) fetch.fetcherModal.open = false;
  if (fetch.manifestModal.open) fetch.manifestModal.open = false;
  if (dialog.error.open) dialog.closeError();
  if (dialog.confirm.open) dialog.settleConfirm(false);
  if (settings.versionModal.open) settings.versionModal.open = false;
  if (settings.rollback.open) settings.rollback.open = false;
});

window.addEventListener('error', (event) => say('ERRO', `界面异常: ${cleanError(event.message)}`));
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.message ? event.reason.message : event.reason;
  say('ERRO', `界面异步异常: ${cleanError(reason)}`);
});
