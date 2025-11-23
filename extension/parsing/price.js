const NEXT_DATA_SCRIPT_REGEX = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

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

function extractJsonFromNextData(html) {
  if (typeof html !== "string") return null;
  const match = html.match(NEXT_DATA_SCRIPT_REGEX);
  if (!match) return null;

  const jsonText = match[1]?.trim();
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    return null;
  }
}

export function extractPriceInfoFromPage(html) {
  const parsed = extractJsonFromNextData(html);
  if (!parsed) return null;

  const rawPrice = searchForPriceObject(parsed);
  return normalizePriceRecord(rawPrice);
}
