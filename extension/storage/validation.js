const TIMESTAMP_FIELDS = ["dateTime"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value) {
  return isFiniteNumber(value) ? value : null;
}

export function validateSnapshotRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["Record must be an object"] };
  }

  const id = normalizeString(record.id);
  if (!id) {
    errors.push("id is required");
  }

  for (const field of TIMESTAMP_FIELDS) {
    if (!normalizeTimestamp(record[field])) {
      errors.push(`${field} must be a valid timestamp`);
    }
  }

  const numericFields = [
    "lastTrade",
    "closingPrice",
    "firstPrice",
    "tradesCount",
    "tradingVolume",
    "tradingValue",
    "marketValue",
    "dailyLowRange",
    "dailyHighRange",
    "allowedLowPrice",
    "allowedHighPrice",
    "shareCount",
    "baseVolume",
    "floatingShares",
    "averageMonthlyVolume",
    "realBuyVolume",
    "realSellVolume",
    "legalBuyVolume",
    "legalSellVolume",
    "totalBuyVolume",
    "totalSellVolume",
    "realBuyCount",
    "realSellCount",
    "legalBuyCount",
    "legalSellCount",
    "totalBuyCount",
    "totalSellCount",
  ];

  for (const field of numericFields) {
    const value = record[field];
    if (value === undefined || value === null || value === "") continue;
    if (!isFiniteNumber(value)) {
      errors.push(`${field} must be a finite number when provided`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidSnapshotRecord(record) {
  const { valid, errors } = validateSnapshotRecord(record);
  if (!valid) {
    throw new Error(`Invalid snapshot record: ${errors.join("; ")}`);
  }
  return record;
}

export function normalizeDateTime(dateTime) {
  const normalized = normalizeTimestamp(dateTime);
  if (!normalized) {
    throw new Error("Invalid snapshot record: dateTime must be a valid timestamp");
  }
  return normalized;
}

export function normalizeText(value) {
  return normalizeString(value);
}

export function normalizeNumeric(value) {
  return normalizeNumber(value);
}
