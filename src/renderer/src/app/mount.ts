import fetchHtml from '../layout/panels/fetch.html?raw'
import browseHtml from '../layout/panels/browse.html?raw'
import uncensorHtml from '../layout/panels/uncensor.html?raw'
import versionHtml from '../layout/panels/version.html?raw'
import diffHtml from '../layout/panels/diff.html?raw'
import resourcesHtml from '../layout/panels/resources.html?raw'
import replaceHtml from '../layout/panels/replace.html?raw'
import settingsHtml from '../layout/panels/settings.html?raw'
import backupModalHtml from '../layout/modals/backup.html?raw'
import clearModalHtml from '../layout/modals/clear.html?raw'
import confirmModalHtml from '../layout/modals/confirm.html?raw'
import customModalHtml from '../layout/modals/custom.html?raw'
import dlModalHtml from '../layout/modals/dl.html?raw'
import errorModalHtml from '../layout/modals/error.html?raw'
import fetcherModalHtml from '../layout/modals/fetcher.html?raw'
import jsonModalHtml from '../layout/modals/json.html?raw'
import launcherModalHtml from '../layout/modals/launcher.html?raw'
import removeModalHtml from '../layout/modals/remove.html?raw'
import replaceModalHtml from '../layout/modals/replace.html?raw'
import restoreModalHtml from '../layout/modals/restore.html?raw'
import resultModalHtml from '../layout/modals/result.html?raw'
import versionModalHtml from '../layout/modals/version.html?raw'
import zipModalHtml from '../layout/modals/zip.html?raw'

/* 按页签顺序挂载面板骨架 */
document.getElementById('panels').innerHTML = [fetchHtml, browseHtml, uncensorHtml, versionHtml, diffHtml, resourcesHtml, replaceHtml, settingsHtml].join('');

/* 挂载全部弹窗 */
document.getElementById('modals').innerHTML = [backupModalHtml, clearModalHtml, confirmModalHtml, customModalHtml, dlModalHtml, errorModalHtml, fetcherModalHtml, jsonModalHtml, launcherModalHtml, removeModalHtml, replaceModalHtml, restoreModalHtml, resultModalHtml, versionModalHtml, zipModalHtml].join('');
