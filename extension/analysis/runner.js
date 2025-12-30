import { runSwingAnalysis } from "./index.js";
import { logAnalysisEvent } from "./logger.js";

const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

function supportsWorker() {
  const supported = typeof Worker !== "undefined" && Boolean(chromeApi?.runtime?.getURL);
  logAnalysisEvent({
    type: "debug",
    message: "Checked worker availability",
    context: { supported },
    now: new Date(),
  });
  return supported;
}

/**
 * Creates a module worker bound to the extension runtime bundle.
 *
 * @returns {Worker} Newly created analysis worker.
 */
function createWorker() {
  const url = chromeApi.runtime.getURL("analysis/index.js");
  logAnalysisEvent({
    type: "debug",
    message: "Creating analysis worker",
    context: { url },
    now: new Date(),
  });
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
    logAnalysisEvent({
      type: "info",
      message: "Spawned analysis worker",
      context: { snapshotCount: snapshots.length, cacheSize: analysisCache.size },
      now,
    });

    worker.onmessage = (event) => {
      const { type, payload } = event.data || {};
      logAnalysisEvent({
        type: "debug",
        message: "Received worker message",
        context: { type },
        now,
      });
      if (type === "progress" && onProgress) {
        onProgress(payload.progress);
        return;
      }
      if (type === "complete") {
        worker.terminate();
        logAnalysisEvent({
          type: "info",
          message: "Analysis worker completed",
          context: {
            analyzedAt: payload?.analyzedAt,
            rankedCount: payload?.ranked?.length ?? 0,
          },
          now,
        });
        resolve(payload);
      }
      if (type === "error") {
        worker.terminate();
        logAnalysisEvent({
          type: "error",
          message: "Analysis worker reported an error",
          context: { error: payload?.message },
          now,
        });
        reject(new Error(payload?.message || "Analysis worker error"));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      logAnalysisEvent({
        type: "error",
        message: "Analysis worker crashed",
        context: { error: error?.message },
        now,
      });
      reject(error);
    };

    logAnalysisEvent({
      type: "debug",
      message: "Posting analysis request to worker",
      context: { snapshotCount: snapshots.length, cacheSize: analysisCache.size },
      now,
    });
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
