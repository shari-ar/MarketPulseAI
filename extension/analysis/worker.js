import { analyzeHeadlessly } from "./index.js";

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event?.data || {};
  if (!id || type !== "ANALYZE_HEADLESS") {
    return;
  }

  try {
    const { priceArrays, options } = payload || {};
    const result = await analyzeHeadlessly(priceArrays, options);
    self.postMessage({ id, type: "ANALYSIS_RESULT", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "ANALYSIS_ERROR",
      error: { message: error?.message || "Analysis failed", stack: error?.stack },
    });
  }
});
