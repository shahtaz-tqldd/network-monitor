/*
 * Panel geometry: floating (drag + 8-direction resize), docked right, docked bottom,
 * maximize, and the list/detail splitter. Uses pointer capture so drags keep working
 * over iframes and outside the window. Everything is clamped to the viewport.
 */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});
  const { clamp } = NM.util;

  const MIN_W = 440;
  const MIN_H = 260;
  const MIN_RIGHT_W = 340;
  const MIN_BOTTOM_H = 200;
  const MARGIN = 8;
  const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  const viewport = () => ({
    w: Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth),
    h: window.innerHeight,
  });

  const DEFAULT_STATE = () => {
    const vp = viewport();
    const w = Math.min(920, vp.w - 40);
    const h = Math.min(620, vp.h - 40);
    return {
      mode: 'float',
      maximized: false,
      float: { x: Math.max(MARGIN, vp.w - w - 20), y: 20, w, h },
      rightW: Math.min(560, Math.round(vp.w * 0.42)),
      bottomH: Math.min(360, Math.round(vp.h * 0.42)),
      split: 0.42,
    };
  };

  class Layout {
    constructor({ panel, titlebar, body, splitter, onChange, onModeChange }) {
      this.panel = panel;
      this.titlebar = titlebar;
      this.body = body;
      this.splitter = splitter;
      this.onChange = onChange || (() => {});
      this.onModeChange = onModeChange || (() => {});
      this.state = DEFAULT_STATE();

      this.handles = {};
      for (const dir of DIRS) {
        const el = document.createElement('div');
        el.className = `nm-resize ${dir}`;
        el.dataset.dir = dir;
        panel.appendChild(el);
        this.handles[dir] = el;
        this.bindResize(el, dir);
      }

      this.bindDrag();
      this.bindSplitter();
      this.onWindowResize = () => this.apply();
      window.addEventListener('resize', this.onWindowResize, { passive: true });
    }

    load(saved) {
      if (!saved || typeof saved !== 'object') return this.apply();
      const d = DEFAULT_STATE();
      this.state = {
        ...d,
        ...saved,
        float: { ...d.float, ...(saved.float || {}) },
      };
      if (!['float', 'right', 'bottom'].includes(this.state.mode)) this.state.mode = 'float';
      this.apply();
    }

    /** Apply the current state to the DOM, clamping to the viewport. */
    apply() {
      const s = this.state;
      const vp = viewport();
      const st = this.panel.style;
      st.right = st.bottom = 'auto';
      this.panel.dataset.mode = s.mode;
      this.panel.classList.toggle('is-maximized', s.mode === 'float' && s.maximized);

      if (s.mode === 'right') {
        const w = clamp(s.rightW, Math.min(MIN_RIGHT_W, vp.w), Math.max(MIN_RIGHT_W, vp.w - 40));
        s.rightW = w;
        Object.assign(st, { left: `${vp.w - w}px`, top: '0px', width: `${w}px`, height: `${vp.h}px` });
      } else if (s.mode === 'bottom') {
        const h = clamp(s.bottomH, Math.min(MIN_BOTTOM_H, vp.h), Math.max(MIN_BOTTOM_H, vp.h - 40));
        s.bottomH = h;
        Object.assign(st, { left: '0px', top: `${vp.h - h}px`, width: `${vp.w}px`, height: `${h}px` });
      } else if (s.maximized) {
        Object.assign(st, {
          left: `${MARGIN}px`, top: `${MARGIN}px`,
          width: `${Math.max(0, vp.w - MARGIN * 2)}px`, height: `${Math.max(0, vp.h - MARGIN * 2)}px`,
        });
      } else {
        const f = s.float;
        f.w = clamp(f.w, Math.min(MIN_W, vp.w - MARGIN * 2), Math.max(MIN_W, vp.w - MARGIN * 2));
        f.h = clamp(f.h, Math.min(MIN_H, vp.h - MARGIN * 2), Math.max(MIN_H, vp.h - MARGIN * 2));
        // Keep the panel fully on-screen.
        f.x = clamp(f.x, MARGIN, Math.max(MARGIN, vp.w - f.w - MARGIN));
        f.y = clamp(f.y, MARGIN, Math.max(MARGIN, vp.h - f.h - MARGIN));
        Object.assign(st, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
      }

      // Which resize handles are active for this mode.
      const active = s.mode === 'right' ? ['w']
        : s.mode === 'bottom' ? ['n']
          : s.maximized ? [] : DIRS;
      for (const dir of DIRS) this.handles[dir].hidden = !active.includes(dir);

      this.body.style.setProperty('--split', `${(s.split * 100).toFixed(2)}%`);
    }

    setMode(mode) {
      if (!['float', 'right', 'bottom'].includes(mode)) return;
      this.state.mode = mode;
      if (mode !== 'float') this.state.maximized = false;
      this.apply();
      this.onModeChange(this.state);
      this.onChange(this.state);
    }

    toggleMaximize() {
      if (this.state.mode !== 'float') this.state.mode = 'float';
      this.state.maximized = !this.state.maximized;
      this.apply();
      this.onModeChange(this.state);
      this.onChange(this.state);
    }

    // ---- pointer helpers ----
    track(el, e, { onMove, onEnd, cursorEl }) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.panel.classList.add('is-interacting');
      (cursorEl || el).classList.add('active');
      const move = (ev) => onMove(ev);
      const end = (ev) => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        this.panel.classList.remove('is-interacting');
        (cursorEl || el).classList.remove('active');
        if (onEnd) onEnd(ev);
        this.onChange(this.state);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    bindDrag() {
      const tb = this.titlebar;
      tb.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button, input, label, a')) return;
        const s = this.state;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = this.panel.getBoundingClientRect();
        let offX = startX - rect.left;
        const offY = startY - rect.top;
        let undocked = s.mode === 'float' && !s.maximized;

        this.track(tb, e, {
          cursorEl: tb,
          onMove: (ev) => {
            if (!undocked) {
              // Dragging a docked / maximized panel pops it out into floating mode.
              if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
              const ratio = offX / rect.width;
              s.mode = 'float';
              s.maximized = false;
              offX = Math.round(s.float.w * ratio);
              undocked = true;
              this.onModeChange(s);
            }
            tb.classList.add('dragging');
            s.float.x = ev.clientX - offX;
            s.float.y = ev.clientY - Math.min(offY, 20);
            this.apply();
          },
          onEnd: () => tb.classList.remove('dragging'),
        });
      });

      tb.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, label, a')) return;
        this.toggleMaximize();
      });
    }

    bindResize(handle, dir) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const s = this.state;
        const start = { px: e.clientX, py: e.clientY, ...s.float, rightW: s.rightW, bottomH: s.bottomH };
        this.track(handle, e, {
          onMove: (ev) => {
            const dx = ev.clientX - start.px;
            const dy = ev.clientY - start.py;
            const vp = viewport();
            if (s.mode === 'right') {
              s.rightW = start.rightW - dx;
            } else if (s.mode === 'bottom') {
              s.bottomH = start.bottomH - dy;
            } else {
              const f = s.float;
              if (dir.includes('e')) f.w = clamp(start.w + dx, MIN_W, vp.w - start.x - MARGIN);
              if (dir.includes('s')) f.h = clamp(start.h + dy, MIN_H, vp.h - start.y - MARGIN);
              if (dir.includes('w')) {
                const w = clamp(start.w - dx, MIN_W, start.x + start.w - MARGIN);
                f.x = start.x + start.w - w;
                f.w = w;
              }
              if (dir.includes('n')) {
                const h = clamp(start.h - dy, MIN_H, start.y + start.h - MARGIN);
                f.y = start.y + start.h - h;
                f.h = h;
              }
            }
            this.apply();
          },
        });
      });
    }

    bindSplitter() {
      const sp = this.splitter;
      sp.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const rect = this.body.getBoundingClientRect();
        this.track(sp, e, {
          onMove: (ev) => {
            const minList = Math.min(220, rect.width * 0.3);
            const minDetail = Math.min(300, rect.width * 0.4);
            const x = clamp(ev.clientX - rect.left, minList, rect.width - minDetail);
            this.state.split = x / rect.width;
            this.body.style.setProperty('--split', `${(this.state.split * 100).toFixed(2)}%`);
          },
        });
      });
      sp.addEventListener('dblclick', () => {
        this.state.split = 0.42;
        this.apply();
        this.onChange(this.state);
      });
    }

    destroy() {
      window.removeEventListener('resize', this.onWindowResize);
    }
  }

  NM.Layout = Layout;
})();
