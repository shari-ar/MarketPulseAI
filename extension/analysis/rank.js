import { getRuntimeConfig } from "../runtime-config.js";

/**
 * Orders swing results by probability and magnitude so that the most actionable
 * opportunities surface first, trimming the list to the configured maximum.
 *
 * @param {Array<object>} records - Scored swing records that include probability and percent.
 * @param {number} [topCount=DEFAULT_RUNTIME_CONFIG.TOP_SWING_COUNT] - Maximum number of items to return.
 * @returns {Array<object>} Ranked subset of swing records.
 */
export function rankSwingResults(records = [], topCount = getRuntimeConfig().TOP_SWING_COUNT) {
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

  return sortable.slice(0, topCount);
}
