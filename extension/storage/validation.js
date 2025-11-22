const TRADE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function isValidTradeDate(tradeDate) {
  if (!TRADE_DATE_PATTERN.test(tradeDate)) return false;
  const date = new Date(`${tradeDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return false;

  const [year, month, day] = tradeDate.split("-").map(Number);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

export function validateOhlcRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["Record must be an object"] };
  }

  const { symbol, tradeDate, open, high, low, close, collectedAt } = record;

  if (!symbol || typeof symbol !== "string" || !symbol.trim()) {
    errors.push("symbol is required");
  }

  if (!tradeDate || typeof tradeDate !== "string" || !isValidTradeDate(tradeDate)) {
    errors.push("tradeDate must be a real date in YYYY-MM-DD");
  }

  const numericFields = { open, high, low, close };
  for (const [field, value] of Object.entries(numericFields)) {
    if (!isFiniteNumber(value)) {
      errors.push(`${field} must be a finite number`);
    }
  }

  if (record.volume !== undefined && !isFiniteNumber(record.volume)) {
    errors.push("volume must be a finite number when provided");
  }

  if (isFiniteNumber(low) && isFiniteNumber(high) && low > high) {
    errors.push("low cannot exceed high");
  }

  if (isFiniteNumber(open) && isFiniteNumber(low) && open < low) {
    errors.push("open cannot be below low");
  }

  if (isFiniteNumber(open) && isFiniteNumber(high) && open > high) {
    errors.push("open cannot be above high");
  }

  if (isFiniteNumber(close) && isFiniteNumber(low) && close < low) {
    errors.push("close cannot be below low");
  }

  if (isFiniteNumber(close) && isFiniteNumber(high) && close > high) {
    errors.push("close cannot be above high");
  }

  if (!normalizeTimestamp(collectedAt)) {
    errors.push("collectedAt must be a valid timestamp");
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidOhlcRecord(record) {
  const { valid, errors } = validateOhlcRecord(record);
  if (!valid) {
    throw new Error(`Invalid OHLC record: ${errors.join("; ")}`);
  }
  return record;
}

export function normalizeCollectedAt(collectedAt) {
  const normalized = normalizeTimestamp(collectedAt);
  if (!normalized) {
    throw new Error("Invalid OHLC record: collectedAt must be a valid timestamp");
  }
  return normalized;
}
