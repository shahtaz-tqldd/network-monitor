# Network Monitor — API & WebSocket Inspector

A Chrome extension (Manifest V3) that shows a page's API traffic in an in-page panel. You can float it, dock it or resize it. It captures **fetch**, **XMLHttpRequest**, **WebSocket** and **EventSource (SSE)** traffic, with headers, payloads, responses and socket messages.

## Features

- **Captures the page's network calls.** It covers fetch, XHR, WebSocket (sent and received frames) and Server-Sent Events.
- **Request details.**
  - **Headers:** general info, response headers and request headers.
  - **Payload:** query parameters, JSON (pretty or raw), form data and URL-encoded bodies.
  - **Response:** syntax-highlighted JSON, with pretty/raw, wrap and copy.
  - **Timing:** time to first byte, download time and total.
  - **Messages** (sockets): a live frame list. You can filter by text or by direction (sent/received), expand a frame to see it pretty-printed, and clear the messages for one connection.
- **Filtering.** Type chips (All / Fetch / XHR / WebSocket / SSE) show live counts. An **Errors** chip shows only failed requests. Text search matches URL, method and status, and a `-term` excludes matches.
- **Layout.** You can drag the panel, resize it from any edge or corner, maximize it (double-click the title bar), or dock it right or bottom. Drag a docked panel's title bar to pop it back out. The divider between the list and the details is draggable too (double-click resets it). Position and size are remembered and kept within the window.
- **Responsive.** At narrow widths the toolbar becomes compact and the details take the full panel width.
- **Clearing and memory.**
  - **Clear** (or `Ctrl/⌘+L`) wipes the captured list and the saved log.
  - **Preserve log** keeps requests across reloads and navigations in the same tab. Restored entries are dimmed.
  - **Pause recording** stops capturing.
  - Memory is capped at 1,000 requests, 2,000 frames per socket and 1 MB per body. The oldest data is dropped first.
- **Extras.** Copy URL, **Copy as cURL**, **Export HAR** (opens in Chrome DevTools, WebSocket messages included), dark and light themes, and a request-count badge on the toolbar icon.

## Installation

1. Open `chrome://extensions/`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Usage

- Open the panel by clicking the toolbar icon or pressing **Alt+Shift+N**. You can change the shortcut at `chrome://extensions/shortcuts`.
- Tabs that were already open when you installed the extension get the panel injected when you click the icon. Reload the page to capture requests that happened before that.

| Shortcut (panel focused) | Action |
| --- | --- |
| `↑` / `↓`, `Home` / `End` | Move through requests |
| `Esc` | Close details |
| `/` or `Ctrl/⌘+F` | Focus search |
| `Ctrl/⌘+L` | Clear |

## Project structure

```
manifest.json
icons/                        toolbar / store icons
src/
  background/service-worker.js  toggle, on-demand injection, per-tab state, badge
  inject/interceptor.js          MAIN-world hooks: fetch, XHR, WebSocket, EventSource
  content/                       isolated-world UI (loaded in this order)
    utils.js     helpers (formatting, JSON highlight, cURL, clipboard)
    icons.js     inline SVG icons
    styles.js    panel CSS (lives in a Shadow DOM)
    store.js     bounded request store + preserve-log snapshot
    layout.js    drag / resize / dock / maximize / splitter
    details.js   detail pane tabs + socket message viewer
    panel.js     shell, toolbar, list, status bar, HAR export
    main.js      bootstrap and wiring
```

## How it works

- `interceptor.js` is declared with `"world": "MAIN"` at `document_start`. It wraps the page's own `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` before any page script runs. Because it is a registered content script and not an inline `<script>`, the site's Content-Security-Policy cannot block it.
- Captured events go to the isolated content script through a private `CustomEvent`. They never reach the page's own `message` listeners.
- The UI is rendered inside a Shadow DOM, so the site's CSS cannot affect it and the panel's CSS cannot affect the site.
- Per-tab state (panel visibility, preserved log) is kept in `chrome.storage.session`. It is removed when the tab closes and cleared when the browser exits.

## Limitations

- Only traffic started by page scripts is captured. Images, stylesheets, document loads, iframes and service-worker traffic are not.
- Request headers added by the browser (Cookie, User-Agent, …) are invisible to page scripts, so they don't appear. Cross-origin responses only expose CORS-allowed headers.
- WebSocket handshake headers and named SSE events (`addEventListener('custom', …)`) are not captured.
- Pages that Chrome doesn't let extensions script (`chrome://`, the Web Store) can't be inspected.

## Permissions

- `storage`: remembers settings, layout and the preserved log.
- `scripting`: injects the panel into tabs that were open before installation.
- `<all_urls>` host access: runs the capture script on the sites you inspect.
