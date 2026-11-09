/* Shared helpers for the isolated-world content scripts. */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});

  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function formatBytes(n) {
    if (n == null || Number.isNaN(n)) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatDuration(ms) {
    if (ms == null || Number.isNaN(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  function formatClock(ts) {
    const d = new Date(ts);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }

  function splitUrl(url) {
    try {
      const u = new URL(url);
      const segs = u.pathname.split('/').filter(Boolean);
      const name = (segs[segs.length - 1] || u.host) + (u.search || '');
      return { name, host: u.host, path: u.pathname + u.search, origin: u.origin, search: u.search, params: [...u.searchParams.entries()] };
    } catch {
      return { name: url, host: '', path: url, origin: '', search: '', params: [] };
    }
  }

  function tryParseJson(text) {
    if (typeof text !== 'string') return undefined;
    const t = text.trim();
    if (!t || !/^[[{"]|^-?\d|^(true|false|null)$/.test(t)) return undefined;
    try { return JSON.parse(t); } catch { return undefined; }
  }

  /** Pretty-printed, syntax-highlighted JSON as safe HTML. */
  function highlightJson(value) {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) return '';
    return escapeHtml(json).replace(
      /(&quot;(?:\\u[\da-fA-F]{4}|\\[^u]|(?!&quot;)[^\\])*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      (match, str, colon, bool) => {
        if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
        if (bool) return `<span class="j-bool">${match}</span>`;
        if (match === 'null') return `<span class="j-null">${match}</span>`;
        return `<span class="j-num">${match}</span>`;
      },
    );
  }

  function parseUrlEncoded(text) {
    try { return [...new URLSearchParams(text).entries()]; } catch { return null; }
  }

  function shellQuote(s) {
    return `'${String(s).replace(/'/g, `'\\''`)}'`;
  }

  function toCurl(entry) {
    const parts = [`curl ${shellQuote(entry.url)}`];
    if (entry.method && entry.method !== 'GET') parts.push(`-X ${entry.method}`);
    for (const [k, v] of entry.requestHeaders || []) parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
    const b = entry.requestBody;
    if (b) {
      if (b.kind === 'form-data') {
        for (const [k, v] of b.entries || []) parts.push(`-F ${shellQuote(`${k}=${v}`)}`);
      } else if (b.text != null && b.kind !== 'binary') {
        parts.push(`--data-raw ${shellQuote(b.text)}`);
      }
    }
    return parts.join(' \\\n  ');
  }

  function bodyAsText(body) {
    if (!body) return '';
    if (body.kind === 'form-data') return (body.entries || []).map(([k, v]) => `${k}: ${v}`).join('\n');
    return body.text ?? body.note ?? '';
  }

  async function copyText(text, root) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for pages without clipboard permission / focus.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      (root || document.documentElement).appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function downloadText(filename, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /** Tiny hyperscript helper: h('div.cls', {attrs}, children...) */
  function h(tag, attrs, ...children) {
    const [name, ...classes] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (classes.length) el.className = classes.join(' ');
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function debounce(fn, ms) {
    let t;
    const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    d.flush = (...args) => { clearTimeout(t); fn(...args); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  /** True while the extension context is alive (false after the extension reloads). */
  function extAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  function sendMessage(msg) {
    if (!extAlive()) return Promise.resolve(undefined);
    try {
      return chrome.runtime.sendMessage(msg).catch(() => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  }

  NM.util = {
    escapeHtml, formatBytes, formatDuration, formatClock, splitUrl, tryParseJson, highlightJson,
    parseUrlEncoded, toCurl, bodyAsText, copyText, downloadText, h, debounce, clamp, extAlive, sendMessage,
  };
})();
