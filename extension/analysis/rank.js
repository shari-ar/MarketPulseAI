function normalizeProbability(probability, index) {
  const numeric = Number(probability);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Prediction at index ${index} is not a finite number.`);
  }

  return numeric;
}

function normalizeSwingPercent(swingPercent, index) {
  if (swingPercent === undefined || swingPercent === null) {
    return null;
  }

  const numeric = Number(swingPercent);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Swing percent at index ${index} is not a finite number.`);
  }

  return numeric;
}

function resolveSymbolLabel(entry) {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  return entry.symbol || entry.id || entry.ticker || undefined;
}

function compareNullableNumbers(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return 0;
  return right - left;
}

export function rankSwingResults({ predictions, normalizedInputs = [], rawEntries = [] } = {}) {
  if (!Array.isArray(predictions)) {
    throw new TypeError("predictions must be an array.");
  }

  if (predictions.length === 0) {
    return [];
  }

  const symbols = Array.isArray(rawEntries)
    ? rawEntries.map((entry) => resolveSymbolLabel(entry))
    : [];

  const results = predictions.map((prediction, index) => {
    const probability =
      prediction?.predictedSwingProbability ?? prediction?.probability ?? prediction;
    const swingPercent = prediction?.predictedSwingPercent ?? prediction?.swingPercent ?? null;

    return {
      probability: normalizeProbability(probability, index),
      swingPercent: normalizeSwingPercent(swingPercent, index),
      symbol: symbols[index],
      normalized: normalizedInputs[index],
      originalIndex: index,
    };
  });

  return results
    .sort((a, b) => {
      if (b.probability !== a.probability) {
        return b.probability - a.probability;
      }

      const swingComparison = compareNullableNumbers(a.swingPercent, b.swingPercent);
      if (swingComparison !== 0) {
        return swingComparison;
      }

      const symbolA = a.symbol ?? "";
      const symbolB = b.symbol ?? "";

      if (symbolA !== symbolB) {
        return symbolA.localeCompare(symbolB);
      }

      return a.originalIndex - b.originalIndex;
    })
    .map(({ probability, swingPercent, symbol, normalized }) => ({
      probability,
      swingPercent,
      symbol,
      normalized,
    }));
}
