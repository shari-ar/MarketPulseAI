const NEXT_DATA_SCRIPT_REGEX = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
const INST_INFO_LINK_REGEX = /\/InstInfo\/([^/?#"'\s]+)/i;

function parseNumberFromText(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[^\d.-]/g, "").replace(/\.(?=.*\.)/g, "");
  if (!cleaned.trim()) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function coerceNumber(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/,/g, "").trim();
  if (normalized === "") return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function coerceTextNumber(value) {
  if (value === undefined || value === null) return null;
  const normalized = parseNumberFromText(String(value));
  return normalized ?? null;
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

function normalizePriceRecordFromText(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const open = coerceTextNumber(raw.open);
  const high = coerceTextNumber(raw.high);
  const low = coerceTextNumber(raw.low);
  const close = coerceTextNumber(raw.close);
  const last = coerceTextNumber(raw.last);

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

function extractTopBoxFromDom(root = globalThis.document) {
  if (!root?.querySelector) return null;
  const container = root.querySelector("#TopBox") ?? root;

  const openText = container.querySelector("#d04")?.textContent ?? null;
  const closeText = container.querySelector("#d03")?.textContent ?? null;
  const lastText = container.querySelector("#d02")?.textContent ?? null;

  let rangeLow = null;
  let rangeHigh = null;

  const rangeLabel = Array.from(container.querySelectorAll("td")).find((cell) =>
    cell.textContent?.includes("بازه روز")
  );

  if (rangeLabel?.parentElement) {
    const values = Array.from(rangeLabel.parentElement.querySelectorAll("div"))
      .map((node) => coerceTextNumber(node.textContent))
      .filter((num) => num !== null);

    if (values.length >= 2) {
      [rangeLow, rangeHigh] = values;
    } else if (values.length === 1) {
      rangeLow = rangeHigh = values[0];
    }
  }

  return normalizePriceRecordFromText({
    open: openText,
    close: closeText,
    last: lastText,
    low: rangeLow,
    high: rangeHigh,
  });
}

function extractTopBoxFromHtml(html) {
  if (typeof html !== "string") return null;

  const openMatch = html.match(/id=["']d04["'][^>]*>\s*<div[^>]*>\s*<div[^>]*>([^<]*)/i);
  const closeMatch = html.match(/id=["']d03["'][^>]*>\s*<div[^>]*>\s*<div[^>]*>([^<]*)/i);
  const lastMatch = html.match(/id=["']d02["'][^>]*>\s*<div[^>]*>\s*<div[^>]*>([^<]*)/i);
  const rangeMatch = html.match(
    /بازه روز<\/td>\s*<td>\s*<div[^>]*>\s*<div[^>]*>([^<]*)<\/div>\s*<\/div>\s*<\/td>\s*<td>\s*<div[^>]*>\s*<div[^>]*>([^<]*)/i
  );

  const open = coerceTextNumber(openMatch?.[1]);
  const close = coerceTextNumber(closeMatch?.[1]);
  const last = coerceTextNumber(lastMatch?.[1]);
  const low = coerceTextNumber(rangeMatch?.[1]);
  const high = coerceTextNumber(rangeMatch?.[2]);

  return normalizePriceRecordFromText({ open, close, last, low, high });
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
  if (parsed) {
    const rawPrice = searchForPriceObject(parsed);
    const normalized = normalizePriceRecord(rawPrice);
    if (normalized) return normalized;
  }

  const domPrices = extractTopBoxFromHtml(html);
  if (domPrices) return domPrices;

  return null;
}

export function extractPriceInfoFromDom(root = globalThis.document) {
  return extractTopBoxFromDom(root);
}

export function extractSymbolsFromHtml(html = "") {
  if (typeof html !== "string") return [];
  return Array.from(new Set([...html.matchAll(INST_INFO_LINK_REGEX)].map((match) => match[1])));
}
