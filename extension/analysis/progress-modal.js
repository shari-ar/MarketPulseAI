const MODAL_ID = "marketpulseai-analysis-modal";
const STYLE_ID = "marketpulseai-analysis-style";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(11, 23, 33, 0.55);
      backdrop-filter: blur(6px);
      z-index: 2147483646;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${MODAL_ID} .analysis-modal__card {
      background: #0b1721;
      color: #f8fafc;
      padding: 20px 22px;
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.08);
      width: min(520px, 88vw);
      display: grid;
      row-gap: 10px;
    }

    #${MODAL_ID} .analysis-modal__title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
    }

    #${MODAL_ID} .analysis-modal__subtitle {
      margin: 0;
      font-size: 14px;
      opacity: 0.86;
      line-height: 1.4;
    }

    #${MODAL_ID} .analysis-modal__meter {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      height: 12px;
      overflow: hidden;
      position: relative;
    }

    #${MODAL_ID} .analysis-modal__meter-fill {
      background: linear-gradient(90deg, #22d3ee, #3b82f6);
      height: 100%;
      width: 0%;
      border-radius: inherit;
      transition: width 120ms ease-out;
    }

    #${MODAL_ID} .analysis-modal__meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: rgba(248, 250, 252, 0.9);
    }

    #${MODAL_ID} .analysis-modal__meta span {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }

    #${MODAL_ID} .analysis-modal__dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #22d3ee;
      box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.25);
    }
  `;

  document.head.appendChild(style);
}

function destroyExistingModal() {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
  }
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function createAnalysisProgressModal({
  title = "Running analysis",
  subtitle = "Preparing batches...",
} = {}) {
  if (typeof document === "undefined") return null;

  ensureStyles();
  destroyExistingModal();

  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", title);

  const card = document.createElement("section");
  card.className = "analysis-modal__card";

  const heading = document.createElement("h2");
  heading.className = "analysis-modal__title";
  heading.textContent = title;

  const detail = document.createElement("p");
  detail.className = "analysis-modal__subtitle";
  detail.textContent = subtitle;

  const meter = document.createElement("div");
  meter.className = "analysis-modal__meter";

  const fill = document.createElement("div");
  fill.className = "analysis-modal__meter-fill";
  fill.style.width = "0%";
  fill.setAttribute("role", "progressbar");
  fill.setAttribute("aria-valuemin", "0");
  fill.setAttribute("aria-valuemax", "100");
  fill.setAttribute("aria-valuenow", "0");

  meter.appendChild(fill);

  const meta = document.createElement("div");
  meta.className = "analysis-modal__meta";

  const leftMeta = document.createElement("span");
  const dot = document.createElement("span");
  dot.className = "analysis-modal__dot";
  const metaLabel = document.createElement("strong");
  metaLabel.textContent = "Inference";
  leftMeta.appendChild(dot);
  leftMeta.appendChild(metaLabel);

  const rightMeta = document.createElement("span");
  rightMeta.textContent = "0%";

  meta.appendChild(leftMeta);
  meta.appendChild(rightMeta);

  card.appendChild(heading);
  card.appendChild(detail);
  card.appendChild(meter);
  card.appendChild(meta);
  overlay.appendChild(card);

  document.body.appendChild(overlay);

  function setProgress({ completed = 0, total = 1, label } = {}) {
    const denominator = total || 1;
    const percentage = clampPercent((completed / denominator) * 100);
    const rounded = Math.round(percentage);
    fill.style.width = `${percentage}%`;
    fill.setAttribute("aria-valuenow", String(rounded));
    rightMeta.textContent = `${rounded}%`;
    if (label) {
      detail.textContent = label;
    }
  }

  function setStatus(text) {
    if (typeof text === "string" && text.trim()) {
      detail.textContent = text.trim();
    }
  }

  function complete(text = "Analysis complete") {
    setProgress({ completed: 1, total: 1 });
    setStatus(text);
  }

  function destroy() {
    overlay.remove();
  }

  return {
    element: overlay,
    setProgress,
    setStatus,
    complete,
    destroy,
  };
}
