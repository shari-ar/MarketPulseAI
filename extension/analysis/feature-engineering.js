const BASE_PRICE_FIELDS = [
  "primeCost",
  "open",
  "close",
  "high",
  "low",
  "allowedHigh",
  "allowedLow",
];

const LIQUIDITY_FIELDS = [
  "tradingVolume",
  "tradingValue",
  "tradesCount",
  "baseVolume",
  "averageMonthlyVolume",
];

const FLOW_VOLUME_FIELDS = [
  "naturalBuyVolume",
  "naturalSellVolume",
  "juridicalBuyVolume",
  "juridicalSellVolume",
  "totalBuyVolume",
  "totalSellVolume",
];

const FLOW_COUNT_FIELDS = [
  "naturalBuyCount",
  "naturalSellCount",
  "juridicalBuyCount",
  "juridicalSellCount",
  "totalBuyCount",
  "totalSellCount",
];

const SUPPLY_FIELDS = ["marketValue", "shareCount", "floatingShares"];

export const RAW_FEATURE_FIELDS = [
  ...BASE_PRICE_FIELDS,
  ...LIQUIDITY_FIELDS,
  ...FLOW_VOLUME_FIELDS,
  ...FLOW_COUNT_FIELDS,
  ...SUPPLY_FIELDS,
];

const ENGINEERED_FEATURES = [
  "returnClose",
  "returnPrimeCost",
  "rangeRatio",
  "intradayRangeRatio",
  "liquidityVolumeRatio",
  "buySellVolumeRatio",
  "naturalBuyToJuridicalBuyRatio",
  "naturalSellToJuridicalSellRatio",
  "naturalBuyToJuridicalBuyCountRatio",
  "naturalSellToJuridicalSellCountRatio",
];

const VOLUME_RATIO_FIELDS = [
  "tradingVolume",
  "tradingValue",
  "totalBuyVolume",
  "totalSellVolume",
  "naturalBuyVolume",
  "naturalSellVolume",
  "juridicalBuyVolume",
  "juridicalSellVolume",
  "baseVolume",
  "averageMonthlyVolume",
];

const COUNT_RATIO_FIELDS = [
  "tradesCount",
  "totalBuyCount",
  "totalSellCount",
  "naturalBuyCount",
  "naturalSellCount",
  "juridicalBuyCount",
  "juridicalSellCount",
];

export function createRatioFeatureNames(fields) {
  const names = [];
  for (let i = 0; i < fields.length; i += 1) {
    for (let j = i + 1; j < fields.length; j += 1) {
      names.push(`${fields[i]}To${fields[j]}Ratio`);
    }
  }
  return names;
}

export const VOLUME_RATIO_FEATURES = createRatioFeatureNames(VOLUME_RATIO_FIELDS);
export const COUNT_RATIO_FEATURES = createRatioFeatureNames(COUNT_RATIO_FIELDS);

export const BASE_FEATURE_ORDER = [
  ...RAW_FEATURE_FIELDS,
  ...ENGINEERED_FEATURES,
  ...VOLUME_RATIO_FEATURES,
  ...COUNT_RATIO_FEATURES,
];

export const FEATURE_ORDER = [
  ...BASE_FEATURE_ORDER,
  ...BASE_FEATURE_ORDER.map((name) => `${name}_z`),
];

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function safeDivide(numerator, denominator, fallback = 0) {
  if (!isValidNumber(numerator) || !isValidNumber(denominator) || denominator === 0) {
    return fallback;
  }
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : fallback;
}

function sortWindowAscending(window) {
  return window
    .slice()
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
}

function backfillWindow(window) {
  const filled = window.map((entry) => ({ ...entry }));
  const lastValid = {};

  filled.forEach((entry) => {
    RAW_FEATURE_FIELDS.forEach((field) => {
      const value = entry[field];
      if (isValidNumber(value)) {
        lastValid[field] = value;
        return;
      }
      if (lastValid[field] !== undefined) {
        entry[field] = lastValid[field];
      }
    });
  });

  const isComplete = filled.every((entry) =>
    RAW_FEATURE_FIELDS.every((field) => isValidNumber(entry[field]))
  );

  return isComplete ? filled : null;
}

function computeEngineeredFeatures(entry, previous) {
  const primeCost = entry.primeCost;

  return {
    returnClose: safeDivide(entry.close - previous.close, previous.close),
    returnPrimeCost: safeDivide(entry.primeCost - previous.primeCost, previous.primeCost),
    rangeRatio: safeDivide(entry.high - entry.low, primeCost),
    intradayRangeRatio: safeDivide(entry.close - entry.open, primeCost),
    liquidityVolumeRatio: safeDivide(entry.tradingVolume, entry.averageMonthlyVolume),
    buySellVolumeRatio: safeDivide(entry.totalBuyVolume, entry.totalSellVolume),
    naturalBuyToJuridicalBuyRatio: safeDivide(entry.naturalBuyVolume, entry.juridicalBuyVolume),
    naturalSellToJuridicalSellRatio: safeDivide(entry.naturalSellVolume, entry.juridicalSellVolume),
    naturalBuyToJuridicalBuyCountRatio: safeDivide(entry.naturalBuyCount, entry.juridicalBuyCount),
    naturalSellToJuridicalSellCountRatio: safeDivide(
      entry.naturalSellCount,
      entry.juridicalSellCount
    ),
  };
}

function computeCrossRatios(entry, fields, ratioNames) {
  const ratios = {};
  let index = 0;

  for (let i = 0; i < fields.length; i += 1) {
    for (let j = i + 1; j < fields.length; j += 1) {
      ratios[ratioNames[index]] = safeDivide(entry[fields[i]], entry[fields[j]]);
      index += 1;
    }
  }

  return ratios;
}

function computeZScores(featureRows, featureNames) {
  const stats = {};
  featureNames.forEach((name) => {
    const values = featureRows.map((row) => row[name]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const std = variance > 0 ? Math.sqrt(variance) : 1;
    stats[name] = { mean, std };
  });

  return featureRows.map((row) => {
    const withZ = { ...row };
    featureNames.forEach((name) => {
      const { mean, std } = stats[name];
      withZ[`${name}_z`] = (row[name] - mean) / std;
    });
    return withZ;
  });
}

function applyScalers(featureRow, scalers) {
  if (!scalers) return featureRow;
  const normalized = { ...featureRow };
  Object.keys(featureRow).forEach((name) => {
    const scaler = scalers[name];
    if (!scaler) return;
    const mean = scaler.mean ?? 0;
    const std = scaler.std ?? 1;
    if (!isValidNumber(mean) || !isValidNumber(std) || std === 0) return;
    normalized[name] = (featureRow[name] - mean) / std;
  });
  return normalized;
}

export function buildFeatureWindow(window, { scalers } = {}) {
  if (!Array.isArray(window) || window.length < 7) return null;
  const ordered = sortWindowAscending(window);
  const filled = backfillWindow(ordered);
  if (!filled) return null;

  const rows = filled.map((entry, index) => {
    const previous = index === 0 ? entry : filled[index - 1];
    const engineered = computeEngineeredFeatures(entry, previous);
    const volumeRatios = computeCrossRatios(entry, VOLUME_RATIO_FIELDS, VOLUME_RATIO_FEATURES);
    const countRatios = computeCrossRatios(entry, COUNT_RATIO_FIELDS, COUNT_RATIO_FEATURES);

    const row = {};
    RAW_FEATURE_FIELDS.forEach((field) => {
      row[field] = entry[field];
    });
    Object.assign(row, engineered, volumeRatios, countRatios);

    return row;
  });

  const zRows = computeZScores(rows, BASE_FEATURE_ORDER);
  const scaledRows = zRows.map((row) => applyScalers(row, scalers));

  return {
    rows: scaledRows,
    latest: filled[filled.length - 1],
  };
}

export function aggregateFeatureRows(rows = [], featureNames = FEATURE_ORDER) {
  if (!rows.length) return null;
  const totals = {};
  featureNames.forEach((name) => {
    totals[name] = 0;
  });

  rows.forEach((row) => {
    featureNames.forEach((name) => {
      totals[name] += row[name] ?? 0;
    });
  });

  const averaged = {};
  featureNames.forEach((name) => {
    averaged[name] = totals[name] / rows.length;
  });

  return averaged;
}
