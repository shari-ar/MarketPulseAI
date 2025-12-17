import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";

export function rankSwingResults(records = [], topCount = DEFAULT_RUNTIME_CONFIG.TOP_SWING_COUNT) {
  const sortable = records
    .filter((row) => typeof row.predictedSwingProbability === "number")
    .map((row) => ({ ...row }));

  sortable.sort((a, b) => {
    if (b.predictedSwingProbability !== a.predictedSwingProbability) {
      return b.predictedSwingProbability - a.predictedSwingProbability;
    }
    return (b.predictedSwingPercent || 0) - (a.predictedSwingPercent || 0);
  });

  return sortable.slice(0, topCount);
}
