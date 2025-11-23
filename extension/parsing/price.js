const NEXT_DATA_SCRIPT_REGEX = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
const DOM_PRICE_SELECTOR = "#TopBox > div.box2.zi1";

function coerceNumber(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/,/g, "").trim();
  if (normalized === "") return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function looksLikePriceShape(candidate = {}) {
  if (!candidate || typeof candidate !== "object") return false;
  const numericKeys = [
    "open",
    "high",
    "low",
    "close",
    "final",
    "finalPrice",
    "last",
    "lastPrice",
    "priceMin",
    "priceMax",
    "priceYesterday",
  ];
  return numericKeys.some((key) => candidate[key] !== undefined);
}

function normalizePriceRecord(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const open = coerceNumber(raw.open ?? raw.priceYesterday);
  const high = coerceNumber(raw.high ?? raw.priceMax);
  const low = coerceNumber(raw.low ?? raw.priceMin);
  const close = coerceNumber(raw.close ?? raw.final ?? raw.finalPrice);
  const last = coerceNumber(raw.last ?? raw.lastPrice);

  const values = { open, high, low, close, last };
  const hasAny = Object.values(values).some((value) => value !== null);
  return hasAny ? values : null;
}

function searchForPriceObject(node) {
  if (!node || typeof node !== "object") return null;

  if (looksLikePriceShape(node)) {
    return node;
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = searchForPriceObject(value);
      if (found) return found;
    }
  }

  return null;
}

function extractJsonFromNextData(htmlOrJson) {
  if (typeof htmlOrJson !== "string") return null;

  const trimmed = htmlOrJson.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // fall through to search inside markup
  }

  const match = trimmed.match(NEXT_DATA_SCRIPT_REGEX);
  if (!match) return null;

  const jsonText = match[1]?.trim();
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    return null;
  }
}

export function extractPriceInfoFromDom(root = globalThis?.document) {
  if (!root?.querySelector) return null;

  const priceNode = root.querySelector(DOM_PRICE_SELECTOR);
  const text = priceNode?.textContent ?? "";

  const [last] = (text.match(/[\d,.]+/g) || []).map(coerceNumber).filter((value) => value !== null);

  return last !== undefined ? normalizePriceRecord({ last }) : null;
}

export function extractPriceInfoFromPage(html) {
  const parsed = extractJsonFromNextData(html);
  if (parsed) {
    const rawPrice = searchForPriceObject(parsed);
    const normalized = normalizePriceRecord(rawPrice);
    if (normalized) return normalized;
  }

  return extractPriceInfoFromDom();
}
