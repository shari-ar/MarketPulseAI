import { FEATURE_ORDER, aggregateFeatureRows, buildFeatureWindow } from "./feature-engineering.js";

const MANIFEST_URL = new URL("./models/manifest.json", import.meta.url);

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

async function loadJsonFromFetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load JSON asset: ${response.status}`);
  }
  return response.json();
}

async function loadJsonAsset(url) {
  if (typeof window === "undefined" && typeof process !== "undefined") {
    return loadJsonFromFs(url);
  }
  return loadJsonFromFetch(url);
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

function scoreWindowWithWeights(window, manifest, assets, now, logger) {
  const featureWindow = buildFeatureWindow(window, { scalers: assets.scalers });
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

  if (!weights) {
    logger?.({
      type: "warning",
      message: "Model weights unavailable; skipping inference",
      context: { version: manifest?.version },
      now,
    });
    return null;
  }

  return (window, { now: runtimeNow = now } = {}) => {
    const startedAt = Date.now();
    const result = scoreWindowWithWeights(
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
      },
      now: runtimeNow,
    });
    return result;
  };
}
