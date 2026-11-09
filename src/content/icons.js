/* Inline SVG icons (stroke-based, 24px grid). */
(() => {
  'use strict';
  const NM = (globalThis.NM = globalThis.NM || {});

  const svg = (body, extra = '') =>
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

  NM.icons = {
    logo: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    record: svg('<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>'),
    pause: svg('<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>'),
    clear: svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    download: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    float: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="11" y="11" width="8" height="8" rx="1" fill="currentColor" stroke="none" opacity=".5"/>'),
    dockRight: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18"/><rect x="14" y="3" width="7" height="18" fill="currentColor" stroke="none" opacity=".5"/>'),
    dockBottom: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 14h18"/><rect x="3" y="14" width="18" height="7" fill="currentColor" stroke="none" opacity=".5"/>'),
    maximize: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
    restore: svg('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>'),
    arrowUp: svg('<path d="M12 19V5m-6 6 6-6 6 6"/>', 'stroke-width="2.5"'),
    arrowDown: svg('<path d="M12 5v14m6-6-6 6-6-6"/>', 'stroke-width="2.5"'),
    reload: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
    wrap: svg('<path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4m0 0 2-2m-2 2 2 2M3 18h7"/>'),
    braces: svg('<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>'),
    terminal: svg('<path d="m4 17 6-6-6-6M12 19h8"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    plug: svg('<path d="M12 22v-5M9 8V2m6 6V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>'),
    inbox: svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>'),
    filterOff: svg('<path d="M3 3l18 18M8 6h13l-5 7v6l-4 2v-8L8.5 9"/>'),
    history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  };
})();
