const chromeApi = globalThis?.chrome ?? globalThis?.browser ?? null;

(() => {
  const TOAST_STYLE_ID = "marketpulseai-toast-style";
  const TOAST_CONTAINER_ID = "marketpulseai-toast-container";
  const DEFAULT_DURATION_MS = 4500;

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
})();
