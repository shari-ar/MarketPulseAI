let tfModulePromise = null;
let modelPromise = null;
let analysisConfigPromise = null;

async function loadAnalysisConfig() {
  if (analysisConfigPromise) return analysisConfigPromise;

  analysisConfigPromise = import("../runtime-config.js")
    .then((module) => module?.ANALYSIS_CONFIG)
    .then((config) => {
      if (!config) {
        throw new Error("Missing ANALYSIS_CONFIG export in runtime-config.js");
      }
      return config;
    })
    .catch((error) => {
      analysisConfigPromise = null;
      throw error;
    });

  return analysisConfigPromise;
}

async function importTensorFlow() {
  if (tfModulePromise) {
    return tfModulePromise;
  }

  tfModulePromise = loadAnalysisConfig()
    .then(({ tensorflowCdnUrl }) => import(tensorflowCdnUrl))
    .catch((error) => {
      tfModulePromise = null;
      throw new Error(`Failed to load TensorFlow.js: ${error.message}`);
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
  const config = await loadAnalysisConfig();
  const resolvedUrl = modelUrl || config.modelUrl;

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
