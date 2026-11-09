/*
 * Background service worker.
 *  - Toggles the panel when the toolbar icon / shortcut is used (injecting the
 *    content scripts first into tabs that were open before the extension loaded).
 *  - Remembers per-tab panel visibility and the preserved log in storage.session,
 *    which survives service-worker restarts but is cleared when the browser closes.
 *  - Shows the captured-request count on the toolbar badge.
 */
'use strict';

const MAIN_SCRIPTS = ['src/inject/interceptor.js'];
const CONTENT_SCRIPTS = [
  'src/content/utils.js',
  'src/content/icons.js',
  'src/content/styles.js',
  'src/content/store.js',
  'src/content/layout.js',
  'src/content/details.js',
  'src/content/panel.js',
  'src/content/main.js',
];

const tabKey = (tabId) => `tab:${tabId}`;

async function getTabState(tabId) {
  const key = tabKey(tabId);
  const res = await chrome.storage.session.get(key);
  return res[key] || { visible: false, entries: null };
}

async function patchTabState(tabId, patch) {
  const state = await getTabState(tabId);
  await chrome.storage.session.set({ [tabKey(tabId)]: { ...state, ...patch } });
}

async function ensureContentScripts(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (res && res.ok) return true;
  } catch { /* not injected yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: MAIN_SCRIPTS, world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
    return true;
  } catch (err) {
    // chrome://, the Web Store, PDF viewer, etc. cannot be scripted.
    console.warn('[Network Monitor] Cannot run on this page:', err && err.message);
    return false;
  }
}

async function togglePanel(tab) {
  if (!tab || tab.id == null) return;
  if (!(await ensureContentScripts(tab.id))) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '✕' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#6b7280' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Network Monitor cannot run on this page' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
  } catch (err) {
    console.warn('[Network Monitor] Toggle failed:', err && err.message);
  }
}

chrome.action.onClicked.addListener(togglePanel);

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#5b6cf0' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (!msg || tabId == null) return false;

  switch (msg.type) {
    case 'init':
      getTabState(tabId).then((state) => sendResponse(state)).catch(() => sendResponse(null));
      return true; // async response

    case 'set-visible':
      patchTabState(tabId, { visible: !!msg.visible }).catch(() => {});
      break;

    case 'persist':
      patchTabState(tabId, { entries: Array.isArray(msg.entries) ? msg.entries : null }).catch((err) => {
        // Quota exceeded — keep visibility, drop the log rather than failing silently forever.
        console.warn('[Network Monitor] Could not persist log:', err && err.message);
        patchTabState(tabId, { entries: null }).catch(() => {});
      });
      break;

    case 'clear-persisted':
      patchTabState(tabId, { entries: null }).catch(() => {});
      break;

    case 'badge': {
      const n = Number(msg.count) || 0;
      const text = n === 0 ? '' : n > 999 ? '999+' : String(n);
      chrome.action.setBadgeText({ tabId, text }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#5b6cf0' }).catch(() => {});
      chrome.action.setTitle({ tabId, title: `Network Monitor — ${n} request${n === 1 ? '' : 's'} captured` }).catch(() => {});
      break;
    }

    default:
      break;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
});
