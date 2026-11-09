/* In-memory request store with bounded size and change notifications. */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});

  const MAX_ENTRIES = 1000;
  const MAX_FRAMES = 2000;

  class Store {
    constructor() {
      this.entries = new Map(); // id -> entry, chronological insertion order
      this.listeners = new Set();
      this.recording = true;
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    notify(type, entry, extra) {
      for (const fn of this.listeners) {
        try { fn(type, entry, extra); } catch (err) { console.error('[Netmon]', err); }
      }
    }

    get(id) { return this.entries.get(id); }
    all() { return [...this.entries.values()]; }
    get size() { return this.entries.size; }

    add(entry) {
      if (!this.recording || this.entries.has(entry.id)) return;
      if (entry.frames) {
        entry.framesIn = 0;
        entry.framesOut = 0;
        entry.framesDropped = 0;
      }
      this.entries.set(entry.id, entry);
      this.notify('add', entry);
      this.enforceLimit();
    }

    update(id, patch) {
      const entry = this.entries.get(id);
      if (!entry) return;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) entry[k] = v;
      this.notify('update', entry);
    }

    addFrame(id, frame) {
      const entry = this.entries.get(id);
      if (!entry || !this.recording) return;
      if (!entry.frames) entry.frames = [];
      entry.frameSeq = (entry.frameSeq || 0) + 1;
      frame.seq = entry.frameSeq;
      entry.frames.push(frame);
      if (frame.dir === 'out') entry.framesOut = (entry.framesOut || 0) + 1;
      else entry.framesIn = (entry.framesIn || 0) + 1;
      entry.bytesTransferred = (entry.bytesTransferred || 0) + (frame.size || 0);
      if (entry.frames.length > MAX_FRAMES) {
        const drop = entry.frames.length - MAX_FRAMES;
        entry.frames.splice(0, drop);
        entry.framesDropped = (entry.framesDropped || 0) + drop;
      }
      this.notify('frame', entry, frame);
    }

    /** Insert entries restored from a previous page (preserve log) before current ones. */
    restore(list) {
      if (!Array.isArray(list) || !list.length) return;
      const merged = new Map();
      for (const e of list) {
        if (this.entries.has(e.id)) continue;
        e.preserved = true;
        if (e.state === 'pending' || e.state === 'connecting' || e.state === 'open') {
          e.state = e.kind === 'ws' || e.kind === 'sse' ? 'closed' : 'aborted';
          if (!e.error) e.error = 'Interrupted by navigation';
        }
        merged.set(e.id, e);
      }
      for (const [id, e] of this.entries) merged.set(id, e);
      this.entries = merged;
      this.enforceLimit(true);
      this.notify('reset');
    }

    clearFrames(id) {
      const entry = this.entries.get(id);
      if (!entry || !entry.frames) return;
      entry.frames = [];
      entry.framesIn = 0;
      entry.framesOut = 0;
      entry.framesDropped = 0;
      entry.bytesTransferred = 0;
      this.notify('update', entry);
      this.notify('frames-cleared', entry);
    }

    clear() {
      this.entries.clear();
      this.notify('reset');
    }

    enforceLimit(silent) {
      if (this.entries.size <= MAX_ENTRIES) return;
      const removed = [];
      for (const id of this.entries.keys()) {
        if (this.entries.size <= MAX_ENTRIES) break;
        removed.push(this.entries.get(id));
        this.entries.delete(id);
      }
      if (!silent) for (const e of removed) this.notify('remove', e);
    }

    /** Compact copy suitable for chrome.storage.session (bounded size). */
    snapshot(maxBytes = 6 * 1024 * 1024) {
      const trimBody = (b) => {
        if (!b || b.text == null || b.text.length <= 100_000) return b;
        return { ...b, text: b.text.slice(0, 100_000), truncated: true };
      };
      let list = this.all().slice(-300).map((e) => ({
        ...e,
        requestBody: trimBody(e.requestBody),
        responseBody: trimBody(e.responseBody),
        frames: e.frames ? e.frames.slice(-200) : undefined,
      }));
      let json = JSON.stringify(list);
      while (json.length > maxBytes && list.length > 1) {
        list = list.slice(Math.ceil(list.length / 4));
        json = JSON.stringify(list);
      }
      return list;
    }
  }

  NM.Store = Store;
  NM.limits = { MAX_ENTRIES, MAX_FRAMES };
})();
