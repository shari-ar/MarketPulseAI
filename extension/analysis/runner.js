import { runSwingAnalysis } from "./index.js";
import { logAnalysisEvent } from "./logger.js";

const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

function supportsWorker() {
  return typeof Worker !== "undefined" && Boolean(chromeApi?.runtime?.getURL);
}

function createWorker() {
  const url = chromeApi.runtime.getURL("analysis/index.js");
  return new Worker(url, { type: "module" });
}

/**
 * Runs swing analysis in a dedicated worker when possible, falling back to
 * the in-process implementation for tests or unsupported environments.
 */
export async function runSwingAnalysisWithWorker({
  snapshots = [],
  analysisCache = new Map(),
  now = new Date(),
  onProgress,
} = {}) {
  if (!supportsWorker()) {
    logAnalysisEvent({
      type: "info",
      message: "Worker unavailable; running analysis inline",
      context: { snapshotCount: snapshots.length },
      now,
    });
    return runSwingAnalysis(snapshots, { now, analysisCache, onProgress });
  }

  return new Promise((resolve, reject) => {
    const worker = createWorker();

    worker.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === "progress" && onProgress) {
        onProgress(payload.progress);
        return;
      }
      if (type === "complete") {
        worker.terminate();
        resolve(payload);
      }
      if (type === "error") {
        worker.terminate();
        reject(new Error(payload?.message || "Analysis worker error"));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage({
      type: "analyze",
      payload: {
        snapshots,
        analysisCache: Array.from(analysisCache.entries()),
        now: now.toISOString(),
      },
    });
  });
}
