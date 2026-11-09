/* Panel stylesheet — injected into the panel's shadow root so page CSS cannot leak in. */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});

  NM.styles = /* css */ `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.nm-panel {
  --bg: #0d1017;
  --surface: #131823;
  --surface-2: #1a2030;
  --surface-3: #222a3d;
  --border: #252d40;
  --border-strong: #33405a;
  --text: #e6e9f2;
  --text-2: #a3abc0;
  --muted: #6b7590;
  --accent: #7c8cff;
  --accent-2: #a78bfa;
  --accent-soft: rgba(124, 140, 255, .14);
  --accent-ring: rgba(124, 140, 255, .45);
  --ok: #34d399;
  --redirect: #60a5fa;
  --warn: #fbbf24;
  --err: #f87171;
  --pending: #94a3b8;
  --ws: #22d3ee;
  --sse: #f0abfc;
  --row-hover: rgba(255, 255, 255, .035);
  --row-selected: rgba(124, 140, 255, .16);
  --shadow: 0 24px 60px -12px rgba(0, 0, 0, .65), 0 0 0 1px rgba(255, 255, 255, .04);
  --j-key: #93c5fd; --j-str: #86efac; --j-num: #fdba74; --j-bool: #c4b5fd; --j-null: #f9a8d4;
  --radius: 14px;
  --font: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace;

  position: fixed;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
  color: var(--text);
  font: 12px/1.45 var(--font);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: visible; /* resize handles sit on the edge; children clip their own corners */
  --r-in: calc(var(--radius) - 1px);
  --r-tl: var(--r-in); --r-tr: var(--r-in); --r-br: var(--r-in); --r-bl: var(--r-in);
  color-scheme: dark;
  text-align: left;
  -webkit-font-smoothing: antialiased;
  animation: nm-in .18s ease-out;
}
.nm-panel[data-theme="light"] {
  --bg: #ffffff;
  --surface: #f7f8fb;
  --surface-2: #eef1f6;
  --surface-3: #e3e7f0;
  --border: #e3e7ef;
  --border-strong: #cdd4e1;
  --text: #161b26;
  --text-2: #4a5468;
  --muted: #8790a3;
  --accent: #5b6cf0;
  --accent-2: #8b5cf6;
  --accent-soft: rgba(91, 108, 240, .1);
  --accent-ring: rgba(91, 108, 240, .4);
  --ok: #059669; --redirect: #2563eb; --warn: #d97706; --err: #dc2626; --pending: #64748b;
  --ws: #0891b2; --sse: #c026d3;
  --row-hover: rgba(15, 23, 42, .035);
  --row-selected: rgba(91, 108, 240, .1);
  --shadow: 0 24px 60px -16px rgba(15, 23, 42, .35), 0 0 0 1px rgba(15, 23, 42, .04);
  --j-key: #1d4ed8; --j-str: #047857; --j-num: #c2410c; --j-bool: #7c3aed; --j-null: #be185d;
  color-scheme: light;
}
@keyframes nm-in { from { opacity: 0; transform: translateY(6px) scale(.99); } to { opacity: 1; transform: none; } }

.nm-panel[data-mode="right"] { border-radius: var(--radius) 0 0 var(--radius); border-right: 0; --r-tr: 0; --r-br: 0; }
.nm-panel[data-mode="bottom"] { border-radius: var(--radius) var(--radius) 0 0; border-bottom: 0; --r-br: 0; --r-bl: 0; }
.nm-panel.is-maximized { border-radius: 10px; --r-in: 9px; }
.nm-panel.is-interacting, .nm-panel.is-interacting * { user-select: none !important; }
.nm-panel.is-interacting { transition: none; }

button { font: inherit; color: inherit; }
input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }

/* ---------- resize handles ---------- */
.nm-resize { position: absolute; z-index: 5; touch-action: none; }
.nm-resize.n, .nm-resize.s { left: 14px; right: 14px; height: 8px; cursor: ns-resize; }
.nm-resize.e, .nm-resize.w { top: 14px; bottom: 14px; width: 8px; cursor: ew-resize; }
.nm-resize.n { top: -4px; } .nm-resize.s { bottom: -4px; }
.nm-resize.e { right: -4px; } .nm-resize.w { left: -4px; }
.nm-resize.ne, .nm-resize.nw, .nm-resize.se, .nm-resize.sw { width: 18px; height: 18px; }
.nm-resize.ne { top: -4px; right: -4px; cursor: nesw-resize; }
.nm-resize.sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
.nm-resize.nw { top: -4px; left: -4px; cursor: nwse-resize; }
.nm-resize.se { bottom: -4px; right: -4px; cursor: nwse-resize; }
.nm-resize.se::after {
  content: ""; position: absolute; right: 8px; bottom: 8px; width: 6px; height: 6px;
  border-right: 2px solid var(--border-strong); border-bottom: 2px solid var(--border-strong);
  border-radius: 0 0 2px 0; opacity: .8;
}
.nm-resize[hidden] { display: none; }
.nm-resize.n:hover, .nm-resize.w:hover, .nm-resize.n.active, .nm-resize.w.active { background: var(--accent-soft); }

/* ---------- title bar ---------- */
.nm-titlebar {
  display: flex; align-items: center; gap: 10px;
  height: 42px; padding: 0 8px 0 14px; flex: none;
  background: linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%);
  border-bottom: 1px solid var(--border);
  border-radius: var(--r-tl) var(--r-tr) 0 0;
  cursor: grab; user-select: none; touch-action: none;
}
.nm-panel[data-mode]:not([data-mode="float"]) .nm-titlebar,
.nm-panel.is-maximized .nm-titlebar { cursor: default; }
.nm-titlebar.dragging { cursor: grabbing; }
.nm-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.nm-logo {
  display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; flex: none;
  color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 4px 12px -4px var(--accent-ring);
}
.nm-logo svg { width: 14px; height: 14px; }
.nm-title { font-weight: 650; font-size: 13px; letter-spacing: -.01em; white-space: nowrap; }
.nm-host { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-spacer { flex: 1; min-width: 4px; }

.nm-icon-btn {
  display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none;
  border: 0; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer;
  transition: background .12s, color .12s;
}
.nm-icon-btn:hover { background: var(--surface-3); color: var(--text); }
.nm-icon-btn.danger:hover { background: rgba(248, 113, 113, .15); color: var(--err); }
.nm-icon-btn[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
.nm-icon-btn svg { width: 15px; height: 15px; }

.nm-seg { display: inline-flex; padding: 2px; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; }
.nm-seg .nm-icon-btn { width: 26px; height: 22px; border-radius: 6px; }
.nm-seg .nm-icon-btn[aria-pressed="true"] { background: var(--surface-3); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.2); }

/* ---------- toolbar ---------- */
.nm-toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 7px 10px; flex: none; border-bottom: 1px solid var(--border); background: var(--bg);
}
.nm-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; flex: none;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-2);
  cursor: pointer; font-size: 12px; font-weight: 500; white-space: nowrap;
  transition: background .12s, border-color .12s, color .12s;
}
.nm-btn:hover { background: var(--surface-2); border-color: var(--border-strong); color: var(--text); }
.nm-btn svg { width: 14px; height: 14px; }
.nm-btn.rec svg { color: var(--err); }
.nm-btn.rec[aria-pressed="false"] svg { color: var(--muted); }
.nm-btn.rec[aria-pressed="true"] svg { animation: nm-pulse 1.6s ease-in-out infinite; }
@keyframes nm-pulse { 50% { opacity: .35; } }

.nm-search {
  position: relative; display: flex; align-items: center; flex: 1 1 160px; min-width: 120px; max-width: 320px;
}
.nm-search svg.lead { position: absolute; left: 9px; width: 14px; height: 14px; color: var(--muted); pointer-events: none; }
.nm-search input {
  width: 100%; height: 28px; padding: 0 28px 0 30px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface); outline: none; font-size: 12px;
  transition: border-color .12s, box-shadow .12s;
}
.nm-search input::placeholder { color: var(--muted); }
.nm-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.nm-search .nm-icon-btn { position: absolute; right: 2px; width: 24px; height: 24px; }
.nm-search .nm-icon-btn[hidden] { display: none; }

.nm-chips { display: inline-flex; gap: 2px; padding: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; flex: none; }
.nm-chip {
  height: 22px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent;
  color: var(--text-2); cursor: pointer; font-size: 11.5px; font-weight: 550; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 5px;
}
.nm-chip:hover { color: var(--text); background: var(--surface-2); }
.nm-chip[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.nm-chip .count { font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
.nm-chip[aria-pressed="true"] .count { color: inherit; opacity: .75; }
.nm-chip.err[aria-pressed="true"] { background: rgba(248, 113, 113, .14); color: var(--err); }

.nm-switch { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 4px; color: var(--text-2); cursor: pointer; white-space: nowrap; user-select: none; flex: none; }
.nm-switch input { position: absolute; opacity: 0; pointer-events: none; }
.nm-switch .track {
  position: relative; width: 28px; height: 16px; border-radius: 99px; background: var(--surface-3);
  border: 1px solid var(--border-strong); transition: background .15s, border-color .15s;
}
.nm-switch .track::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--text-2); transition: transform .15s, background .15s;
}
.nm-switch input:checked + .track { background: var(--accent); border-color: var(--accent); }
.nm-switch input:checked + .track::after { transform: translateX(12px); background: #fff; }
.nm-switch input:focus-visible + .track { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.nm-switch:hover { color: var(--text); }

/* ---------- body / split ---------- */
.nm-body { position: relative; display: flex; flex: 1; min-height: 0; overflow: hidden; }
.nm-list-pane { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; container: list / inline-size; }
.nm-body.has-detail .nm-list-pane { flex: 0 0 var(--split, 42%); }
.nm-splitter {
  flex: none; width: 1px; background: var(--border); position: relative; cursor: col-resize; touch-action: none; display: none;
}
.nm-splitter::before { content: ""; position: absolute; inset: 0 -4px; }
.nm-splitter:hover, .nm-splitter.active { background: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.nm-body.has-detail .nm-splitter { display: block; }
.nm-detail-pane { display: none; flex: 1 1 0; min-width: 0; flex-direction: column; background: var(--bg); }
.nm-body.has-detail .nm-detail-pane { display: flex; }

/* ---------- request list ---------- */
.nm-cols, .nm-row {
  display: grid;
  grid-template-columns: 54px 58px minmax(0, 1fr) 54px 64px 66px;
  align-items: center; column-gap: 8px; padding: 0 12px;
}
.nm-cols {
  height: 28px; flex: none; color: var(--muted); font-size: 10.5px; font-weight: 600; letter-spacing: .04em;
  text-transform: uppercase; border-bottom: 1px solid var(--border); background: var(--surface);
}
.nm-cols .r, .nm-row .r { text-align: right; }
@container list (max-width: 520px) {
  .nm-cols, .nm-row { grid-template-columns: 54px 58px minmax(0, 1fr) 62px; }
  .nm-cols .c-type, .nm-row .c-type, .nm-cols .c-size, .nm-row .c-size { display: none; }
}
@container list (max-width: 330px) {
  .nm-cols, .nm-row { grid-template-columns: 50px minmax(0, 1fr) 56px; }
  .nm-cols .c-method, .nm-row .c-method { display: none; }
}

.nm-list { flex: 1; overflow: auto; overscroll-behavior: contain; outline: none; position: relative; }
.nm-row {
  height: 40px; border-bottom: 1px solid var(--border); cursor: pointer; position: relative;
  transition: background .08s;
}
.nm-row:hover { background: var(--row-hover); }
.nm-row.selected { background: var(--row-selected); }
.nm-row.selected::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--accent); }
.nm-row.preserved { opacity: .6; }
.nm-row.is-error .c-name .name { color: var(--err); }
.nm-row.is-new { animation: nm-flash .9s ease-out; }
@keyframes nm-flash { from { background: var(--accent-soft); } }

.c-name { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.c-name .name { font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-name .host { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-type, .c-size, .c-time { color: var(--text-2); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-type { color: var(--muted); }

.nm-status-pill {
  display: inline-flex; align-items: center; gap: 5px; font-weight: 650; font-size: 11px;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.nm-status-pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.s-ok { color: var(--ok); } .s-redirect { color: var(--redirect); } .s-client { color: var(--warn); }
.s-server, .s-error { color: var(--err); } .s-pending { color: var(--pending); }
.s-open { color: var(--ws); } .s-closed { color: var(--muted); }
.s-pending::before, .s-connecting::before { animation: nm-pulse 1s ease-in-out infinite; }
.s-connecting { color: var(--warn); }

.nm-method {
  display: inline-block; padding: 2px 6px; border-radius: 5px; font: 650 10px/1.3 var(--mono);
  letter-spacing: .02em; background: var(--surface-2); color: var(--text-2); max-width: 100%;
  overflow: hidden; text-overflow: ellipsis;
}
.m-GET { color: var(--ok); background: color-mix(in srgb, var(--ok) 13%, transparent); }
.m-POST { color: var(--redirect); background: color-mix(in srgb, var(--redirect) 13%, transparent); }
.m-PUT { color: var(--warn); background: color-mix(in srgb, var(--warn) 13%, transparent); }
.m-PATCH { color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, transparent); }
.m-DELETE { color: var(--err); background: color-mix(in srgb, var(--err) 13%, transparent); }
.m-WS { color: var(--ws); background: color-mix(in srgb, var(--ws) 13%, transparent); }
.m-SSE { color: var(--sse); background: color-mix(in srgb, var(--sse) 13%, transparent); }

/* empty state */
.nm-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 24px; text-align: center; color: var(--text-2);
}
.nm-empty .art {
  display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; margin-bottom: 6px;
  background: var(--surface-2); color: var(--accent); border: 1px solid var(--border);
}
.nm-empty .art svg { width: 24px; height: 24px; }
.nm-empty h3 { margin: 0; font-size: 13.5px; font-weight: 650; color: var(--text); }
.nm-empty p { margin: 0; max-width: 300px; color: var(--muted); }
.nm-empty .actions { display: flex; gap: 8px; margin-top: 8px; }
.nm-kbd { font: 600 10.5px var(--mono); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text-2); }

/* ---------- detail pane ---------- */
.nm-detail-head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--border); flex: none; min-width: 0; }
.nm-detail-head .url { flex: 1; min-width: 0; font: 11.5px var(--mono); color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: ltr; }
.nm-tabs { display: flex; gap: 2px; padding: 0 10px; border-bottom: 1px solid var(--border); flex: none; overflow-x: auto; scrollbar-width: none; }
.nm-tab {
  position: relative; height: 34px; padding: 0 10px; border: 0; background: transparent; cursor: pointer;
  color: var(--text-2); font-weight: 550; font-size: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;
}
.nm-tab:hover { color: var(--text); }
.nm-tab[aria-selected="true"] { color: var(--text); }
.nm-tab[aria-selected="true"]::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--accent); }
.nm-tab .badge { font-size: 10px; padding: 0 5px; border-radius: 99px; background: var(--surface-3); color: var(--text-2); font-variant-numeric: tabular-nums; }
.nm-detail-body { flex: 1; overflow: auto; overscroll-behavior: contain; padding: 12px 14px 20px; min-height: 0; }

.nm-section { margin-bottom: 14px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
.nm-section > summary {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; list-style: none;
  font-weight: 650; font-size: 12px; user-select: none;
}
.nm-section > summary::-webkit-details-marker { display: none; }
.nm-section > summary::before {
  content: ""; width: 6px; height: 6px; border-right: 1.5px solid var(--muted); border-bottom: 1.5px solid var(--muted);
  transform: rotate(-45deg); transition: transform .15s; margin-right: 2px;
}
.nm-section[open] > summary::before { transform: rotate(45deg); }
.nm-section > summary .count { color: var(--muted); font-weight: 500; }
.nm-section > summary .nm-spacer { flex: 1; }
.nm-section > summary .nm-icon-btn { width: 24px; height: 24px; }
.nm-kv { display: grid; grid-template-columns: minmax(110px, 32%) 1fr; border-top: 1px solid var(--border); }
.nm-kv > div { padding: 5px 12px; border-bottom: 1px solid var(--border); font: 11.5px/1.5 var(--mono); min-width: 0; overflow-wrap: anywhere; }
.nm-kv > div:nth-last-child(-n + 2) { border-bottom: 0; }
.nm-kv .k { color: var(--text-2); }
.nm-kv .v { color: var(--text); user-select: text; }
.nm-kv .v.dim { color: var(--muted); font-style: italic; }
.nm-section .note { padding: 10px 12px; color: var(--muted); border-top: 1px solid var(--border); }

.nm-code-toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.nm-code-toolbar .label { font-weight: 650; }
.nm-code-toolbar .meta { color: var(--muted); font-size: 11px; }
.nm-code-toolbar .nm-spacer { flex: 1; }
.nm-code-toolbar .nm-btn { height: 26px; padding: 0 8px; }
.nm-code {
  margin: 0; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
  font: 11.5px/1.6 var(--mono); color: var(--text); white-space: pre; overflow: auto; tab-size: 2; user-select: text;
  max-height: none;
}
.nm-code.wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
.j-key { color: var(--j-key); } .j-str { color: var(--j-str); } .j-num { color: var(--j-num); }
.j-bool { color: var(--j-bool); } .j-null { color: var(--j-null); }
.nm-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 10px; border-radius: 9px; font-size: 11.5px;
  background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); }
.nm-banner.err { background: color-mix(in srgb, var(--err) 12%, transparent); color: var(--err); border-color: color-mix(in srgb, var(--err) 30%, transparent); }
.nm-placeholder { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 16px; color: var(--muted); text-align: center; }
.nm-placeholder svg { width: 22px; height: 22px; opacity: .7; }

.nm-timing { display: grid; grid-template-columns: 110px 1fr 70px; gap: 8px 10px; align-items: center; padding: 12px; border-top: 1px solid var(--border); }
.nm-timing .bar { height: 8px; border-radius: 99px; background: var(--surface-3); position: relative; overflow: hidden; }
.nm-timing .bar > span { position: absolute; top: 0; bottom: 0; border-radius: 99px; }
.nm-timing .lbl { color: var(--text-2); }
.nm-timing .val { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: 11px; }

/* ---------- websocket messages ---------- */
.nm-msgs { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.nm-msgs-bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); flex: none; flex-wrap: wrap; }
.nm-msgs-bar .nm-search { max-width: none; }
.nm-msgs-list { flex: 1; overflow: auto; overscroll-behavior: contain; min-height: 0; }
.nm-frame { border-bottom: 1px solid var(--border); }
.nm-frame-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) 58px 86px; gap: 8px; align-items: center; padding: 6px 12px; cursor: pointer; }
.nm-frame-row:hover { background: var(--row-hover); }
.nm-frame.out .nm-frame-row { background: color-mix(in srgb, var(--ok) 5%, transparent); }
.nm-frame.out .dir { color: var(--ok); }
.nm-frame.in .dir { color: var(--redirect); }
.nm-frame .dir svg { width: 13px; height: 13px; display: block; }
.nm-frame .data { font: 11.5px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-frame .size, .nm-frame .time { color: var(--muted); font-size: 10.5px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nm-frame.open .nm-frame-row { background: var(--row-selected); }
.nm-frame-detail { padding: 4px 12px 12px 38px; }
.nm-frame-detail .nm-code-toolbar { margin: 6px 0; }
.nm-frame-note { padding: 6px 12px; color: var(--muted); font-size: 11px; text-align: center; border-bottom: 1px solid var(--border); }

/* ---------- status bar ---------- */
.nm-statusbar {
  display: flex; align-items: center; gap: 14px; height: 26px; padding: 0 12px; flex: none;
  border-top: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: 11px;
  white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums;
  border-radius: 0 0 var(--r-br) var(--r-bl);
}
.nm-statusbar b { color: var(--text-2); font-weight: 600; }
.nm-statusbar .rec-dot { display: inline-flex; align-items: center; gap: 6px; }
.nm-statusbar .rec-dot::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--err); animation: nm-pulse 1.6s infinite; }
.nm-statusbar .rec-dot.paused::before { background: var(--muted); animation: none; }
.nm-statusbar .err-count { color: var(--err); }
.nm-statusbar .hint { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }

/* ---------- toast ---------- */
.nm-toast {
  position: absolute; left: 50%; bottom: 40px; transform: translate(-50%, 8px); opacity: 0; pointer-events: none;
  display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 9px;
  background: var(--text); color: var(--bg); font-weight: 600; font-size: 12px; z-index: 10;
  transition: opacity .16s, transform .16s; box-shadow: 0 10px 30px -10px rgba(0,0,0,.5);
}
.nm-toast.show { opacity: 1; transform: translate(-50%, 0); }
.nm-toast svg { width: 14px; height: 14px; }

/* scrollbars */
.nm-panel ::-webkit-scrollbar { width: 10px; height: 10px; }
.nm-panel ::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }
.nm-panel ::-webkit-scrollbar-thumb:hover { background: var(--border-strong); background-clip: padding-box; border: 2px solid transparent; }
.nm-panel ::-webkit-scrollbar-corner { background: transparent; }

/* ---------- responsive (panel width, not viewport) ---------- */
.nm-panel { container: panel / inline-size; }
.nm-chip .short { display: none; }
@container panel (max-width: 900px) {
  .nm-toolbar .nm-btn .lbl { display: none; }
  .nm-toolbar .nm-btn { padding: 0 7px; }
  .nm-chip .full { display: none; }
  .nm-chip .short { display: inline; }
}
@container panel (max-width: 640px) {
  .nm-host, .nm-statusbar .hint { display: none; }
  .nm-body.has-detail .nm-list-pane, .nm-body.has-detail .nm-splitter { display: none; }
  .nm-switch span:last-child { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .nm-panel, .nm-panel * { animation: none !important; transition: none !important; }
}
`;
})();
