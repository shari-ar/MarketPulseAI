function normalizeProbability(probability, index) {
  const numeric = Number(probability);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Prediction at index ${index} is not a finite number.`);
  }

  return numeric;
}

function resolveSymbolLabel(entry) {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  return entry.symbol || entry.id || entry.ticker || undefined;
}

export function rankSwingResults({ probabilities, normalizedInputs = [], rawEntries = [] } = {}) {
  if (!Array.isArray(probabilities)) {
    throw new TypeError("probabilities must be an array.");
  }

  if (probabilities.length === 0) {
    return [];
  }

  const symbols = Array.isArray(rawEntries)
    ? rawEntries.map((entry) => resolveSymbolLabel(entry))
    : [];

  const results = probabilities.map((probability, index) => {
    const normalized = normalizedInputs[index];
    const symbol = symbols[index];

    return {
      probability: normalizeProbability(probability, index),
      symbol,
      normalized,
      originalIndex: index,
    };
  });

  return results
    .sort((a, b) => {
      if (b.probability !== a.probability) {
        return b.probability - a.probability;
      }

      const symbolA = a.symbol ?? "";
      const symbolB = b.symbol ?? "";

      if (symbolA !== symbolB) {
        return symbolA.localeCompare(symbolB);
      }

      return a.originalIndex - b.originalIndex;
    })
    .map(({ probability, symbol, normalized }) => ({ probability, symbol, normalized }));
}
