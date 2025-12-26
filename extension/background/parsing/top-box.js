export const DEFAULT_SELECTORS = {
  symbolName: "[data-symbol-name], #symbolName, .symbol-name",
  symbolAbbreviation: "[data-symbol-code], #symbolCode, .symbol-code",
  close: "[data-close], #close, .close",
  primeCost: "[data-prime-cost], #primeCost, .prime-cost",
  open: "[data-open], #open, .open",
  high: "[data-high], #high, .high",
  low: "[data-low], #low, .low",
  allowedHigh: "[data-allowed-high], #allowedHigh",
  allowedLow: "[data-allowed-low], #allowedLow",
  tradesCount: "[data-trades], #tradesCount",
  tradingVolume: "[data-volume], #tradingVolume",
  tradingValue: "[data-value], #tradingValue",
  marketValue: "[data-market-value], #marketValue",
  closeTime: "[data-close-time], #closeTime",
  status: "[data-status], #status",
  shareCount: "[data-share-count], #shareCount",
  baseVolume: "[data-base-volume], #baseVolume",
  floatingShares: "[data-float], #floatingShares",
  averageMonthlyVolume: "[data-avg-monthly-volume], #averageMonthlyVolume",
  naturalBuyVolume: "[data-natural-buy-volume], #naturalBuyVolume",
  naturalSellVolume: "[data-natural-sell-volume], #naturalSellVolume",
  juridicalBuyVolume: "[data-juridical-buy-volume], #juridicalBuyVolume",
  juridicalSellVolume: "[data-juridical-sell-volume], #juridicalSellVolume",
  totalBuyVolume: "[data-total-buy-volume], #totalBuyVolume",
  totalSellVolume: "[data-total-sell-volume], #totalSellVolume",
  naturalBuyCount: "[data-natural-buy-count], #naturalBuyCount",
  naturalSellCount: "[data-natural-sell-count], #naturalSellCount",
  juridicalBuyCount: "[data-juridical-buy-count], #juridicalBuyCount",
  juridicalSellCount: "[data-juridical-sell-count], #juridicalSellCount",
  totalBuyCount: "[data-total-buy-count], #totalBuyCount",
  totalSellCount: "[data-total-sell-count], #totalSellCount",
};

/**
 * Extracts a snapshot payload from the current document context.
 * This function is serialized into the target tab via chrome.scripting.
 */
export function parseTopBoxSnapshot({ selectors, symbol, nowIso }) {
  const localSelectors = selectors || {};
  const fields = {
    ...localSelectors,
  };

  const persianDigits = new Map([
    ["۰", "0"],
    ["۱", "1"],
    ["۲", "2"],
    ["۳", "3"],
    ["۴", "4"],
    ["۵", "5"],
    ["۶", "6"],
    ["۷", "7"],
    ["۸", "8"],
    ["۹", "9"],
  ]);

  const normalizeDigits = (value) =>
    value
      .split("")
      .map((char) => persianDigits.get(char) || char)
      .join("");

  const getText = (selector) => {
    if (!selector) return null;
    const element = document.querySelector(selector);
    return element ? element.textContent?.trim() : null;
  };

  const parseNumber = (selector) => {
    const raw = getText(selector);
    if (!raw) return null;
    const normalized = normalizeDigits(raw).replace(/,/g, "").replace(/\s/g, "").replace(/%/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  };

  return {
    id: symbol || getText(fields.symbolAbbreviation) || getText(fields.symbolName),
    dateTime: nowIso,
    symbolName: getText(fields.symbolName),
    symbolAbbreviation: getText(fields.symbolAbbreviation),
    predictedSwingPercent: null,
    predictedSwingProbability: null,
    close: parseNumber(fields.close),
    primeCost: parseNumber(fields.primeCost),
    open: parseNumber(fields.open),
    tradesCount: parseNumber(fields.tradesCount),
    tradingVolume: parseNumber(fields.tradingVolume),
    tradingValue: parseNumber(fields.tradingValue),
    marketValue: parseNumber(fields.marketValue),
    closeTime: getText(fields.closeTime),
    status: getText(fields.status),
    low: parseNumber(fields.low),
    high: parseNumber(fields.high),
    allowedLow: parseNumber(fields.allowedLow),
    allowedHigh: parseNumber(fields.allowedHigh),
    shareCount: parseNumber(fields.shareCount),
    baseVolume: parseNumber(fields.baseVolume),
    floatingShares: parseNumber(fields.floatingShares),
    averageMonthlyVolume: parseNumber(fields.averageMonthlyVolume),
    naturalBuyVolume: parseNumber(fields.naturalBuyVolume),
    naturalSellVolume: parseNumber(fields.naturalSellVolume),
    juridicalBuyVolume: parseNumber(fields.juridicalBuyVolume),
    juridicalSellVolume: parseNumber(fields.juridicalSellVolume),
    totalBuyVolume: parseNumber(fields.totalBuyVolume),
    totalSellVolume: parseNumber(fields.totalSellVolume),
    naturalBuyCount: parseNumber(fields.naturalBuyCount),
    naturalSellCount: parseNumber(fields.naturalSellCount),
    juridicalBuyCount: parseNumber(fields.juridicalBuyCount),
    juridicalSellCount: parseNumber(fields.juridicalSellCount),
    totalBuyCount: parseNumber(fields.totalBuyCount),
    totalSellCount: parseNumber(fields.totalSellCount),
  };
}
