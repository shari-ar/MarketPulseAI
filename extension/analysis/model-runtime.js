const MANIFEST_URL = new URL("./models/manifest.json", import.meta.url);

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
  const startedAt = Date.now();
  try {
    if (typeof window === "undefined" && typeof process !== "undefined") {
      const manifest = await loadManifestFromFs();
      logger?.({
        message: "Loaded model manifest from filesystem",
        context: {
          version: manifest?.version,
          durationMs: Date.now() - startedAt,
        },
        now,
      });
      return manifest;
    }
    const manifest = await loadManifestFromFetch();
    logger?.({
      message: "Loaded model manifest from fetch",
      context: {
        version: manifest?.version,
        durationMs: Date.now() - startedAt,
      },
      now,
    });
    return manifest;
  } catch (error) {
    logger?.({
      type: "warning",
      message: "Model manifest unavailable; using heuristic scoring",
      context: { error: error?.message, durationMs: Date.now() - startedAt },
      now,
    });
    return null;
  }
}

function isManifestReady(manifest) {
  return Boolean(manifest?.modelPath);
}

export function resolveScoringStrategy({ manifest, logger, now = new Date() } = {}) {
  if (!manifest || !isManifestReady(manifest)) {
    logger?.({
      type: "warning",
      message: "Model assets unavailable; skipping inference",
      context: { hasManifest: Boolean(manifest), modelPath: manifest?.modelPath || null },
      now,
    });
    return null;
  }

  logger?.({
    type: "error",
    message: "Model assets present but scoring pipeline not initialized",
    context: { version: manifest?.version, modelPath: manifest?.modelPath },
    now,
  });

  return null;
}
