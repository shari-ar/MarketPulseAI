import { normalizePriceArrays } from "./normalize.js";
import { ensureAnalysisModel } from "./model-loader.js";
import { createAnalysisProgressModal } from "./progress-modal.js";

function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

  const { model, tf, normalized } = await startAnalysis(rawPriceArrays, { modelUrl });

  if (!Array.isArray(normalized) || normalized.length === 0) {
    modal?.complete("No price data to analyze.");
    return { predictions: [], normalized };
  }

  const batches = chunkArray(normalized, batchSize > 0 ? batchSize : 16);
  const totalBatches = batches.length || 1;
  const predictions = [];

  modal?.setProgress({ completed: 0, total: totalBatches, label: "Preparing inference..." });

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

    modal?.setProgress({
      completed: index + 1,
      total: totalBatches,
      label: `Batch ${index + 1} of ${totalBatches} complete`,
    });
  });

  modal?.complete("Analysis finished.");

  return { predictions, normalized };
}
