let workerInstance = null;
let nextRequestId = 1;
const pending = new Map();
const chromeApi = globalThis.chrome;

function resolveWorkerUrl() {
  if (chromeApi?.runtime?.getURL) {
    return chromeApi.runtime.getURL("analysis/worker.js");
  }
  return "analysis/worker.js";
}

function resetWorker(error) {
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch (terminateError) {
      // Worker teardown is best-effort and will be retried on next use.
    }
  }

  workerInstance = null;
  if (pending.size) {
    pending.forEach(({ reject }) => {
      reject(error || new Error("Analysis worker was reset."));
    });
    pending.clear();
  }
}

function ensureWorker() {
  if (workerInstance) return workerInstance;

  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are not supported in this context.");
  }

  const workerUrl = resolveWorkerUrl();
  workerInstance = new Worker(workerUrl, { type: "module" });

  workerInstance.onmessage = (event) => {
    const { id, type, result, error } = event?.data || {};
    if (!id || !pending.has(id)) {
      return;
    }

    const { resolve, reject } = pending.get(id);
    pending.delete(id);

    if (type === "ANALYSIS_RESULT") {
      resolve(result);
      return;
    }

    const workerError = error?.message
      ? Object.assign(new Error(error.message), { stack: error.stack })
      : new Error("Analysis worker returned an unknown error.");
    reject(workerError);
  };

  workerInstance.onerror = (event) => {
    resetWorker(event?.error || new Error(event?.message || "Worker error"));
  };

  return workerInstance;
}

export function runAnalysisInWorker(priceArrays, options = {}) {
  const worker = ensureWorker();
  const requestId = nextRequestId++;

  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });

    try {
      worker.postMessage({
        id: requestId,
        type: "ANALYZE_HEADLESS",
        payload: {
          priceArrays,
          options,
        },
      });
    } catch (error) {
      pending.delete(requestId);
      reject(error);
    }
  });
}

export function terminateAnalysisWorker() {
  resetWorker();
}
