import { normalizePriceArrays } from "./normalize.js";
import { ensureAnalysisModel } from "./model-loader.js";

export async function startAnalysis(rawPriceArrays, { modelUrl } = {}) {
  const { model, tf } = await ensureAnalysisModel({ modelUrl });
  const normalized = normalizePriceArrays(rawPriceArrays);

  return {
    model,
    tf,
    normalized,
  };
}
