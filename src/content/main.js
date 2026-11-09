/*
 * Content-script entry point (isolated world). Wires together:
 *   interceptor (MAIN world) --CustomEvent--> store --> panel
 * and talks to the background worker for visibility, preserve-log and badge count.
 */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});
  if (window.top !== window) return; // top frame only
  if (NM.app) NM.app.destroy(); // re-injected after an extension reload

  const { extAlive, sendMessage } = NM.util;
  const SETTINGS_KEY = 'netmon.settings';
  const DEFAULT_SETTINGS = { theme: 'dark', preserveLog: false, filter: 'all', layout: null };

  const store = new NM.Store();
  let settings = { ...DEFAULT_SETTINGS };
  let panel = null;
  let visible = false;
  let destroyed = false;

  // ---------- bridge from MAIN world ----------
  const onBridgeEvent = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.detail); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'start' && msg.entry) store.add(msg.entry);
    else if (msg.t === 'update') store.update(msg.id, msg.patch || {});
    else if (msg.t === 'frame') store.addFrame(msg.id, msg.frame || {});
  };
  document.addEventListener('__netmon:event', onBridgeEvent);

  const sendConfig = () => {
    document.dispatchEvent(new CustomEvent('__netmon:config', { detail: JSON.stringify({ recording: store.recording }) }));
  };

  // ---------- settings ----------
  function loadSettings() {
    return new Promise((resolve) => {
      if (!extAlive()) return resolve(settings);
      try {
        chrome.storage.local.get(SETTINGS_KEY, (res) => {
          if (chrome.runtime.lastError) return resolve(settings);
          settings = { ...DEFAULT_SETTINGS, ...(res && res[SETTINGS_KEY]) };
          resolve(settings);
        });
      } catch { resolve(settings); }
    });
  }

  function saveSettings(patch) {
    const prevPreserve = settings.preserveLog;
    settings = { ...settings, ...patch };
    if (extAlive()) {
      try { chrome.storage.local.set({ [SETTINGS_KEY]: settings }); } catch { /* ignore */ }
    }
    if ('preserveLog' in patch && patch.preserveLog !== prevPreserve) {
      if (settings.preserveLog) persist.flush();
      else { persist.cancel(); sendMessage({ type: 'clear-persisted' }); }
    }
  }

  const onStorageChanged = (changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    const next = { ...DEFAULT_SETTINGS, ...changes[SETTINGS_KEY].newValue };
    // Sync appearance + preserve-log across tabs; keep this tab's layout and filter.
    settings = { ...settings, theme: next.theme, preserveLog: next.preserveLog };
    if (panel) panel.setSettings(settings);
  };
  try { chrome.storage.onChanged.addListener(onStorageChanged); } catch { /* ignore */ }

  // ---------- preserve log ----------
  // Throttled (not debounced) so continuous socket traffic still gets saved.
  const persist = (() => {
    let timer = 0;
    const run = () => {
      timer = 0;
      if (!settings.preserveLog || destroyed) return;
      sendMessage({ type: 'persist', entries: store.snapshot() });
    };
    const fn = () => { if (!timer) timer = setTimeout(run, 1500); };
    fn.flush = () => { clearTimeout(timer); run(); };
    fn.cancel = () => { clearTimeout(timer); timer = 0; };
    return fn;
  })();

  // ---------- badge ----------
  let badgeTimer = 0;
  const updateBadge = () => {
    if (badgeTimer) return;
    badgeTimer = setTimeout(() => {
      badgeTimer = 0;
      sendMessage({ type: 'badge', count: store.size });
    }, 700);
  };

  store.subscribe((type) => {
    if (settings.preserveLog) persist();
    if (type === 'add' || type === 'reset' || type === 'remove') updateBadge();
  });

  // ---------- panel ----------
  function ensurePanel() {
    if (panel) return panel;
    panel = new NM.Panel({
      store,
      settings,
      onSettings: saveSettings,
      onClose: () => setVisible(false),
      onRecording: (on) => { store.recording = on; sendConfig(); },
      onClear: () => {
        store.clear();
        persist.cancel();
        sendMessage({ type: 'clear-persisted' });
      },
    });
    return panel;
  }

  function setVisible(v) {
    visible = v;
    if (v) {
      const show = () => { if (visible && !destroyed) ensurePanel().show(); };
      if (document.documentElement) show();
      else document.addEventListener('DOMContentLoaded', show, { once: true });
    } else if (panel) {
      panel.hide();
    }
    sendMessage({ type: 'set-visible', visible: v });
  }

  // Re-attach the panel if the page wipes it out (e.g. document.open / aggressive SPA roots).
  const keepAlive = new MutationObserver(() => {
    if (visible && panel && !panel.host.isConnected && document.documentElement) {
      document.documentElement.appendChild(panel.host);
    }
  });
  const observeRoot = () => {
    if (document.documentElement) keepAlive.observe(document.documentElement, { childList: true });
  };
  if (document.documentElement) observeRoot();
  else document.addEventListener('DOMContentLoaded', observeRoot, { once: true });

  // ---------- background messages ----------
  const onRuntimeMessage = (msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'ping') { sendResponse({ ok: true }); return; }
    if (msg.type === 'toggle-panel') {
      setVisible(!visible);
      sendResponse({ visible });
    }
  };
  try { chrome.runtime.onMessage.addListener(onRuntimeMessage); } catch { /* ignore */ }

  const onPageHide = () => { if (settings.preserveLog) persist.flush(); };
  window.addEventListener('pagehide', onPageHide);

  // ---------- boot ----------
  Promise.all([loadSettings(), sendMessage({ type: 'init' })]).then(([, state]) => {
    if (destroyed) return;
    if (settings.preserveLog && state && Array.isArray(state.entries)) store.restore(state.entries);
    else if (!settings.preserveLog) sendMessage({ type: 'clear-persisted' });
    updateBadge();
    if (state && state.visible) {
      // Restore the panel after a reload — wait for the DOM so we don't race page hydration.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setVisible(true), { once: true });
      } else setVisible(true);
    }
  });

  NM.app = {
    store,
    destroy() {
      destroyed = true;
      document.removeEventListener('__netmon:event', onBridgeEvent);
      window.removeEventListener('pagehide', onPageHide);
      keepAlive.disconnect();
      persist.cancel();
      try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch { /* ignore */ }
      try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* ignore */ }
      if (panel) panel.destroy();
    },
  };
})();
