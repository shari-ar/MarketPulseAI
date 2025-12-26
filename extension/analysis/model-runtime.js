import { marketDateFromIso } from "../background/time.js";

const MANIFEST_URL = new URL("./models/manifest.json", import.meta.url);
const DEFAULT_CALIBRATION = {
  percentClip: [-50, 50],
  probabilityClip: [0.01, 0.99],
};

async function loadManifestFromFs() {
  const { readFile } = await import("fs/promises");
  const data = await readFile(MANIFEST_URL, "utf-8");
  return JSON.parse(data);
}

async function loadManifestFromFetch() {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Failed to load model manifest: ${response.status}`);
  }
  return response.json();
}

export async function loadModelManifest({ logger, now = new Date() } = {}) {
  try {
    if (typeof window === "undefined" && typeof process !== "undefined") {
      return await loadManifestFromFs();
    }
    return await loadManifestFromFetch();
  } catch (error) {
    logger?.({
      type: "warning",
      message: "Model manifest unavailable; using heuristic scoring",
      context: { error: error?.message },
      now,
    });
    return null;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function heuristicScore(window = [], { manifest, now }) {
  const latest = window[0];
  const oldest = window[window.length - 1];
  const reference = oldest?.primeCost || oldest?.close || 1;
  const swingPercent = (((latest.high ?? latest.close ?? reference) - reference) / reference) * 100;

  const calibration = manifest?.calibration || DEFAULT_CALIBRATION;
  const [minPercent, maxPercent] = calibration.percentClip || DEFAULT_CALIBRATION.percentClip;
  const [minProb, maxProb] = calibration.probabilityClip || DEFAULT_CALIBRATION.probabilityClip;

  const boundedPercent = clamp(Number(swingPercent.toFixed(2)), minPercent, maxPercent);
  const probability = clamp(Math.abs(boundedPercent) / 100, minProb, maxProb);

  return {
    predictedSwingPercent: Number(boundedPercent.toFixed(2)),
    predictedSwingProbability: Number(probability.toFixed(2)),
    dateTime: latest.dateTime,
    id: latest.id,
    marketDate: marketDateFromIso(latest.dateTime),
    modelVersion: manifest?.version || "heuristic",
    analyzedAt: now.toISOString(),
  };
}

export function resolveScoringStrategy({ manifest, logger, now = new Date() } = {}) {
  if (!manifest) {
    logger?.({
      type: "warning",
      message: "Using heuristic scoring fallback",
      context: { fallback: true },
      now,
    });
  }

  return heuristicScore;
}
