import { FEATURE_ORDER, aggregateFeatureRows, buildFeatureWindow } from "./feature-engineering.js";

// Asset URLs for model metadata and the bundled TensorFlow.js runtime.
const MANIFEST_URL = new URL("./models/manifest.json", import.meta.url);
const TFJS_MODULE_URL = new URL("../vendor/tfjs.esm.min.js", import.meta.url);

let tfjsModulePromise = null;
// Cache model instances keyed by asset URL to avoid redundant network/disk reads.
const modelCache = new Map();

function resolveActiveManifest(manifest) {
  if (manifest?.activeVersion && manifest?.versions) {
    const entry = manifest.versions[manifest.activeVersion];
    if (entry) {
      return { ...entry, version: manifest.activeVersion };
    }
  }

  if (manifest?.version) {
    return { ...manifest, version: manifest.version };
  }

  return null;
}

async function loadJsonFromFs(url) {
  const { readFile } = await import("fs/promises");
  const data = await readFile(url, "utf-8");
  return JSON.parse(data);
}

async function loadTextFromFs(url) {
  const { readFile } = await import("fs/promises");
  return readFile(url, "utf-8");
}

async function loadJsonFromFetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load JSON asset: ${response.status}`);
  }
  return response.json();
}

async function loadTextFromFetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load text asset: ${response.status}`);
  }
  return response.text();
}

async function loadJsonAsset(url) {
  if (typeof window === "undefined" && typeof process !== "undefined") {
    return loadJsonFromFs(url);
  }
  return loadJsonFromFetch(url);
}

async function loadTextAsset(url) {
  if (typeof window === "undefined" && typeof process !== "undefined") {
    return loadTextFromFs(url);
  }
  return loadTextFromFetch(url);
}

function loadTensorflowModule() {
  if (!tfjsModulePromise) {
    tfjsModulePromise = import(TFJS_MODULE_URL).then((module) => module.default ?? module);
  }
  return tfjsModulePromise;
}

export async function loadModelManifest({ logger, now = new Date() } = {}) {
  const startedAt = Date.now();
  try {
    const manifest = await loadJsonAsset(MANIFEST_URL);
    const resolved = resolveActiveManifest(manifest);
    logger?.({
      message: "Loaded model manifest",
      context: {
        version: resolved?.version,
        durationMs: Date.now() - startedAt,
      },
      now,
    });
    return resolved;
  } catch (error) {
    logger?.({
      type: "warning",
      message: "Model manifest unavailable; skipping inference",
      context: { error: error?.message, durationMs: Date.now() - startedAt },
      now,
    });
    return null;
  }
}

function clamp(value, [min, max]) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function applyPlattScaling(score, calibration) {
  if (!calibration) return sigmoid(score);
  const a = Number(calibration.plattA ?? 1);
  const b = Number(calibration.plattB ?? 0);
  return 1 / (1 + Math.exp(a * score + b));
}

function dotProduct(features, weights) {
  if (!weights) return 0;
  return Object.entries(weights).reduce((sum, [name, weight]) => {
    const value = features[name];
    if (!Number.isFinite(value)) return sum;
    return sum + value * weight;
  }, 0);
}

function buildAssetUrl(manifest, pathKey) {
  const path = manifest?.[pathKey];
  if (!path) return null;
  return new URL(path, MANIFEST_URL);
}

function decodeBase64WeightData(encoded) {
  if (!encoded) return null;
  const BufferConstructor = typeof globalThis !== "undefined" ? globalThis.Buffer : undefined;
  if (BufferConstructor) {
    const buffer = BufferConstructor.from(encoded, "base64");
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  if (typeof atob === "function") {
    const binary = atob(encoded);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  return null;
}

async function loadModel(manifest, logger, now, tf) {
  const modelUrl = buildAssetUrl(manifest, "modelPath");
  if (!modelUrl) return null;
  if (modelCache.has(modelUrl.toString())) {
    logger?.({
      type: "debug",
      message: "Reusing cached TensorFlow.js model",
      context: { url: modelUrl.toString() },
      now,
    });
    return modelCache.get(modelUrl.toString());
  }

  const startedAt = Date.now();
  const modelPromise = tf.loadLayersModel(modelUrl.toString());
  modelCache.set(modelUrl.toString(), modelPromise);
  const model = await modelPromise;

  logger?.({
    message: "Loaded TensorFlow.js model",
    context: { durationMs: Date.now() - startedAt, url: modelUrl.toString() },
    now,
  });
  return model;
}

async function loadModelFromMemory(manifest, logger, now, tf) {
  const modelUrl = buildAssetUrl(manifest, "modelPath");
  const weightsUrl = buildAssetUrl(manifest, "weightsBase64Path");
  if (!modelUrl || !weightsUrl) return null;

  const cacheKey = `memory:${modelUrl.toString()}:${weightsUrl.toString()}`;
  if (modelCache.has(cacheKey)) {
    logger?.({
      type: "debug",
      message: "Reusing cached TensorFlow.js in-memory model",
      context: { url: modelUrl.toString() },
      now,
    });
    return modelCache.get(cacheKey);
  }

  const startedAt = Date.now();
  const modelPromise = Promise.all([loadJsonAsset(modelUrl), loadTextAsset(weightsUrl)]).then(
    ([modelJson, weightsBase64]) => {
      const weightSpecs = modelJson?.weightsManifest?.[0]?.weights || [];
      const weightData = decodeBase64WeightData(weightsBase64.trim());
      if (!weightData) throw new Error("Invalid base64 weight data");
      const ioHandler = tf.io.fromMemory(modelJson.modelTopology, weightSpecs, weightData);
      return tf.loadLayersModel(ioHandler);
    }
  );

  modelCache.set(cacheKey, modelPromise);
  const model = await modelPromise;
  logger?.({
    message: "Loaded TensorFlow.js model from base64 weights",
    context: { durationMs: Date.now() - startedAt, url: modelUrl.toString() },
    now,
  });
  return model;
}

async function loadScalers(manifest, logger, now) {
  const scalersUrl = buildAssetUrl(manifest, "scalersPath");
  if (!scalersUrl) return null;
  const startedAt = Date.now();
  try {
    const scalers = await loadJsonAsset(scalersUrl);
    logger?.({
      message: "Loaded feature scalers",
      context: { durationMs: Date.now() - startedAt },
      now,
    });
    return scalers;
  } catch (error) {
    logger?.({
      type: "warning",
      message: "Failed to load feature scalers",
      context: { error: error?.message },
      now,
    });
    return null;
  }
}

async function loadWeights(manifest, logger, now) {
  const weightsUrl = buildAssetUrl(manifest, "weightsPath");
  if (!weightsUrl) return null;
  const startedAt = Date.now();
  try {
    const weights = await loadJsonAsset(weightsUrl);
    logger?.({
      message: "Loaded model weights",
      context: { durationMs: Date.now() - startedAt },
      now,
    });
    return weights;
  } catch (error) {
    logger?.({
      type: "warning",
      message: "Failed to load model weights",
      context: { error: error?.message },
      now,
    });
    return null;
  }
}

async function loadCalibration(manifest, logger, now) {
  const calibrationUrl = buildAssetUrl(manifest, "calibrationPath");
  if (!calibrationUrl) {
    return manifest?.calibration || null;
  }
  const startedAt = Date.now();
  try {
    const calibration = await loadJsonAsset(calibrationUrl);
    logger?.({
      message: "Loaded model calibration",
      context: { durationMs: Date.now() - startedAt },
      now,
    });
    return calibration;
  } catch (error) {
    logger?.({
      type: "warning",
      message: "Failed to load model calibration",
      context: { error: error?.message },
      now,
    });
    return manifest?.calibration || null;
  }
}

function extractTfjsOutputs(output) {
  if (Array.isArray(output) && output.length >= 2) {
    return [output[0], output[1]];
  }
  if (output && typeof output.dataSync === "function") {
    const data = output.dataSync();
    if (data.length >= 2) {
      return [{ dataSync: () => [data[0]] }, { dataSync: () => [data[1]] }];
    }
    return [{ dataSync: () => [data[0] ?? 0] }, { dataSync: () => [0] }];
  }
  return [{ dataSync: () => [0] }, { dataSync: () => [0] }];
}

function extractScalar(tensor, fallback = 0) {
  if (!tensor || typeof tensor.dataSync !== "function") return fallback;
  const data = tensor.dataSync();
  return Number.isFinite(data[0]) ? data[0] : fallback;
}

function disposeOutputs(output) {
  if (!output) return;
  if (Array.isArray(output)) {
    output.forEach((tensor) => tensor?.dispose?.());
    return;
  }
  output.dispose?.();
}

function scoreWindowWithWeights(window, manifest, assets, now, logger) {
  const featureWindow = buildFeatureWindow(window, { scalers: assets.scalers, logger, now });
  if (!featureWindow) {
    logger?.({
      type: "warning",
      message: "Skipped window due to incomplete feature inputs",
      context: { symbol: window?.[0]?.id },
      now,
    });
    return null;
  }

  const aggregated = aggregateFeatureRows(featureWindow.rows, FEATURE_ORDER);
  if (!aggregated) return null;

  const percentScore =
    dotProduct(aggregated, assets.weights?.swingPercent?.weights) +
    (assets.weights?.swingPercent?.bias || 0);
  const probabilityScore =
    dotProduct(aggregated, assets.weights?.swingProbability?.weights) +
    (assets.weights?.swingProbability?.bias || 0);

  const calibration = assets.calibration || manifest?.calibration;
  const swingPercent = clamp(percentScore, calibration?.percentClip || [-50, 50]);
  const calibratedProbability = applyPlattScaling(probabilityScore, calibration?.platt || {});
  const swingProbability = clamp(
    calibratedProbability,
    calibration?.probabilityClip || [0.01, 0.99]
  );

  return {
    id: featureWindow.latest?.id,
    dateTime: featureWindow.latest?.dateTime,
    predictedSwingPercent: swingPercent,
    predictedSwingProbability: swingProbability,
  };
}

function buildModelInput(windowRows = []) {
  return windowRows.map((row) => FEATURE_ORDER.map((name) => row[name] ?? 0));
}

function scoreWindowWithTfjs(window, manifest, assets, now, logger) {
  const featureWindow = buildFeatureWindow(window, { scalers: assets.scalers, logger, now });
  if (!featureWindow) {
    logger?.({
      type: "warning",
      message: "Skipped window due to incomplete feature inputs",
      context: { symbol: window?.[0]?.id },
      now,
    });
    return null;
  }

  const calibration = assets.calibration || manifest?.calibration;
  const inputData = buildModelInput(featureWindow.rows);
  const input = assets.tf.tensor([inputData], undefined, "float32");

  const output = assets.model.predict(input);
  const [percentTensor, probabilityTensor] = extractTfjsOutputs(output);
  const rawPercent = extractScalar(percentTensor, 0);
  const rawProbability = extractScalar(probabilityTensor, 0);

  input.dispose?.();
  disposeOutputs(output);

  const swingPercent = clamp(rawPercent, calibration?.percentClip || [-50, 50]);
  const calibratedProbability = applyPlattScaling(rawProbability, calibration?.platt || {});
  const swingProbability = clamp(
    calibratedProbability,
    calibration?.probabilityClip || [0.01, 0.99]
  );

  return {
    id: featureWindow.latest?.id,
    dateTime: featureWindow.latest?.dateTime,
    predictedSwingPercent: swingPercent,
    predictedSwingProbability: swingProbability,
  };
}

export async function resolveScoringStrategy({ manifest, logger, now = new Date() } = {}) {
  if (!manifest) {
    logger?.({
      type: "warning",
      message: "Model manifest missing; skipping inference",
      context: {},
      now,
    });
    return null;
  }

  const [scalers, weights, calibration] = await Promise.all([
    loadScalers(manifest, logger, now),
    loadWeights(manifest, logger, now),
    loadCalibration(manifest, logger, now),
  ]);

  let model = null;
  let tf = null;
  if (manifest?.modelPath) {
    const tfResult = await loadTensorflowModule()
      .then((module) => ({ module }))
      .catch((error) => ({ error }));
    if (tfResult.error) {
      logger?.({
        type: "warning",
        message: "TensorFlow.js runtime unavailable; falling back to weights",
        context: { error: tfResult.error?.message, version: manifest?.version },
        now,
      });
    } else {
      tf = tfResult.module;
      const modelResult = await (
        manifest?.weightsBase64Path
          ? loadModelFromMemory(manifest, logger, now, tf)
          : loadModel(manifest, logger, now, tf)
      )
        .then((loaded) => ({ loaded }))
        .catch((error) => ({ error }));
      if (modelResult.error) {
        logger?.({
          type: "warning",
          message: "TensorFlow.js model unavailable; falling back to weights",
          context: { error: modelResult.error?.message, version: manifest?.version },
          now,
        });
      } else {
        model = modelResult.loaded;
      }
    }
  }

  if (!model && !weights) {
    logger?.({
      type: "warning",
      message: "Model weights unavailable; skipping inference",
      context: { version: manifest?.version },
      now,
    });
    return null;
  }

  logger?.({
    message: "Resolved scoring strategy",
    context: {
      mode: model ? "tfjs" : "weights",
      version: manifest?.version,
      hasScalers: Boolean(scalers),
      hasCalibration: Boolean(calibration),
    },
    now,
  });

  return (window, { now: runtimeNow = now } = {}) => {
    const startedAt = Date.now();
    const result = model
      ? scoreWindowWithTfjs(
          window,
          manifest,
          { tf, model, scalers, calibration },
          runtimeNow,
          logger
        )
      : scoreWindowWithWeights(
          window,
          manifest,
          { scalers, weights, calibration },
          runtimeNow,
          logger
        );
    logger?.({
      message: "Scored swing window",
      context: {
        symbol: result?.id,
        durationMs: Date.now() - startedAt,
        version: manifest?.version,
        usedTfjs: Boolean(model),
      },
      now: runtimeNow,
    });
    return result;
  };
}
