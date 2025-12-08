import { normalizePriceArrays } from "./normalize.js";
import { ensureAnalysisModel } from "./model-loader.js";
import { createAnalysisProgressModal } from "./progress-modal.js";
import { rankSwingResults } from "./rank.js";
import { cacheRankedAnalysisTimestamps } from "../storage/analysis-cache.js";
import { GLOBAL_STATUS, sendStatusUpdate } from "../status-bus.js";

function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function updateStatusSafely(status) {
  return sendStatusUpdate(status, { source: "analysis" });
}

function runBatchedPredictions({ model, tf, normalized, batchSize = 16, onBatchComplete }) {
  if (!Array.isArray(normalized) || normalized.length === 0) {
    return { predictions: [], totalBatches: 0 };
  }

  const batches = chunkArray(normalized, batchSize > 0 ? batchSize : 16);
  const totalBatches = batches.length || 1;
  const predictions = [];

  batches.forEach((batch, index) => {
    const batchPredictions = tf.tidy(() => {
      const input = tf.tensor2d(
        batch.map(({ open, high, low, close }) => [open, high, low, close])
      );
      const prediction = model.predict(input);
      const outputTensor = Array.isArray(prediction) ? prediction[0] : prediction;
      const values = outputTensor?.dataSync ? Array.from(outputTensor.dataSync()) : [];
      return values;
    });

    predictions.push(...batchPredictions);

    if (onBatchComplete) {
      onBatchComplete({ completed: index + 1, total: totalBatches });
    }
  });

  return { predictions, totalBatches };
}

export async function startAnalysis(rawPriceArrays, { modelUrl } = {}) {
  const { model, tf } = await ensureAnalysisModel({ modelUrl });
  const normalized = normalizePriceArrays(rawPriceArrays);

  return {
    model,
    tf,
    normalized,
  };
}

export async function analyzeWithModalProgress(
  rawPriceArrays,
  { modelUrl, batchSize = 16, title, subtitle } = {}
) {
  const modal = createAnalysisProgressModal({
    title: title || "Running analysis",
    subtitle: subtitle || "Loading model...",
  });

  await updateStatusSafely(GLOBAL_STATUS.ANALYZING);

  try {
    const { model, tf, normalized } = await startAnalysis(rawPriceArrays, { modelUrl });

    if (!Array.isArray(normalized) || normalized.length === 0) {
      modal?.complete("No price data to analyze.");
      return { predictions: [], normalized, ranked: [] };
    }

    modal?.setProgress({ completed: 0, total: 0, label: "Preparing inference..." });

    const { predictions, totalBatches } = runBatchedPredictions({
      model,
      tf,
      normalized,
      batchSize,
      onBatchComplete: ({ completed, total }) =>
        modal?.setProgress({
          completed,
          total,
          label: `Batch ${completed} of ${total} complete`,
        }),
    });

    if (!totalBatches) {
      modal?.setProgress({ completed: 1, total: 1, label: "Preparing inference..." });
    }

    modal?.complete("Analysis finished.");

    const ranked = rankSwingResults({
      probabilities: predictions,
      normalizedInputs: normalized,
      rawEntries: Array.isArray(rawPriceArrays) ? rawPriceArrays : [],
    });

    try {
      await cacheRankedAnalysisTimestamps(ranked);
    } catch (error) {
      console.warn("Failed to cache analysis timestamps", error);
    }

    return { predictions, normalized, ranked };
  } finally {
    await updateStatusSafely(GLOBAL_STATUS.IDLE);
  }
}

export async function analyzeHeadlessly(rawPriceArrays, { modelUrl, batchSize = 16 } = {}) {
  await updateStatusSafely(GLOBAL_STATUS.ANALYZING);

  try {
    const { model, tf, normalized } = await startAnalysis(rawPriceArrays, { modelUrl });

    const { predictions } = runBatchedPredictions({
      model,
      tf,
      normalized,
      batchSize,
    });

    const ranked = rankSwingResults({
      probabilities: predictions,
      normalizedInputs: normalized,
      rawEntries: Array.isArray(rawPriceArrays) ? rawPriceArrays : [],
    });

    try {
      await cacheRankedAnalysisTimestamps(ranked);
    } catch (error) {
      console.warn("Failed to cache analysis timestamps", error);
    }

    return { predictions, normalized, ranked };
  } finally {
    await updateStatusSafely(GLOBAL_STATUS.IDLE);
  }
}
