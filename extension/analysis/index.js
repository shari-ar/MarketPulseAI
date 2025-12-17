import { rankSwingResults } from "./rank.js";
import { marketDateFromIso } from "../background/time.js";

function buildWindows(snapshots = []) {
  const grouped = snapshots.reduce((acc, snapshot) => {
    const key = snapshot.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(snapshot);
    return acc;
  }, {});

  return Object.values(grouped)
    .map((entries) => entries.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)))
    .filter((entries) => entries.length >= 7)
    .map((entries) => entries.slice(0, 7));
}

function scoreWindow(window = []) {
  const latest = window[0];
  const oldest = window[window.length - 1];
  const reference = oldest?.primeCost || oldest?.close || 1;
  const swingPercent = (((latest.high ?? latest.close ?? reference) - reference) / reference) * 100;
  const boundedPercent = Math.max(-50, Math.min(50, swingPercent));
  const swingProbability = Math.max(0.01, Math.min(0.99, Math.abs(boundedPercent) / 100));

  return {
    predictedSwingPercent: Number(boundedPercent.toFixed(2)),
    predictedSwingProbability: Number(swingProbability.toFixed(2)),
    dateTime: latest.dateTime,
    id: latest.id,
    marketDate: marketDateFromIso(latest.dateTime),
  };
}

export function runSwingAnalysis(snapshots = [], now = new Date()) {
  const windows = buildWindows(snapshots);
  const scored = windows.map((window) => ({ ...scoreWindow(window), window }));
  const ranked = rankSwingResults(scored);
  return { ranked, analyzedAt: now.toISOString() };
}
