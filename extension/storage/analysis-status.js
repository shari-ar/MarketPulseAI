const STORAGE_KEY = "marketpulseai:lastAnalysisStatus";
let memoryCache = null;

function normalizeTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : new Date().toISOString();
}

function persistToChrome(payload) {
  const chromeStorage = globalThis?.chrome?.storage?.local;
  if (!chromeStorage?.set) {
    memoryCache = payload;
    return Promise.resolve(payload);
  }

  return chromeStorage
    .set({ [STORAGE_KEY]: payload })
    .then(() => payload)
    .catch(() => {
      memoryCache = payload;
      return payload;
    });
}

export async function setLastAnalysisStatus({
  state,
  message,
  details,
  analyzedCount = 0,
  timestamp,
} = {}) {
  const payload = {
    state: state || "not_run",
    message: message || "",
    details: details || null,
    analyzedCount,
    timestamp: normalizeTimestamp(timestamp),
  };

  return persistToChrome(payload);
}

export async function getLastAnalysisStatus() {
  const chromeStorage = globalThis?.chrome?.storage?.local;
  if (chromeStorage?.get) {
    try {
      const stored = await chromeStorage.get(STORAGE_KEY);
      const value = stored?.[STORAGE_KEY] || null;
      if (value) return value;
    } catch (_error) {
      // Fall back to memory cache
    }
  }

  return memoryCache;
}
