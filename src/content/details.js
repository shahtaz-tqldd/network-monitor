/* Right-hand detail pane: headers / payload / response / timing / socket messages. */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});
  const {
    h, formatBytes, formatDuration, formatClock, splitUrl, tryParseJson, highlightJson,
    parseUrlEncoded, toCurl, bodyAsText,
  } = NM.util;
  const I = NM.icons;

  const HIGHLIGHT_LIMIT = 400_000; // skip syntax highlighting for very large bodies
  const MAX_FRAME_ROWS = 500;

  const isStream = (e) => e.kind === 'ws' || e.kind === 'sse';

  function statusInfo(e) {
    if (isStream(e)) {
      const labels = { connecting: 'Connecting', open: 'Open', closed: 'Closed' };
      const long = labels[e.state] || String(e.state);
      if (e.state === 'open') return { cls: 's-open', label: e.status ? String(e.status) : 'Open', long };
      if (e.state === 'connecting') return { cls: 's-connecting', label: long, long };
      const failed = e.wasClean === false || (e.kind === 'sse' && e.error && e.error !== 'Connection closed');
      return { cls: failed ? 's-error' : 's-closed', label: long, long };
    }
    if (e.state === 'pending' && !e.status) return { cls: 's-pending', label: 'Pending', long: 'Pending' };
    if (e.state === 'aborted') return { cls: 's-error', label: 'Aborted', long: 'Aborted' };
    if (e.state === 'error' && !e.status) return { cls: 's-error', label: 'Failed', long: e.error || 'Failed' };
    const s = e.status;
    const cls = s === 0 ? 's-error' : s < 300 ? 's-ok' : s < 400 ? 's-redirect' : s < 500 ? 's-client' : 's-server';
    return { cls, label: String(s), long: `${s}${e.statusText ? ` ${e.statusText}` : ''}` };
  }

  function methodLabel(e) {
    return e.kind === 'ws' ? 'WS' : e.kind === 'sse' ? 'SSE' : e.method;
  }

  class Details {
    constructor({ container, onClose, toast, copy }) {
      this.container = container;
      this.onClose = onClose;
      this.toast = toast;
      this.copy = copy;
      this.entry = null;
      this.tab = 'headers';
      this.lastHttpTab = 'headers';
      this.lastStreamTab = 'messages';
      this.pretty = true;
      this.wrap = false;
      this.collapsed = new Set();
      this.msgFilter = { text: '', dir: 'all' };
      this.openFrames = new Set();

      this.head = h('div.nm-detail-head');
      this.tabs = h('div.nm-tabs', { role: 'tablist' });
      this.body = h('div.nm-detail-body');
      container.append(this.head, this.tabs, this.body);
    }

    show(entry) {
      const changed = !this.entry || this.entry.id !== entry.id;
      this.entry = entry;
      if (changed) {
        this.openFrames.clear();
        this.tab = isStream(entry) ? this.lastStreamTab : this.lastHttpTab;
        if (!this.tabList().some((t) => t.id === this.tab)) this.tab = 'headers';
      }
      this.render(changed);
    }

    hide() { this.entry = null; }

    /** Called (throttled) when the shown entry changes. */
    refresh() {
      if (!this.entry) return;
      if (this.tab === 'messages') {
        this.renderHead();
        this.renderTabs();
        this.syncMessages();
        return;
      }
      this.render(false);
    }

    tabList() {
      const e = this.entry;
      if (isStream(e)) {
        return [
          { id: 'messages', label: 'Messages', badge: (e.framesIn || 0) + (e.framesOut || 0) },
          { id: 'headers', label: 'Overview' },
          { id: 'timing', label: 'Timing' },
        ];
      }
      const hasPayload = !!(e.requestBody || splitUrl(e.url).params.length);
      return [
        { id: 'headers', label: 'Headers' },
        { id: 'payload', label: 'Payload', dot: hasPayload },
        { id: 'response', label: 'Response' },
        { id: 'timing', label: 'Timing' },
      ];
    }

    render(resetScroll) {
      const scroll = resetScroll ? 0 : this.body.scrollTop;
      this.renderHead();
      this.renderTabs();
      this.body.textContent = '';
      this.body.style.padding = this.tab === 'messages' ? '0' : '';
      const fn = {
        headers: () => this.renderHeaders(),
        payload: () => this.renderPayload(),
        response: () => this.renderResponse(),
        timing: () => this.renderTiming(),
        messages: () => this.renderMessages(),
      }[this.tab];
      if (fn) fn();
      if (this.tab !== 'messages') this.body.scrollTop = scroll;
    }

    renderHead() {
      const e = this.entry;
      const st = statusInfo(e);
      const http = !isStream(e);
      this.head.textContent = '';
      this.head.append(...[
        h('span', { class: `nm-method m-${methodLabel(e)}`, text: methodLabel(e) }),
        h('span', { class: `nm-status-pill ${st.cls}`, text: st.label }),
        h('span.url', { title: e.url, text: e.url }),
        h('button.nm-icon-btn', { title: 'Copy URL', 'aria-label': 'Copy URL', html: I.link, onclick: () => this.copy(e.url, 'URL copied') }),
        http && h('button.nm-icon-btn', { title: 'Copy as cURL', 'aria-label': 'Copy as cURL', html: I.terminal, onclick: () => this.copy(toCurl(e), 'cURL copied') }),
        h('button.nm-icon-btn', { title: 'Close details (Esc)', 'aria-label': 'Close details', html: I.x, onclick: () => this.onClose() }),
      ].filter(Boolean));
    }

    renderTabs() {
      this.tabs.textContent = '';
      for (const t of this.tabList()) {
        const btn = h('button.nm-tab', {
          role: 'tab', 'aria-selected': String(this.tab === t.id),
          onclick: () => {
            if (this.tab === t.id) return;
            this.tab = t.id;
            if (isStream(this.entry)) this.lastStreamTab = t.id; else this.lastHttpTab = t.id;
            this.render(true);
          },
        }, t.label);
        if (t.badge) btn.append(h('span.badge', { text: t.badge > 9999 ? '9999+' : String(t.badge) }));
        if (t.dot) btn.append(h('span', { style: 'width:5px;height:5px;border-radius:50%;background:var(--accent)' }));
        this.tabs.append(btn);
      }
    }

    // ---------- building blocks ----------

    section(title, rows, { count, copyText, note, empty } = {}) {
      const det = h('details.nm-section', { open: !this.collapsed.has(title) });
      det.addEventListener('toggle', () => {
        if (det.open) this.collapsed.delete(title); else this.collapsed.add(title);
      });
      const summary = h('summary', null, title);
      if (count != null) summary.append(h('span.count', { text: `(${count})` }));
      if (copyText) {
        summary.append(h('span.nm-spacer'), h('button.nm-icon-btn', {
          title: `Copy ${title.toLowerCase()}`, html: I.copy,
          onclick: (ev) => { ev.preventDefault(); this.copy(copyText, 'Copied'); },
        }));
      }
      det.append(summary);
      if (rows && rows.length) {
        const kv = h('div.nm-kv');
        for (const [k, v] of rows) {
          kv.append(h('div.k', { text: k }), h(`div.v${v == null || v === '' ? '.dim' : ''}`, { text: v == null || v === '' ? '(empty)' : String(v) }));
        }
        det.append(kv);
      } else if (empty) {
        det.append(h('div.note', { text: empty }));
      }
      if (note) det.append(h('div.note', { text: note }));
      return det;
    }

    codeBlock({ label, text, mime, truncated, extraMeta }) {
      const wrapEl = h('div');
      const json = text != null && text.length <= 5_000_000 ? tryParseJson(text) : undefined;
      const isJson = json !== undefined;

      const draw = () => {
        wrapEl.textContent = '';
        const bar = h('div.nm-code-toolbar');
        bar.append(h('span.label', { text: label }));
        const meta = [mime, text != null ? formatBytes(text.length) : null, extraMeta].filter(Boolean).join(' · ');
        if (meta) bar.append(h('span.meta', { text: meta }));
        bar.append(h('span.nm-spacer'));
        if (isJson) {
          bar.append(h('button.nm-btn', {
            'aria-pressed': String(this.pretty), title: 'Toggle pretty print', html: `${I.braces}<span>${this.pretty ? 'Pretty' : 'Raw'}</span>`,
            onclick: () => { this.pretty = !this.pretty; draw(); },
          }));
        }
        bar.append(
          h('button.nm-btn', {
            'aria-pressed': String(this.wrap), title: 'Toggle line wrap', html: `${I.wrap}<span>${this.wrap ? 'Wrap' : 'No wrap'}</span>`,
            onclick: () => { this.wrap = !this.wrap; draw(); },
          }),
          h('button.nm-btn', {
            title: 'Copy to clipboard', html: `${I.copy}<span>Copy</span>`,
            onclick: () => this.copy(isJson && this.pretty ? JSON.stringify(json, null, 2) : text, 'Copied to clipboard'),
          }),
        );
        wrapEl.append(bar);
        if (truncated) {
          wrapEl.append(h('div.nm-banner', { text: 'Body was truncated — only the first 1 MB was captured.' }));
        }
        const pre = h(`pre.nm-code${this.wrap ? '.wrap' : ''}`);
        if (isJson && this.pretty) {
          if (text.length <= HIGHLIGHT_LIMIT) pre.innerHTML = highlightJson(json);
          else pre.textContent = JSON.stringify(json, null, 2);
        } else {
          pre.textContent = text;
        }
        wrapEl.append(pre);
      };
      draw();
      return wrapEl;
    }

    placeholder(icon, text) {
      return h('div.nm-placeholder', { html: icon }, h('div', { text }));
    }

    // ---------- tabs ----------

    renderHeaders() {
      const e = this.entry;
      const st = statusInfo(e);
      const b = this.body;
      if (e.error && (e.state === 'error' || e.state === 'aborted' || (isStream(e) && e.state === 'closed'))) {
        b.append(h('div.nm-banner.err', { text: e.error }));
      }

      if (isStream(e)) {
        const rows = [
          ['URL', e.url],
          ['Type', e.kind === 'ws' ? 'WebSocket' : 'Server-Sent Events (EventSource)'],
          ['State', st.long],
          ['Started', formatClock(e.startTime)],
          ['Connected in', e.ttfb != null ? formatDuration(e.ttfb) : null],
          ['Duration', e.duration != null ? formatDuration(e.duration) : e.state === 'open' ? 'Still open' : null],
          ['Messages sent', String(e.framesOut || 0)],
          ['Messages received', String(e.framesIn || 0)],
          ['Data transferred', formatBytes(e.bytesTransferred || 0)],
        ];
        if (e.kind === 'ws') {
          rows.splice(3, 0,
            ['Requested protocols', (e.protocols || []).join(', ') || null],
            ['Negotiated protocol', e.protocol || null],
            ['Extensions', e.extensions || null]);
          if (e.state === 'closed') {
            rows.push(['Close code', e.closeCode != null ? String(e.closeCode) : null], ['Close reason', e.closeReason || null], ['Clean close', e.wasClean == null ? null : e.wasClean ? 'Yes' : 'No']);
          }
        }
        b.append(this.section('General', rows));
        b.append(h('div.nm-placeholder', { style: 'padding:12px 16px' },
          h('div', { text: 'Handshake headers are managed by the browser and are not exposed to page scripts.' })));
        return;
      }

      const general = [
        ['Request URL', e.url],
        ['Request Method', e.method],
        ['Status Code', e.status ? st.long : e.state === 'pending' ? 'Pending' : st.long],
        ['Initiator', e.kind === 'fetch' ? 'fetch()' : 'XMLHttpRequest'],
        ['Started', formatClock(e.startTime)],
        ['Duration', e.duration != null ? formatDuration(e.duration) : null],
      ];
      if (e.finalUrl) general.splice(1, 0, ['Final URL (redirected)', e.finalUrl]);
      if (e.mimeType) general.push(['Content Type', e.mimeType]);
      if (e.size != null) general.push(['Size', formatBytes(e.size)]);
      b.append(this.section('General', general, { copyText: general.map(([k, v]) => `${k}: ${v ?? ''}`).join('\n') }));

      const resH = e.responseHeaders || [];
      b.append(this.section('Response Headers', resH, {
        count: resH.length,
        copyText: resH.length ? resH.map(([k, v]) => `${k}: ${v}`).join('\n') : null,
        empty: e.state === 'pending' ? 'Waiting for response…' : 'No response headers',
        note: resH.length && e.kind === 'fetch' && e.responseType === 'cors' ? 'Cross-origin response: only CORS-safelisted and exposed headers are visible.' : null,
      }));

      const reqH = e.requestHeaders || [];
      b.append(this.section('Request Headers', reqH, {
        count: reqH.length,
        copyText: reqH.length ? reqH.map(([k, v]) => `${k}: ${v}`).join('\n') : null,
        empty: 'No custom request headers',
        note: 'Shows headers set by the page. Headers added by the browser (Cookie, User-Agent, …) are not visible to scripts.',
      }));
    }

    renderPayload() {
      const e = this.entry;
      const b = this.body;
      const { params } = splitUrl(e.url);
      let any = false;

      if (params.length) {
        any = true;
        b.append(this.section('Query String Parameters', params, {
          count: params.length,
          copyText: params.map(([k, v]) => `${k}=${v}`).join('\n'),
        }));
      }

      const body = e.requestBody;
      if (body) {
        any = true;
        if (body.kind === 'form-data') {
          b.append(this.section('Form Data', body.entries || [], { count: (body.entries || []).length, copyText: bodyAsText(body), empty: 'Empty form' }));
        } else if (body.kind === 'urlencoded') {
          const pairs = parseUrlEncoded(body.text) || [];
          b.append(this.section('Form Data (URL-encoded)', pairs, { count: pairs.length, copyText: body.text }));
        } else if (body.kind === 'binary') {
          b.append(h('div.nm-banner', { text: body.note || 'Binary payload' }));
          if (body.text) b.append(this.codeBlock({ label: 'Hex preview', text: body.text }));
        } else {
          const ct = (e.requestHeaders || []).find(([k]) => k.toLowerCase() === 'content-type');
          const looksForm = ct && /x-www-form-urlencoded/i.test(ct[1]);
          if (looksForm) {
            const pairs = parseUrlEncoded(body.text) || [];
            b.append(this.section('Form Data (URL-encoded)', pairs, { count: pairs.length, copyText: body.text }));
          } else {
            b.append(this.codeBlock({
              label: 'Request Payload', text: body.text ?? '', truncated: body.truncated,
              mime: ct ? ct[1].split(';')[0] : null,
            }));
          }
        }
      }

      if (!any) b.append(this.placeholder(I.inbox, 'This request has no payload.'));
    }

    renderResponse() {
      const e = this.entry;
      const b = this.body;
      const body = e.responseBody;
      if (e.state === 'error' || e.state === 'aborted') {
        b.append(h('div.nm-banner.err', { text: e.error || 'Request failed' }));
      }
      if (!body) {
        if (e.state === 'pending') b.append(this.placeholder(I.history, e.status ? 'Receiving response body…' : 'Waiting for response…'));
        else if (e.state === 'done') b.append(this.placeholder(I.inbox, 'No response body.'));
        else if (!e.error) b.append(this.placeholder(I.inbox, 'No response data available.'));
        return;
      }
      if (body.kind === 'none' || body.kind === 'binary') {
        b.append(this.placeholder(I.inbox, body.note || 'Response body not available.'));
        return;
      }
      if (!body.text) {
        b.append(this.placeholder(I.inbox, 'Response body is empty.'));
        return;
      }
      b.append(this.codeBlock({ label: 'Response Body', text: body.text, truncated: body.truncated, mime: e.mimeType }));
    }

    renderTiming() {
      const e = this.entry;
      const sec = this.section('Timing', [
        ['Started at', `${new Date(e.startTime).toLocaleDateString()} ${formatClock(e.startTime)}`],
        [isStream(e) ? 'Connection' : 'Waiting (TTFB)', e.ttfb != null ? formatDuration(e.ttfb) : null],
        ...(isStream(e) ? [] : [['Content download', e.ttfb != null && e.duration != null ? formatDuration(Math.max(0, e.duration - e.ttfb)) : null]]),
        [isStream(e) ? 'Connection lifetime' : 'Total', e.duration != null ? formatDuration(e.duration) : e.state === 'pending' || e.state === 'open' ? 'In progress' : null],
      ]);
      if (e.duration != null && e.ttfb != null && e.duration > 0 && !isStream(e)) {
        const total = e.duration;
        const waitPct = Math.max(1, (e.ttfb / total) * 100);
        const dlPct = Math.max(1, 100 - waitPct);
        const grid = h('div.nm-timing');
        grid.append(
          h('span.lbl', { text: 'Waiting for server' }),
          h('div.bar', null, h('span', { style: `left:0;width:${waitPct}%;background:var(--ok)` })),
          h('span.val', { text: formatDuration(e.ttfb) }),
          h('span.lbl', { text: 'Content download' }),
          h('div.bar', null, h('span', { style: `left:${waitPct}%;width:${dlPct}%;background:var(--redirect)` })),
          h('span.val', { text: formatDuration(Math.max(0, total - e.ttfb)) }),
        );
        sec.append(grid);
      }
      this.body.append(sec);
      this.body.append(h('div.nm-placeholder', { style: 'padding:8px 16px' },
        h('div', { text: 'Timings are measured from the page script; DNS / TLS phases are not included.' })));
    }

    // ---------- messages (WebSocket / SSE) ----------

    renderMessages() {
      const e = this.entry;
      const wrap = h('div.nm-msgs');
      const bar = h('div.nm-msgs-bar');

      const search = h('div.nm-search', { html: I.search.replace('<svg', '<svg class="lead"') });
      const input = h('input', { type: 'search', placeholder: 'Filter messages', value: this.msgFilter.text, spellcheck: 'false' });
      const clearSearch = h('button.nm-icon-btn', { title: 'Clear filter', html: I.x, hidden: !this.msgFilter.text });
      input.addEventListener('input', () => {
        this.msgFilter.text = input.value;
        clearSearch.hidden = !input.value;
        this.rebuildFrames();
      });
      clearSearch.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
      search.append(input, clearSearch);
      bar.append(search);

      if (e.kind === 'ws') {
        const chips = h('div.nm-chips');
        for (const [id, label] of [['all', 'All'], ['out', 'Sent'], ['in', 'Received']]) {
          chips.append(h('button.nm-chip', {
            'aria-pressed': String(this.msgFilter.dir === id), text: label,
            onclick: () => {
              this.msgFilter.dir = id;
              chips.querySelectorAll('.nm-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === label)));
              this.rebuildFrames();
            },
          }));
        }
        bar.append(chips);
      }
      bar.append(h('button.nm-btn', {
        title: 'Clear captured messages for this connection', html: `${I.clear}<span>Clear</span>`,
        onclick: () => this.onClearFrames && this.onClearFrames(e.id),
      }));

      this.msgList = h('div.nm-msgs-list');
      wrap.append(bar, this.msgList);
      this.body.append(wrap);
      this.rebuildFrames();
    }

    frameMatches(f) {
      const { text, dir } = this.msgFilter;
      if (dir !== 'all' && f.dir !== dir) return false;
      if (text && !(f.data || '').toLowerCase().includes(text.toLowerCase())) return false;
      return true;
    }

    rebuildFrames() {
      const e = this.entry;
      const list = this.msgList;
      if (!list) return;
      list.textContent = '';
      const frames = (e.frames || []).filter((f) => this.frameMatches(f));
      this.renderedSeq = e.frameSeq || 0;
      const shown = frames.slice(-MAX_FRAME_ROWS);
      const hidden = frames.length - shown.length + (e.framesDropped || 0);
      if (hidden > 0) list.append(h('div.nm-frame-note', { text: `${hidden} older message${hidden === 1 ? '' : 's'} not shown` }));
      if (!frames.length) {
        const msg = (e.frames || []).length ? 'No messages match the filter.'
          : e.state === 'connecting' ? 'Connecting…'
            : e.state === 'open' ? 'Connection open — waiting for messages…' : 'No messages were exchanged.';
        list.append(this.placeholder(I.plug, msg));
        return;
      }
      const frag = document.createDocumentFragment();
      for (const f of shown) frag.append(this.frameEl(f));
      list.append(frag);
      list.scrollTop = list.scrollHeight;
    }

    /** Append frames that arrived since the last render, keeping scroll position sensible. */
    syncMessages() {
      const e = this.entry;
      const list = this.msgList;
      if (!list || !list.isConnected) return this.render(false);
      const seq = e.frameSeq || 0;
      if (seq === this.renderedSeq) return;
      if (seq < this.renderedSeq || !(e.frames || []).length) return this.rebuildFrames();
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      const fresh = e.frames.filter((f) => f.seq > this.renderedSeq && this.frameMatches(f));
      this.renderedSeq = seq;
      if (!fresh.length) return;
      const ph = list.querySelector('.nm-placeholder');
      if (ph) ph.remove();
      const frag = document.createDocumentFragment();
      for (const f of fresh) frag.append(this.frameEl(f));
      list.append(frag);
      const rows = list.querySelectorAll('.nm-frame');
      for (let i = 0; i < rows.length - MAX_FRAME_ROWS; i++) rows[i].remove();
      if (atBottom) list.scrollTop = list.scrollHeight;
    }

    frameEl(f) {
      const key = f.seq;
      const el = h(`div.nm-frame.${f.dir}`);
      const preview = (f.data || '').slice(0, 400).replace(/\s+/g, ' ');
      const row = h('div.nm-frame-row', { title: f.dir === 'out' ? 'Sent' : 'Received' },
        h('span.dir', { html: f.dir === 'out' ? I.arrowUp : I.arrowDown }),
        h('span.data', { text: (f.event && f.event !== 'message' ? `[${f.event}] ` : '') + preview }),
        h('span.size', { text: formatBytes(f.size) }),
        h('span.time', { text: formatClock(f.time) }),
      );
      el.append(row);
      const toggle = () => {
        if (this.openFrames.has(key)) {
          this.openFrames.delete(key);
          el.classList.remove('open');
          const d = el.querySelector('.nm-frame-detail');
          if (d) d.remove();
        } else {
          this.openFrames.add(key);
          el.classList.add('open');
          const label = `${f.dir === 'out' ? 'Sent' : 'Received'}${f.binary ? ' · binary' : ''}${f.hex ? ' (hex)' : ''}`;
          el.append(h('div.nm-frame-detail', null, this.codeBlock({ label, text: f.data || '', truncated: f.truncated })));
        }
      };
      row.addEventListener('click', toggle);
      if (this.openFrames.has(key)) { this.openFrames.delete(key); toggle(); }
      return el;
    }
  }

  NM.Details = Details;
  NM.statusInfo = statusInfo;
  NM.methodLabel = methodLabel;
  NM.isStream = isStream;
})();
