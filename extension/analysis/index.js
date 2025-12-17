import { normalizePriceArrays } from "./normalize.js";
import { ensureAnalysisModel } from "./model-loader.js";
import { createAnalysisProgressModal } from "./progress-modal.js";
import { rankSwingResults } from "./rank.js";
import { cacheRankedAnalysisTimestamps } from "../storage/analysis-cache.js";
import { GLOBAL_STATUS, sendStatusUpdate } from "../status-bus.js";
import { setLastAnalysisStatus } from "../storage/analysis-status.js";

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

function tensorValues(tensor) {
  return tensor?.dataSync ? Array.from(tensor.dataSync()) : [];
}

function decodePredictionOutput(prediction, batchSize) {
  if (Array.isArray(prediction)) {
    const swingPercents = tensorValues(prediction[0]);
    const probabilities = tensorValues(prediction[1]);
    return { swingPercents, probabilities };
  }

  const outputTensor = Array.isArray(prediction) ? prediction[0] : prediction;
  const values = tensorValues(outputTensor);

  if (values.length === batchSize * 2) {
    const swingPercents = [];
    const probabilities = [];
    for (let index = 0; index < values.length; index += 2) {
      swingPercents.push(values[index]);
      probabilities.push(values[index + 1]);
    }
    return { swingPercents, probabilities };
  }

  return { swingPercents: [], probabilities: values };
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
      const { swingPercents, probabilities } = decodePredictionOutput(prediction, batch.length);

      return batch.map((_, idx) => ({
        predictedSwingPercent: swingPercents[idx] ?? null,
        predictedSwingProbability: probabilities[idx] ?? null,
      }));
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
      await setLastAnalysisStatus({
        state: "skipped",
        message: "Analysis was skipped because no price data was available.",
        analyzedCount: 0,
      });
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
      predictions,
      normalizedInputs: normalized,
      rawEntries: Array.isArray(rawPriceArrays) ? rawPriceArrays : [],
    });

    let cacheUpdated = true;
    let cacheErrorDetails = null;
    try {
      await cacheRankedAnalysisTimestamps(ranked);
    } catch (error) {
      cacheUpdated = false;
      cacheErrorDetails = error?.message || String(error);
    }

    await setLastAnalysisStatus({
      state: cacheUpdated ? "success" : "warning",
      message: cacheUpdated
        ? `Analysis finished for ${ranked.length} symbol${ranked.length === 1 ? "" : "s"}.`
        : "Analysis finished but cache update failed.",
      analyzedCount: ranked.length,
      details: cacheErrorDetails,
    });

    return { predictions, normalized, ranked };
  } catch (error) {
    await setLastAnalysisStatus({
      state: "error",
      message: error?.message || "Analysis failed.",
      details: error?.stack || String(error),
      analyzedCount: 0,
    });
    throw error;
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
      predictions,
      normalizedInputs: normalized,
      rawEntries: Array.isArray(rawPriceArrays) ? rawPriceArrays : [],
    });

    let cacheUpdated = true;
    let cacheErrorDetails = null;
    try {
      await cacheRankedAnalysisTimestamps(ranked);
    } catch (error) {
      cacheUpdated = false;
      cacheErrorDetails = error?.message || String(error);
    }

    await setLastAnalysisStatus({
      state: cacheUpdated ? "success" : "warning",
      message: cacheUpdated
        ? `Analysis finished for ${ranked.length} symbol${ranked.length === 1 ? "" : "s"}.`
        : "Analysis finished but cache update failed.",
      analyzedCount: ranked.length,
      details: cacheErrorDetails,
    });

    return { predictions, normalized, ranked };
  } catch (error) {
    await setLastAnalysisStatus({
      state: "error",
      message: error?.message || "Analysis failed.",
      details: error?.stack || String(error),
      analyzedCount: 0,
    });
    throw error;
  } finally {
    await updateStatusSafely(GLOBAL_STATUS.IDLE);
  }
}
