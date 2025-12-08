import { ANALYSIS_CONFIG } from "../runtime-config.js";

let tfModulePromise = null;
let modelPromise = null;

async function importTensorFlow() {
  if (tfModulePromise) {
    return tfModulePromise;
  }

  tfModulePromise = import(ANALYSIS_CONFIG.tensorflowCdnUrl).catch((error) => {
    tfModulePromise = null;
    throw new Error(
      `Failed to load TensorFlow.js from ${ANALYSIS_CONFIG.tensorflowCdnUrl}: ${error.message}`
    );
  });

  return tfModulePromise;
}

export async function loadTensorflowModule() {
  const tf = await importTensorFlow();
  if (!tf || typeof tf.loadLayersModel !== "function") {
    tfModulePromise = null;
    throw new Error("TensorFlow.js did not load correctly: missing loadLayersModel.");
  }
  return tf;
}

export async function loadAnalysisModel({ modelUrl } = {}) {
  const tf = await loadTensorflowModule();
  const resolvedUrl = modelUrl || ANALYSIS_CONFIG.modelUrl;

  if (modelPromise) {
    return modelPromise;
  }

  modelPromise = tf.loadLayersModel(resolvedUrl).catch((error) => {
    modelPromise = null;
    throw new Error(`Failed to load analysis model from ${resolvedUrl}: ${error.message}`);
  });

  return modelPromise;
}

export async function ensureAnalysisModel({ modelUrl } = {}) {
  const model = await loadAnalysisModel({ modelUrl });
  return { model, tf: await loadTensorflowModule() };
}
