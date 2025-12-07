const TOAST_STYLE_ID = "marketpulseai-toast-style";
const TOAST_CONTAINER_ID = "marketpulseai-toast-container";
const DEFAULT_DURATION_MS = 4500;
const NAVIGATION_BOOTSTRAP_FLAG = "__marketpulseai_navigation_bootstrap__";
const SNAPSHOT_BOOTSTRAP_FLAG = "__marketpulseai_snapshot_bootstrap__";

function detectSymbolFromUrl(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/\/instInfo\/([^/?#"'\s]+)(?=[/?#]|$)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function ensureToastStyles() {
  if (document.getElementById(TOAST_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = TOAST_STYLE_ID;
  style.textContent = `
    #${TOAST_CONTAINER_ID} {
      position: fixed;
      bottom: 18px;
      right: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 2147483647;
      pointer-events: none;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .marketpulseai-toast {
      background: rgba(32, 33, 36, 0.92);
      color: #f9fafa;
      padding: 10px 12px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.08);
      min-width: 240px;
      max-width: 360px;
      pointer-events: auto;
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 10px;
      row-gap: 2px;
      align-items: center;
      backdrop-filter: blur(8px);
    }

    .marketpulseai-toast__pill {
      background: #0ea5e9;
      color: #0b1721;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .marketpulseai-toast__title {
      font-size: 13px;
      font-weight: 700;
      margin: 0;
    }

    .marketpulseai-toast__subtitle {
      font-size: 12px;
      margin: 0;
      opacity: 0.85;
    }
  `;

  document.head.appendChild(style);
}

function ensureToastContainer() {
  const existing = document.getElementById(TOAST_CONTAINER_ID);
  if (existing) return existing;

  const container = document.createElement("div");
  container.id = TOAST_CONTAINER_ID;
  (document.body || document.documentElement).appendChild(container);
  return container;
}

function createToast({ title, subtitle, summary, duration = DEFAULT_DURATION_MS }) {
  ensureToastStyles();
  const container = ensureToastContainer();

  const toast = document.createElement("article");
  toast.className = "marketpulseai-toast";

  const pill = document.createElement("span");
  pill.className = "marketpulseai-toast__pill";
  pill.textContent = "Batch";

  const heading = document.createElement("p");
  heading.className = "marketpulseai-toast__title";
  heading.textContent = title || "Collection updated";

  const spacer = document.createElement("span");

  const detail = document.createElement("p");
  detail.className = "marketpulseai-toast__subtitle";
  detail.textContent = subtitle || summary || "Progress noted";

  toast.appendChild(pill);
  toast.appendChild(heading);
  toast.appendChild(spacer);
  toast.appendChild(detail);

  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function renderProgressToast({ symbol, summary, remaining }) {
  const title = symbol ? `Captured ${symbol}` : "Collection batch saved";
  const subtitle = summary ? `Progress ${summary}` : undefined;
  const tail = Number.isFinite(remaining) ? `Remaining ${remaining}` : null;
  const mergedSubtitle = tail ? `${subtitle} · ${tail}` : subtitle;

  createToast({ title, subtitle: mergedSubtitle, summary });
}

const chromeApi = globalThis.chrome;

function queueSymbolNavigationFromPage() {
  const runtime = chromeApi?.runtime;
  const symbols = collectSymbolsFromPage();
  if (!runtime?.sendMessage || globalThis[NAVIGATION_BOOTSTRAP_FLAG] || !symbols.length) return;

  globalThis[NAVIGATION_BOOTSTRAP_FLAG] = true;

  runtime.sendMessage({ type: "NAVIGATE_SYMBOLS", symbols }).catch(() => {
    globalThis[NAVIGATION_BOOTSTRAP_FLAG] = false;
  });
}

function collectSymbolsFromPage() {
  const symbolFromUrl = detectSymbolFromUrl(globalThis.location?.href || "");

  const anchors = Array.from(document.querySelectorAll('a[href*="/instinfo/" i]'))
    .map((anchor) => anchor.getAttribute("href") || anchor.href)
    .map((href) => detectSymbolFromUrl(href))
    .filter(Boolean);

  return [symbolFromUrl, ...anchors].filter(Boolean);
}

function captureSnapshotFromPage() {
  const runtime = chromeApi?.runtime;
  if (!runtime?.sendMessage || globalThis[SNAPSHOT_BOOTSTRAP_FLAG]) return;

  const url = globalThis.location?.href || "";
  const symbol = detectSymbolFromUrl(url);
  if (!symbol) return;

  function attemptSend() {
    const topBox = document.getElementById("TopBox");
    const hasData =
      topBox &&
      ["d02", "d03", "d04"].some((id) => {
        const node = topBox.querySelector(`#${id}`);
        return node && Boolean(node.textContent?.trim());
      });

    if (!hasData) return false;

    const html = document.documentElement?.outerHTML ?? "";
    if (!html.trim()) return false;

    globalThis[SNAPSHOT_BOOTSTRAP_FLAG] = true;
    const symbols = collectSymbolsFromPage();
    runtime.sendMessage({ type: "SAVE_PAGE_SNAPSHOT", url, symbol, html, symbols }).catch(() => {
      globalThis[SNAPSHOT_BOOTSTRAP_FLAG] = false;
    });

    return true;
  }

  if (attemptSend()) return;

  const observer = new MutationObserver(() => {
    if (attemptSend()) {
      observer.disconnect();
    }
  });

  observer.observe(document, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 8000);
}

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((message) => {
    if (!message?.type) return undefined;

    if (message.type === "COLLECTION_PROGRESS") {
      const { symbol, summary, remaining } = message;
      console.debug("Collection progress", message);
      renderProgressToast({ symbol, summary, remaining });
      return undefined;
    }

    return undefined;
  });
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  queueSymbolNavigationFromPage();
  captureSnapshotFromPage();
} else {
  document.addEventListener("DOMContentLoaded", queueSymbolNavigationFromPage, {
    once: true,
  });
  document.addEventListener("DOMContentLoaded", captureSnapshotFromPage, {
    once: true,
  });
}
