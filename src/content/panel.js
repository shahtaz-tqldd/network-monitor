/* Panel shell: title bar, toolbar, request list, detail pane, status bar. */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});
  const { h, formatBytes, formatDuration, splitUrl, copyText, downloadText, debounce } = NM.util;
  const I = NM.icons;
  const { statusInfo, methodLabel, isStream } = NM;

  const TYPE_FILTERS = [
    ['all', 'All'],
    ['fetch', 'Fetch'],
    ['xhr', 'XHR'],
    ['ws', 'WebSocket', 'WS'],
    ['sse', 'SSE'],
  ];

  const isFailure = (e) => {
    if (e.state === 'error' || e.state === 'aborted') return true;
    if (isStream(e)) return e.state === 'closed' && e.wasClean === false;
    return typeof e.status === 'number' && (e.status >= 400 || e.status === 0) && e.state !== 'pending';
  };

  class Panel {
    /**
     * @param {object} opts
     * @param {NM.Store} opts.store
     * @param {object} opts.settings  { theme, preserveLog, filter, layout }
     * @param {(patch: object) => void} opts.onSettings
     * @param {() => void} opts.onClose
     * @param {(recording: boolean) => void} opts.onRecording
     * @param {() => void} opts.onClear
     */
    constructor({ store, settings, onSettings, onClose, onRecording, onClear }) {
      this.store = store;
      this.settings = settings;
      this.onSettings = onSettings;
      this.onClose = onClose;
      this.onRecording = onRecording;
      this.onClear = onClear;

      this.visible = false;
      this.selectedId = null;
      this.rows = new Map(); // id -> row element
      this.query = '';
      this.errorsOnly = false;
      this.pending = { rebuild: true, adds: [], updates: new Set(), detail: false, removes: [] };
      this.raf = 0;

      this.buildDom();
      this.unsubscribe = store.subscribe((type, entry) => this.onStoreEvent(type, entry));
    }

    // ---------- DOM ----------

    buildDom() {
      this.host = document.createElement('netmon-root');
      this.host.setAttribute('data-netmon', '');
      this.host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.append(h('style', { text: NM.styles }));

      const p = (this.panel = h('div.nm-panel', { role: 'dialog', 'aria-label': 'Network monitor', tabindex: '-1' }));
      p.dataset.theme = this.settings.theme || 'dark';

      // Title bar
      this.themeBtn = h('button.nm-icon-btn', { title: 'Toggle theme', 'aria-label': 'Toggle theme', onclick: () => this.toggleTheme() });
      this.maxBtn = h('button.nm-icon-btn', { title: 'Maximize (double-click title bar)', 'aria-label': 'Maximize', onclick: () => this.layout.toggleMaximize() });
      this.dockBtns = {};
      const seg = h('div.nm-seg', { role: 'group', 'aria-label': 'Panel position' });
      for (const [mode, icon, label] of [['float', I.float, 'Floating'], ['right', I.dockRight, 'Dock to right'], ['bottom', I.dockBottom, 'Dock to bottom']]) {
        const b = h('button.nm-icon-btn', { title: label, 'aria-label': label, html: icon, onclick: () => this.layout.setMode(mode) });
        this.dockBtns[mode] = b;
        seg.append(b);
      }
      this.titlebar = h('header.nm-titlebar', null,
        h('div.nm-brand', null,
          h('span.nm-logo', { html: I.logo }),
          h('span.nm-title', { text: 'Network Monitor' }),
          h('span.nm-host', { text: location.host || location.protocol, title: location.href })),
        h('span.nm-spacer'),
        h('button.nm-icon-btn', { title: 'Export visible requests as HAR', 'aria-label': 'Export HAR', html: I.download, onclick: () => this.exportHar() }),
        seg,
        this.maxBtn,
        this.themeBtn,
        h('button.nm-icon-btn.danger', { title: 'Close (Alt+Shift+N)', 'aria-label': 'Close panel', html: I.x, onclick: () => this.onClose() }),
      );

      // Toolbar
      this.recBtn = h('button.nm-btn.rec', { onclick: () => this.setRecording(!this.store.recording) });
      const clearBtn = h('button.nm-btn', { title: 'Clear all captured requests (Ctrl+L)', html: `${I.clear}<span class="lbl">Clear</span>`, onclick: () => this.clearAll() });

      this.searchInput = h('input', { type: 'search', placeholder: 'Filter requests', title: 'Matches URL, method, status. Prefix a term with - to exclude it.', spellcheck: 'false', 'aria-label': 'Filter requests' });
      this.searchClear = h('button.nm-icon-btn', { title: 'Clear filter', 'aria-label': 'Clear filter', html: I.x, hidden: true });
      const applySearch = debounce(() => { this.query = this.searchInput.value.trim(); this.scheduleRebuild(); }, 120);
      this.searchInput.addEventListener('input', () => { this.searchClear.hidden = !this.searchInput.value; applySearch(); });
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.searchInput.value) { e.stopPropagation(); this.searchClear.click(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); this.list.focus(); this.moveSelection(1); }
      });
      this.searchClear.addEventListener('click', () => { this.searchInput.value = ''; this.searchClear.hidden = true; applySearch.flush(); this.searchInput.focus(); });
      const search = h('div.nm-search', { html: I.search.replace('<svg', '<svg class="lead"') }, this.searchInput, this.searchClear);

      this.chips = h('div.nm-chips', { role: 'group', 'aria-label': 'Request type' });
      this.chipEls = {};
      for (const [id, label, short] of TYPE_FILTERS) {
        const count = h('span.count');
        const text = short ? [h('span.full', { text: label }), h('span.short', { text: short })] : [label];
        const chip = h('button.nm-chip', { 'aria-pressed': 'false', title: label, onclick: () => this.setFilter(id) }, ...text, count);
        chip._count = count;
        this.chipEls[id] = chip;
        this.chips.append(chip);
      }
      this.errChip = h('button.nm-chip.err', { 'aria-pressed': 'false', title: 'Show only failed requests (4xx, 5xx, network errors)', onclick: () => {
        this.errorsOnly = !this.errorsOnly;
        this.errChip.setAttribute('aria-pressed', String(this.errorsOnly));
        this.scheduleRebuild();
      } }, 'Errors');
      this.errChip._count = h('span.count');
      this.errChip.append(this.errChip._count);
      const errWrap = h('div.nm-chips', null, this.errChip);

      this.preserveInput = h('input', { type: 'checkbox' });
      this.preserveInput.checked = !!this.settings.preserveLog;
      this.preserveInput.addEventListener('change', () => this.onSettings({ preserveLog: this.preserveInput.checked }));
      const preserve = h('label.nm-switch', { title: 'Keep requests across page reloads and navigations' },
        this.preserveInput, h('span.track'), h('span', { text: 'Preserve log' }));

      this.toolbar = h('div.nm-toolbar', null, this.recBtn, clearBtn, search, this.chips, errWrap, h('span.nm-spacer'), preserve);

      // Body
      this.list = h('div.nm-list', { role: 'listbox', tabindex: '0', 'aria-label': 'Requests' });
      this.listPane = h('div.nm-list-pane', null,
        h('div.nm-cols', null,
          h('span.c-status', { text: 'Status' }), h('span.c-method', { text: 'Method' }), h('span.c-name', { text: 'Name' }),
          h('span.c-type', { text: 'Type' }), h('span.c-size.r', { text: 'Size' }), h('span.c-time.r', { text: 'Time' })),
        this.list);
      this.splitter = h('div.nm-splitter', { title: 'Drag to resize · double-click to reset', role: 'separator', 'aria-orientation': 'vertical' });
      this.detailPane = h('div.nm-detail-pane');
      this.bodyEl = h('div.nm-body', null, this.listPane, this.splitter, this.detailPane);

      this.statusbar = h('footer.nm-statusbar');
      this.toastEl = h('div.nm-toast', { role: 'status', 'aria-live': 'polite' });

      p.append(this.titlebar, this.toolbar, this.bodyEl, this.statusbar, this.toastEl);
      this.shadow.append(p);

      this.details = new NM.Details({
        container: this.detailPane,
        onClose: () => this.select(null),
        toast: (m) => this.toast(m),
        copy: (text, msg) => this.copy(text, msg),
      });
      this.details.onClearFrames = (id) => this.store.clearFrames(id);

      this.layout = new NM.Layout({
        panel: p, titlebar: this.titlebar, body: this.bodyEl, splitter: this.splitter,
        onChange: debounce((state) => this.onSettings({ layout: { ...state, float: { ...state.float } } }), 300),
        onModeChange: () => this.syncLayoutButtons(),
      });

      this.list.addEventListener('click', (e) => {
        const row = e.target.closest('.nm-row');
        if (row) this.select(row.dataset.id === this.selectedId ? null : row.dataset.id);
      });

      this.bindKeys();
      this.syncChrome();
    }

    bindKeys() {
      // Keep keystrokes inside the panel from triggering the page's own shortcuts.
      for (const type of ['keydown', 'keyup', 'keypress']) {
        this.panel.addEventListener(type, (e) => e.stopPropagation());
      }
      this.panel.addEventListener('keydown', (e) => {
        const inInput = e.composedPath()[0]?.tagName === 'INPUT';
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); this.searchInput.focus(); this.searchInput.select(); return; }
        if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); this.clearAll(); return; }
        if (inInput) return;
        if (e.key === '/') { e.preventDefault(); this.searchInput.focus(); return; }
        if (e.key === 'Escape') {
          if (this.selectedId) { e.preventDefault(); this.select(null); this.list.focus(); }
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const path = e.composedPath();
          if (path.includes(this.list) || path.includes(this.panel) && !path.includes(this.detailPane)) {
            e.preventDefault();
            this.moveSelection(e.key === 'ArrowDown' ? 1 : -1);
          }
        }
        if ((e.key === 'Home' || e.key === 'End') && e.composedPath().includes(this.list)) {
          e.preventDefault();
          const rows = this.list.querySelectorAll('.nm-row');
          const row = e.key === 'Home' ? rows[0] : rows[rows.length - 1];
          if (row) this.select(row.dataset.id, true);
        }
      });
    }

    mount() {
      const root = document.documentElement;
      if (!root) return false;
      // Remove a stale panel left behind by a previous (reloaded) extension instance.
      document.querySelectorAll('netmon-root').forEach((el) => { if (el !== this.host) el.remove(); });
      if (!this.host.isConnected) root.appendChild(this.host);
      this.layout.load(this.settings.layout);
      this.syncLayoutButtons();
      return true;
    }

    show() {
      if (!this.mount()) return false;
      this.visible = true;
      this.panel.style.display = '';
      this.layout.apply();
      this.pending.rebuild = true;
      this.pending.detail = true;
      this.flush();
      return true;
    }

    hide() {
      this.visible = false;
      this.panel.style.display = 'none';
    }

    destroy() {
      this.unsubscribe();
      this.layout.destroy();
      this.host.remove();
    }

    // ---------- state sync ----------

    syncChrome() {
      const rec = this.store.recording;
      this.recBtn.setAttribute('aria-pressed', String(rec));
      this.recBtn.title = rec ? 'Stop recording' : 'Start recording';
      this.recBtn.innerHTML = `${I.record}<span class="lbl">${rec ? 'Recording' : 'Paused'}</span>`;
      const f = this.settings.filter || 'all';
      for (const [id, chip] of Object.entries(this.chipEls)) chip.setAttribute('aria-pressed', String(id === f));
      this.themeBtn.innerHTML = this.panel.dataset.theme === 'light' ? I.moon : I.sun;
    }

    syncLayoutButtons() {
      const s = this.layout.state;
      for (const [mode, b] of Object.entries(this.dockBtns)) b.setAttribute('aria-pressed', String(s.mode === mode));
      this.maxBtn.hidden = s.mode !== 'float';
      this.maxBtn.innerHTML = s.maximized ? I.restore : I.maximize;
      this.maxBtn.title = s.maximized ? 'Restore (double-click title bar)' : 'Maximize (double-click title bar)';
    }

    setSettings(settings) {
      this.settings = settings;
      this.panel.dataset.theme = settings.theme || 'dark';
      this.preserveInput.checked = !!settings.preserveLog;
      this.syncChrome();
    }

    toggleTheme() {
      const theme = this.panel.dataset.theme === 'light' ? 'dark' : 'light';
      this.panel.dataset.theme = theme;
      this.onSettings({ theme });
      this.syncChrome();
    }

    setFilter(filter) {
      this.onSettings({ filter });
      this.settings.filter = filter;
      this.syncChrome();
      this.scheduleRebuild();
    }

    setRecording(on) {
      this.onRecording(on);
      this.syncChrome();
      this.scheduleStatus();
    }

    clearAll() {
      this.onClear();
      this.toast('Cleared');
    }

    // ---------- filtering ----------

    matches(e) {
      const f = this.settings.filter || 'all';
      if (f !== 'all' && e.kind !== f) return false;
      if (this.errorsOnly && !isFailure(e)) return false;
      if (this.query) {
        const hay = `${e.method} ${e.url} ${e.status ?? ''} ${e.kind} ${e.state}`.toLowerCase();
        for (const raw of this.query.toLowerCase().split(/\s+/)) {
          if (!raw) continue;
          if (raw.startsWith('-') && raw.length > 1) { if (hay.includes(raw.slice(1))) return false; } else if (!hay.includes(raw)) return false;
        }
      }
      return true;
    }

    // ---------- store events / batching ----------

    onStoreEvent(type, entry) {
      const p = this.pending;
      if (!this.visible) {
        // Nothing is rendered while hidden — just rebuild everything when shown again.
        p.rebuild = true;
        p.adds = [];
        p.removes = [];
        p.updates.clear();
        if (this.selectedId && (type === 'reset' || type === 'remove') && !this.store.get(this.selectedId)) this.select(null);
        return;
      }
      if (type === 'reset') {
        p.rebuild = true;
        if (this.selectedId && !this.store.get(this.selectedId)) this.select(null);
      } else if (type === 'add') p.adds.push(entry);
      else if (type === 'update' || type === 'frame') {
        p.updates.add(entry.id);
        if (entry.id === this.selectedId) p.detail = true;
      } else if (type === 'frames-cleared') {
        if (entry.id === this.selectedId) p.detail = true;
      } else if (type === 'remove') {
        p.removes.push(entry.id);
        if (entry.id === this.selectedId) this.select(null);
      }
      this.schedule();
    }

    schedule() {
      if (!this.visible || this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.flush(); });
      // rAF does not fire in background tabs; make sure we still flush eventually.
      clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; this.flush(); } }, 250);
    }

    scheduleRebuild() { this.pending.rebuild = true; this.schedule(); }
    scheduleStatus() { this.schedule(); }

    flush() {
      if (!this.visible) return;
      const p = this.pending;
      const atBottom = this.isAtBottom();

      if (p.rebuild) {
        this.rebuildList();
      } else {
        for (const id of p.removes) {
          const row = this.rows.get(id);
          if (row) { row.remove(); this.rows.delete(id); }
        }
        if (p.adds.length) {
          const frag = document.createDocumentFragment();
          for (const e of p.adds) {
            if (!this.store.get(e.id) || this.rows.has(e.id) || !this.matches(e)) continue;
            const row = this.createRow(e);
            row.classList.add('is-new');
            frag.append(row);
          }
          if (frag.childNodes.length) {
            this.list.querySelector('.nm-empty')?.remove();
            this.list.append(frag);
          }
        }
        let needRebuild = false;
        for (const id of p.updates) {
          const e = this.store.get(id);
          if (!e) continue;
          const row = this.rows.get(id);
          const ok = this.matches(e);
          if (row && ok) this.updateRow(row, e);
          else if (row && !ok) { row.remove(); this.rows.delete(id); }
          else if (!row && ok) needRebuild = true; // became visible (e.g. now an error) — keep order correct
        }
        if (needRebuild) this.rebuildList();
        else if (!this.rows.size) this.renderEmpty();
      }

      if (atBottom && (p.adds.length || p.rebuild)) this.list.scrollTop = this.list.scrollHeight;

      if (p.detail && this.selectedId) {
        const e = this.store.get(this.selectedId);
        if (e) { this.details.entry = e; this.details.refresh(); }
      }

      p.rebuild = false;
      p.adds = [];
      p.removes = [];
      p.updates.clear();
      p.detail = false;
      this.renderStatus();
    }

    isAtBottom() {
      const l = this.list;
      return l.scrollHeight - l.scrollTop - l.clientHeight < 48;
    }

    rebuildList() {
      this.list.textContent = '';
      this.rows.clear();
      const frag = document.createDocumentFragment();
      for (const e of this.store.entries.values()) {
        if (!this.matches(e)) continue;
        frag.append(this.createRow(e));
      }
      this.list.append(frag);
      if (!this.rows.size) this.renderEmpty();
    }

    renderEmpty() {
      if (this.list.querySelector('.nm-empty')) return;
      let el;
      if (this.store.size) {
        el = h('div.nm-empty', null,
          h('div.art', { html: I.filterOff }),
          h('h3', { text: 'No matching requests' }),
          h('p', { text: 'Nothing captured so far matches the current filters.' }),
          h('div.actions', null, h('button.nm-btn', { text: 'Clear filters', onclick: () => this.resetFilters() })));
      } else if (!this.store.recording) {
        el = h('div.nm-empty', null,
          h('div.art', { html: I.pause }),
          h('h3', { text: 'Recording is paused' }),
          h('p', { text: 'New network activity is being ignored.' }),
          h('div.actions', null, h('button.nm-btn', { html: `${I.record}<span>Resume recording</span>`, onclick: () => this.setRecording(true) })));
      } else {
        const p = h('p', null, 'Fetch, XHR, WebSocket and EventSource traffic from this page will appear here. Toggle this panel with ', h('span.nm-kbd', { text: 'Alt+Shift+N' }), '.');
        el = h('div.nm-empty', null,
          h('div.art', { html: I.logo }),
          h('h3', { text: 'Listening for network activity…' }),
          p,
          h('div.actions', null, h('button.nm-btn', { html: `${I.reload}<span>Reload page</span>`, onclick: () => location.reload() })));
      }
      this.list.append(el);
    }

    resetFilters() {
      this.errorsOnly = false;
      this.errChip.setAttribute('aria-pressed', 'false');
      this.searchInput.value = '';
      this.searchClear.hidden = true;
      this.query = '';
      this.setFilter('all');
    }

    // ---------- rows ----------

    createRow(e) {
      const row = h('div.nm-row', { role: 'option', dataset: { id: e.id } },
        h('span.c-status'), h('span.c-method'), h('span.c-name', null, h('span.name'), h('span.host')),
        h('span.c-type'), h('span.c-size.r'), h('span.c-time.r'));
      if (e.preserved) row.classList.add('preserved');
      this.updateRow(row, e, true);
      this.rows.set(e.id, row);
      return row;
    }

    updateRow(row, e, initial) {
      const [st, me, nm, ty, sz, tm] = row.children;
      const s = statusInfo(e);
      if (initial || row._s !== s.label + s.cls) {
        row._s = s.label + s.cls;
        st.innerHTML = '';
        st.append(h('span', { class: `nm-status-pill ${s.cls}`, text: s.label, title: s.long }));
      }
      if (initial) {
        const ml = methodLabel(e);
        me.append(h('span', { class: `nm-method m-${ml}`, text: ml }));
        const u = splitUrl(e.url);
        nm.children[0].textContent = u.name || e.url;
        nm.children[1].textContent = u.host + (u.path.length > 1 ? u.path : '');
        row.title = e.url;
        ty.textContent = e.kind;
      }
      row.classList.toggle('is-error', isFailure(e));
      row.classList.toggle('selected', e.id === this.selectedId);
      row.setAttribute('aria-selected', String(e.id === this.selectedId));

      if (isStream(e)) {
        sz.textContent = e.kind === 'ws' ? `↑${e.framesOut || 0} ↓${e.framesIn || 0}` : `↓${e.framesIn || 0}`;
        sz.title = `${formatBytes(e.bytesTransferred || 0)} transferred`;
        tm.textContent = e.state === 'open' ? 'live' : e.duration != null ? formatDuration(e.duration) : '…';
      } else {
        sz.textContent = e.size != null ? formatBytes(e.size) : e.state === 'pending' ? '…' : '—';
        tm.textContent = e.duration != null ? formatDuration(e.duration) : e.state === 'pending' ? '…' : '—';
      }
    }

    select(id, scroll) {
      const prev = this.selectedId && this.rows.get(this.selectedId);
      if (prev) { prev.classList.remove('selected'); prev.setAttribute('aria-selected', 'false'); }
      this.selectedId = id;
      const entry = id ? this.store.get(id) : null;
      if (!entry) {
        this.selectedId = null;
        this.details.hide();
        this.bodyEl.classList.remove('has-detail');
        return;
      }
      const row = this.rows.get(id);
      if (row) {
        row.classList.add('selected');
        row.setAttribute('aria-selected', 'true');
        if (scroll) row.scrollIntoView({ block: 'nearest' });
      }
      this.bodyEl.classList.add('has-detail');
      this.details.show(entry);
    }

    moveSelection(delta) {
      const rows = [...this.list.querySelectorAll('.nm-row')];
      if (!rows.length) return;
      let idx = rows.findIndex((r) => r.dataset.id === this.selectedId);
      idx = idx === -1 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, idx + delta));
      this.select(rows[idx].dataset.id, true);
    }

    // ---------- status bar ----------

    renderStatus() {
      const all = this.store.all();
      const counts = { all: all.length, fetch: 0, xhr: 0, ws: 0, sse: 0 };
      let bytes = 0;
      let errors = 0;
      for (const e of all) {
        counts[e.kind] = (counts[e.kind] || 0) + 1;
        bytes += isStream(e) ? e.bytesTransferred || 0 : e.size || 0;
        if (isFailure(e)) errors++;
      }
      for (const [id, chip] of Object.entries(this.chipEls)) chip._count.textContent = counts[id] ? String(counts[id]) : '';
      this.errChip._count.textContent = errors ? String(errors) : '';

      const shown = this.rows.size;
      const sb = this.statusbar;
      sb.textContent = '';
      sb.append(
        h(`span.rec-dot${this.store.recording ? '' : '.paused'}`, { text: this.store.recording ? 'Recording' : 'Paused' }),
        h('span', null, h('b', { text: shown === all.length ? String(all.length) : `${shown} / ${all.length}` }), ` request${all.length === 1 ? '' : 's'}`),
        h('span', null, h('b', { text: formatBytes(bytes) }), ' captured'),
      );
      if (errors) sb.append(h('span.err-count', { text: `${errors} failed` }));
      sb.append(h('span.hint', { text: '↑↓ navigate · / search · Esc close details' }));
    }

    // ---------- misc ----------

    toast(msg) {
      const t = this.toastEl;
      t.innerHTML = `${I.check}<span></span>`;
      t.lastChild.textContent = msg;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
    }

    async copy(text, msg) {
      const ok = await copyText(text ?? '', this.shadow);
      this.toast(ok ? msg || 'Copied' : 'Copy failed');
    }

    exportHar() {
      const entries = this.store.all().filter((e) => this.matches(e));
      if (!entries.length) { this.toast('Nothing to export'); return; }
      const har = NM.toHar(entries);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadText(`${(location.host || 'page').replace(/[^\w.-]/g, '_')}-${stamp}.har`, JSON.stringify(har, null, 2));
      this.toast(`Exported ${entries.length} request${entries.length === 1 ? '' : 's'}`);
    }
  }

  /** Build a HAR 1.2 log (WebSocket messages use Chrome's `_webSocketMessages` extension). */
  NM.toHar = function toHar(entries) {
    const toNv = (pairs) => (pairs || []).map(([name, value]) => ({ name, value: String(value) }));
    return {
      log: {
        version: '1.2',
        creator: { name: 'Network Monitor (Chrome extension)', version: chrome.runtime.getManifest?.().version || '2' },
        pages: [],
        entries: entries.map((e) => {
          const u = splitUrl(e.url);
          const reqCt = (e.requestHeaders || []).find(([k]) => k.toLowerCase() === 'content-type');
          const rb = e.requestBody;
          const entry = {
            startedDateTime: new Date(e.startTime).toISOString(),
            time: e.duration || 0,
            _resourceType: e.kind === 'ws' ? 'websocket' : e.kind === 'sse' ? 'eventsource' : e.kind,
            request: {
              method: e.method || 'GET', url: e.url, httpVersion: 'HTTP/1.1',
              headers: toNv(e.requestHeaders), queryString: toNv(u.params), cookies: [],
              headersSize: -1, bodySize: rb && rb.size != null ? rb.size : -1,
            },
            response: {
              status: e.status || 0, statusText: e.statusText || '', httpVersion: 'HTTP/1.1',
              headers: toNv(e.responseHeaders), cookies: [], redirectURL: e.finalUrl || '',
              headersSize: -1, bodySize: e.size ?? -1,
              content: {
                size: e.size ?? 0, mimeType: e.mimeType || 'x-unknown',
                ...(e.responseBody && e.responseBody.text != null ? { text: e.responseBody.text } : {}),
                ...(e.responseBody && e.responseBody.note ? { comment: e.responseBody.note } : {}),
              },
            },
            cache: {},
            timings: { send: 0, wait: e.ttfb || 0, receive: Math.max(0, (e.duration || 0) - (e.ttfb || 0)) },
          };
          if (rb) {
            entry.request.postData = rb.kind === 'form-data'
              ? { mimeType: 'multipart/form-data', params: toNv(rb.entries) }
              : { mimeType: reqCt ? reqCt[1] : 'text/plain', text: rb.text ?? rb.note ?? '' };
          }
          if (e.frames) {
            entry._webSocketMessages = e.frames.map((f) => ({
              type: f.dir === 'out' ? 'send' : 'receive', time: f.time / 1000, opcode: f.binary ? 2 : 1, data: f.data,
            }));
          }
          if (e.error) entry.comment = e.error;
          return entry;
        }),
      },
    };
  };

  NM.Panel = Panel;
})();
