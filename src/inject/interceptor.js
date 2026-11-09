/*
 * Runs in the page's MAIN world at document_start (declared in manifest with
 * "world": "MAIN"), so it is not blocked by the page's CSP and patches
 * fetch / XMLHttpRequest / WebSocket / EventSource before page code runs.
 *
 * Events are sent to the isolated content script as JSON strings on a private
 * CustomEvent name, so they never reach the page's own `message` listeners.
 */
(() => {
  'use strict';

  if (window.__netmonInterceptorInstalled) return;
  Object.defineProperty(window, '__netmonInterceptorInstalled', { value: true });

  const EVENT_OUT = '__netmon:event';
  const EVENT_CFG = '__netmon:config';
  const MAX_BODY = 1024 * 1024; // chars kept per request/response body
  const MAX_FRAME = 64 * 1024; // chars kept per WebSocket / SSE frame

  const session = Math.random().toString(36).slice(2, 8);
  let seq = 0;
  let recording = true;

  const nextId = () => `${session}-${++seq}`;
  const now = () => Date.now();

  document.addEventListener(EVENT_CFG, (e) => {
    try {
      const cfg = JSON.parse(e.detail);
      if (typeof cfg.recording === 'boolean') recording = cfg.recording;
    } catch { /* ignore */ }
  });

  function emit(payload) {
    try {
      document.dispatchEvent(new CustomEvent(EVENT_OUT, { detail: JSON.stringify(payload) }));
    } catch { /* never break the page */ }
  }

  // ---------- helpers ----------

  function absoluteUrl(u) {
    try { return new URL(String(u), location.href).href; } catch { return String(u); }
  }

  function truncate(text, max) {
    if (typeof text !== 'string') return { text: null, truncated: false };
    if (text.length <= max) return { text, truncated: false };
    return { text: text.slice(0, max), truncated: true };
  }

  function headersToPairs(headers) {
    const out = [];
    try {
      if (!headers) return out;
      if (headers instanceof Headers) headers.forEach((v, k) => out.push([k, v]));
      else if (Array.isArray(headers)) headers.forEach(([k, v]) => out.push([String(k), String(v)]));
      else Object.keys(headers).forEach((k) => out.push([k, String(headers[k])]));
    } catch { /* ignore */ }
    return out;
  }

  function parseRawHeaders(raw) {
    if (!raw) return [];
    return raw.trim().split(/[\r\n]+/).map((line) => {
      const i = line.indexOf(':');
      return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : null;
    }).filter(Boolean);
  }

  const textDecoder = new TextDecoder('utf-8', { fatal: true });

  function tryDecode(buf) {
    try { return textDecoder.decode(buf); } catch { return null; }
  }

  function hexPreview(bytes, limit = 256) {
    const view = bytes.subarray(0, limit);
    let s = '';
    for (let i = 0; i < view.length; i++) {
      s += view[i].toString(16).padStart(2, '0') + (i % 16 === 15 ? '\n' : ' ');
    }
    return s.trim() + (bytes.length > limit ? `\n… (${bytes.length - limit} more bytes)` : '');
  }

  function toBytes(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return null;
  }

  /** Serialize a request body into something displayable. */
  function serializeBody(body) {
    if (body == null) return null;
    try {
      if (typeof body === 'string') {
        const t = truncate(body, MAX_BODY);
        return { kind: 'text', text: t.text, truncated: t.truncated, size: body.length };
      }
      if (body instanceof URLSearchParams) {
        const s = body.toString();
        return { kind: 'urlencoded', text: s, size: s.length };
      }
      if (body instanceof FormData) {
        const entries = [];
        body.forEach((v, k) => {
          entries.push([k, typeof v === 'string' ? v : `[File] ${v.name || 'blob'} (${v.size} bytes, ${v.type || 'unknown type'})`]);
        });
        return { kind: 'form-data', entries };
      }
      if (body instanceof Blob) {
        return { kind: 'binary', note: `Blob · ${body.size} bytes · ${body.type || 'unknown type'}`, size: body.size };
      }
      const bytes = toBytes(body);
      if (bytes) {
        const decoded = bytes.length <= MAX_BODY ? tryDecode(bytes) : null;
        if (decoded !== null) return { kind: 'text', text: decoded, size: bytes.length };
        return { kind: 'binary', note: `Binary · ${bytes.length} bytes`, text: hexPreview(bytes), size: bytes.length };
      }
      if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
        return { kind: 'binary', note: 'ReadableStream (not captured)' };
      }
      if (typeof Document !== 'undefined' && body instanceof Document) {
        const s = new XMLSerializer().serializeToString(body);
        const t = truncate(s, MAX_BODY);
        return { kind: 'text', text: t.text, truncated: t.truncated, size: s.length };
      }
      const s = String(body);
      return { kind: 'text', text: s, size: s.length };
    } catch (err) {
      return { kind: 'binary', note: `Unreadable body (${err && err.message})` };
    }
  }

  function isTextual(contentType) {
    if (!contentType) return true; // unknown — try as text, it is size-limited anyway
    const ct = contentType.toLowerCase();
    return /^text\//.test(ct) || /json|xml|javascript|ecmascript|graphql|x-www-form-urlencoded|csv|yaml|html/.test(ct);
  }

  /** Read at most MAX_BODY chars from a cloned response without buffering it all. */
  async function readLimited(response) {
    if (!response.body) {
      return { text: await response.text(), truncated: false };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let truncated = false;
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (text.length > MAX_BODY) {
        text = text.slice(0, MAX_BODY);
        truncated = true;
        reader.cancel().catch(() => {});
        break;
      }
    }
    if (!truncated) text += decoder.decode();
    return { text, truncated, bytes };
  }

  // ---------- fetch ----------

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    const patchedFetch = function fetch(input, init) {
      if (!recording) return origFetch.apply(this, arguments);

      const id = nextId();
      const start = now();
      const startPerf = performance.now();
      let reqClone = null;

      try {
        const isRequest = typeof Request !== 'undefined' && input instanceof Request;
        const url = absoluteUrl(isRequest ? input.url : input);
        const method = String((init && init.method) || (isRequest ? input.method : 'GET')).toUpperCase();

        const headers = new Headers(isRequest ? input.headers : undefined);
        if (init && init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));

        let requestBody = null;
        if (init && init.body != null) requestBody = serializeBody(init.body);
        else if (isRequest && method !== 'GET' && method !== 'HEAD' && input.body) {
          try { reqClone = input.clone(); } catch { reqClone = null; }
        }

        emit({ t: 'start', entry: {
          id, kind: 'fetch', method, url, startTime: start, state: 'pending',
          requestHeaders: headersToPairs(headers), requestBody,
        } });

        if (reqClone) {
          reqClone.text().then((text) => {
            const t = truncate(text, MAX_BODY);
            emit({ t: 'update', id, patch: { requestBody: { kind: 'text', text: t.text, truncated: t.truncated, size: text.length } } });
          }).catch(() => {});
        }
      } catch { /* tracking must never break the request */ }

      return origFetch.apply(this, arguments).then((response) => {
        try {
          const contentType = response.headers.get('content-type') || '';
          const contentLength = Number(response.headers.get('content-length')) || null;
          emit({ t: 'update', id, patch: {
            status: response.status,
            statusText: response.statusText,
            responseHeaders: headersToPairs(response.headers),
            mimeType: contentType.split(';')[0].trim(),
            finalUrl: response.redirected ? response.url : undefined,
            responseType: response.type,
            ttfb: Math.round(performance.now() - startPerf),
          } });

          const finish = (patch) => emit({ t: 'update', id, patch: {
            state: 'done', duration: Math.round(performance.now() - startPerf), ...patch,
          } });

          if (response.type === 'opaque' || response.type === 'opaqueredirect') {
            finish({ responseBody: { kind: 'none', note: 'Opaque response (no-cors) — body is not readable' } });
          } else if (response.status === 204 || response.status === 304 || response.status === 205) {
            finish({ responseBody: { kind: 'none', note: 'No content' }, size: 0 });
          } else if (/text\/event-stream/i.test(contentType)) {
            finish({ responseBody: { kind: 'none', note: 'Event stream — body not captured' } });
          } else if (!isTextual(contentType)) {
            finish({ responseBody: { kind: 'binary', note: `Binary · ${contentType || 'unknown type'}${contentLength ? ` · ${contentLength} bytes` : ''}` }, size: contentLength });
          } else {
            let clone;
            try { clone = response.clone(); } catch { clone = null; }
            if (!clone) {
              finish({ responseBody: { kind: 'none', note: 'Body already consumed' } });
            } else {
              readLimited(clone).then(({ text, truncated, bytes }) => {
                finish({ responseBody: { kind: 'text', text, truncated }, size: contentLength || bytes || text.length });
              }).catch((err) => {
                finish({ responseBody: { kind: 'none', note: `Could not read body: ${err && err.message}` } });
              });
            }
          }
        } catch { /* ignore */ }
        return response;
      }, (err) => {
        const aborted = err && err.name === 'AbortError';
        emit({ t: 'update', id, patch: {
          state: aborted ? 'aborted' : 'error',
          error: aborted ? 'Request aborted' : String((err && err.message) || err),
          duration: Math.round(performance.now() - startPerf),
        } });
        throw err;
      });
    };
    try { Object.defineProperty(patchedFetch, 'name', { value: 'fetch' }); } catch { /* ignore */ }
    window.fetch = patchedFetch;
  }

  // ---------- XMLHttpRequest ----------

  const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XHR) {
    const meta = new WeakMap();
    const origOpen = XHR.open;
    const origSetHeader = XHR.setRequestHeader;
    const origSend = XHR.send;

    XHR.open = function open(method, url) {
      meta.set(this, { method: String(method || 'GET').toUpperCase(), url: absoluteUrl(url), headers: [] });
      return origOpen.apply(this, arguments);
    };

    XHR.setRequestHeader = function setRequestHeader(name, value) {
      const m = meta.get(this);
      if (m) m.headers.push([String(name), String(value)]);
      return origSetHeader.apply(this, arguments);
    };

    XHR.send = function send(body) {
      const m = meta.get(this);
      if (!m || !recording) return origSend.apply(this, arguments);

      const id = nextId();
      const startPerf = performance.now();
      let outcome = null;
      let headersSent = false;
      const xhr = this;

      emit({ t: 'start', entry: {
        id, kind: 'xhr', method: m.method, url: m.url, startTime: now(), state: 'pending',
        requestHeaders: m.headers.slice(), requestBody: serializeBody(body),
      } });

      const sendHeaders = () => {
        if (headersSent) return;
        headersSent = true;
        let headers = [];
        try { headers = parseRawHeaders(xhr.getAllResponseHeaders()); } catch { /* ignore */ }
        const ct = headers.find(([k]) => k.toLowerCase() === 'content-type');
        emit({ t: 'update', id, patch: {
          status: xhr.status, statusText: xhr.statusText,
          responseHeaders: headers,
          mimeType: ct ? ct[1].split(';')[0].trim() : '',
          finalUrl: xhr.responseURL && xhr.responseURL !== m.url ? xhr.responseURL : undefined,
          ttfb: Math.round(performance.now() - startPerf),
        } });
      };

      this.addEventListener('readystatechange', () => {
        if (xhr.readyState === 2) sendHeaders();
      });
      this.addEventListener('abort', () => { outcome = 'aborted'; });
      this.addEventListener('timeout', () => { outcome = 'timeout'; });
      this.addEventListener('error', () => { outcome = 'error'; });
      this.addEventListener('loadend', () => {
        const duration = Math.round(performance.now() - startPerf);
        if (outcome) {
          emit({ t: 'update', id, patch: {
            state: outcome === 'aborted' ? 'aborted' : 'error',
            error: outcome === 'aborted' ? 'Request aborted' : outcome === 'timeout' ? 'Request timed out' : 'Network error',
            duration,
          } });
          return;
        }
        sendHeaders();
        let responseBody = null;
        let size = null;
        try {
          const rt = xhr.responseType;
          if (rt === '' || rt === 'text') {
            const raw = xhr.responseText;
            const t = truncate(raw, MAX_BODY);
            responseBody = { kind: 'text', text: t.text, truncated: t.truncated };
            size = raw.length;
          } else if (rt === 'json') {
            const s = xhr.response == null ? '' : JSON.stringify(xhr.response);
            const t = truncate(s, MAX_BODY);
            responseBody = { kind: 'text', text: t.text, truncated: t.truncated };
            size = s.length;
          } else if (rt === 'document') {
            const s = xhr.response ? new XMLSerializer().serializeToString(xhr.response) : '';
            const t = truncate(s, MAX_BODY);
            responseBody = { kind: 'text', text: t.text, truncated: t.truncated };
            size = s.length;
          } else if (rt === 'arraybuffer' && xhr.response) {
            size = xhr.response.byteLength;
            responseBody = { kind: 'binary', note: `ArrayBuffer · ${size} bytes` };
          } else if (rt === 'blob' && xhr.response) {
            size = xhr.response.size;
            responseBody = { kind: 'binary', note: `Blob · ${size} bytes · ${xhr.response.type || 'unknown type'}` };
          }
        } catch (err) {
          responseBody = { kind: 'none', note: `Could not read body: ${err && err.message}` };
        }
        emit({ t: 'update', id, patch: { state: 'done', duration, responseBody, size } });
      });

      try {
        return origSend.apply(this, arguments);
      } catch (err) {
        emit({ t: 'update', id, patch: { state: 'error', error: String(err && err.message), duration: 0 } });
        throw err;
      }
    };
  }

  // ---------- WebSocket ----------

  function frameData(data) {
    if (typeof data === 'string') {
      const t = truncate(data, MAX_FRAME);
      return { data: t.text, truncated: t.truncated, size: data.length, binary: false };
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      return { data: `[Binary Blob · ${data.size} bytes]`, size: data.size, binary: true };
    }
    const bytes = toBytes(data);
    if (bytes) {
      const decoded = bytes.length <= MAX_FRAME ? tryDecode(bytes) : null;
      if (decoded !== null && !/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
        return { data: decoded, size: bytes.length, binary: true };
      }
      return { data: hexPreview(bytes), size: bytes.length, binary: true, hex: true };
    }
    return { data: String(data), size: String(data).length, binary: false };
  }

  const OrigWS = window.WebSocket;
  if (typeof OrigWS === 'function') {
    const wsIds = new WeakMap();
    const origWsSend = OrigWS.prototype.send;

    OrigWS.prototype.send = function send(data) {
      const result = origWsSend.apply(this, arguments); // throws if not OPEN — then we record nothing
      const id = wsIds.get(this);
      if (id && recording) emit({ t: 'frame', id, frame: { dir: 'out', time: now(), ...frameData(data) } });
      return result;
    };

    window.WebSocket = new Proxy(OrigWS, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget);
        if (!recording) return ws;
        try {
          const id = nextId();
          const startPerf = performance.now();
          wsIds.set(ws, id);
          const protocols = args[1] == null ? [] : [].concat(args[1]).map(String);
          emit({ t: 'start', entry: {
            id, kind: 'ws', method: 'GET', url: ws.url, startTime: now(), state: 'connecting',
            protocols, frames: [],
          } });
          ws.addEventListener('open', () => {
            emit({ t: 'update', id, patch: {
              state: 'open', status: 101, statusText: 'Switching Protocols',
              protocol: ws.protocol, extensions: ws.extensions,
              ttfb: Math.round(performance.now() - startPerf),
            } });
          });
          ws.addEventListener('message', (e) => {
            if (recording) emit({ t: 'frame', id, frame: { dir: 'in', time: now(), ...frameData(e.data) } });
          });
          ws.addEventListener('error', () => {
            emit({ t: 'update', id, patch: { error: 'WebSocket error' } });
          });
          ws.addEventListener('close', (e) => {
            emit({ t: 'update', id, patch: {
              state: 'closed', closeCode: e.code, closeReason: e.reason, wasClean: e.wasClean,
              duration: Math.round(performance.now() - startPerf),
            } });
          });
        } catch { /* ignore */ }
        return ws;
      },
    });
  }

  // ---------- EventSource (Server-Sent Events) ----------

  const OrigES = window.EventSource;
  if (typeof OrigES === 'function') {
    window.EventSource = new Proxy(OrigES, {
      construct(target, args, newTarget) {
        const es = Reflect.construct(target, args, newTarget);
        if (!recording) return es;
        try {
          const id = nextId();
          const startPerf = performance.now();
          emit({ t: 'start', entry: {
            id, kind: 'sse', method: 'GET', url: es.url, startTime: now(), state: 'connecting', frames: [],
          } });
          es.addEventListener('open', () => {
            emit({ t: 'update', id, patch: { state: 'open', status: 200, ttfb: Math.round(performance.now() - startPerf) } });
          });
          es.addEventListener('message', (e) => {
            if (recording) emit({ t: 'frame', id, frame: { dir: 'in', time: now(), event: e.type, lastEventId: e.lastEventId, ...frameData(e.data) } });
          });
          es.addEventListener('error', () => {
            const closed = es.readyState === 2;
            emit({ t: 'update', id, patch: closed
              ? { state: 'closed', error: 'Connection closed', duration: Math.round(performance.now() - startPerf) }
              : { state: 'connecting', error: 'Reconnecting…' } });
          });
          const origClose = es.close;
          es.close = function close() {
            emit({ t: 'update', id, patch: { state: 'closed', duration: Math.round(performance.now() - startPerf) } });
            return origClose.apply(this, arguments);
          };
        } catch { /* ignore */ }
        return es;
      },
    });
  }
})();
