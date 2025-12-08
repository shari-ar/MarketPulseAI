export function normalizePriceArrays(priceArrays) {
  if (!Array.isArray(priceArrays)) {
    throw new TypeError("Price arrays input must be an array.");
  }

  if (priceArrays.length === 0) {
    return [];
  }

  const normalizedEntries = priceArrays.map((entry, index) => {
    if (!entry || (typeof entry !== "object" && !Array.isArray(entry))) {
      throw new TypeError(`Entry at index ${index} must be an array or object.`);
    }

    const values = Array.isArray(entry) ? entry : [entry.open, entry.high, entry.low, entry.close];

    if (values.length !== 4) {
      throw new Error(`Entry at index ${index} must include open, high, low, and close values.`);
    }

    const [open, high, low, close] = values.map((value, valueIndex) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error(
          `Entry at index ${index} contains a non-finite price at position ${valueIndex}.`
        );
      }
      return numeric;
    });

    if (low > high) {
      throw new Error(`Entry at index ${index} has low greater than high.`);
    }

    return { open, high, low, close };
  });

  const maxMagnitude = normalizedEntries.reduce((currentMax, prices) => {
    return Math.max(
      currentMax,
      Math.abs(prices.open),
      Math.abs(prices.high),
      Math.abs(prices.low),
      Math.abs(prices.close)
    );
  }, 0);

  if (maxMagnitude === 0) {
    return normalizedEntries.map(() => ({ open: 0, high: 0, low: 0, close: 0 }));
  }

  return normalizedEntries.map(({ open, high, low, close }) => ({
    open: Number((open / maxMagnitude).toFixed(6)),
    high: Number((high / maxMagnitude).toFixed(6)),
    low: Number((low / maxMagnitude).toFixed(6)),
    close: Number((close / maxMagnitude).toFixed(6)),
  }));
}
