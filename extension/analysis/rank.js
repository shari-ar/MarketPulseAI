/**
 * Resolve a numeric limit value from a plain number or a { max } object.
 *
 * @param {number|{max?: number}} limit - Candidate limit input.
 * @returns {number|null} Resolved numeric limit when valid.
 */
function resolveLimit(limit) {
  if (Number.isFinite(limit)) return limit;
  if (limit && typeof limit === "object") {
    const value = Number(limit.max);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function emitRankingLog(logger, payload) {
  if (!logger) return;
  if (typeof logger === "function") {
    logger(payload);
    return;
  }
  logger.log?.(payload);
}

/**
 * Orders swing results by probability and magnitude so that the most actionable
 * opportunities surface first, optionally trimming the list when a limit is provided.
 *
 * @param {Array<object>} records - Scored swing records that include probability and percent.
 * @param {number|{max?: number}} [limit] - Optional max count for truncating results.
 * @param {object} [options]
 * @param {Function|{log: Function}} [options.logger] - Optional logger callback for diagnostics.
 * @param {Date} [options.now=new Date()] - Timestamp for log entries.
 * @returns {Array<object>} Ranked swing records.
 */
export function rankSwingResults(records = [], limit = 5, { logger, now = new Date() } = {}) {
  const max = resolveLimit(limit);
  const sortable = records
    .filter((row) => typeof row.predictedSwingProbability === "number")
    .map((row) => ({ ...row }));

  sortable.sort((a, b) => {
    // Prioritize confidence first so the list favors swings we believe in the most.
    if (b.predictedSwingProbability !== a.predictedSwingProbability) {
      return b.predictedSwingProbability - a.predictedSwingProbability;
    }
    // Fall back to magnitude to surface larger potential moves when confidence ties.
    return (b.predictedSwingPercent || 0) - (a.predictedSwingPercent || 0);
  });

  const ranked = Number.isFinite(max) ? sortable.slice(0, max) : sortable;
  emitRankingLog(logger, {
    type: "debug",
    message: "Ranked swing results",
    context: {
      inputCount: records.length,
      rankedCount: ranked.length,
      limit: Number.isFinite(max) ? max : null,
    },
    now,
  });
  return ranked;
}
