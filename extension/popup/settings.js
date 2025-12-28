import { RUNTIME_CONFIG_STORAGE_KEY, applyRuntimeConfigOverrides } from "../runtime-settings.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { logPopupEvent, popupLogger } from "./logger.js";

const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

/**
 * Fetches stored runtime configuration overrides for the popup UI.
 *
 * @returns {Promise<object>} Stored runtime configuration overrides.
 */
async function fetchStoredConfig() {
  if (!chromeApi?.storage?.local?.get) return {};
  const data = await chromeApi.storage.local.get(RUNTIME_CONFIG_STORAGE_KEY);
  return data?.[RUNTIME_CONFIG_STORAGE_KEY] || {};
}

/**
 * Initializes popup runtime settings and subscribes to storage changes.
 *
 * @param {object} [options] - Initialization options.
 * @param {Function} [options.onUpdate] - Callback invoked when config changes.
 * @returns {Promise<object>} Resolved runtime configuration.
 */
export async function initializePopupRuntimeSettings({ onUpdate } = {}) {
  const stored = await fetchStoredConfig();
  const merged = applyRuntimeConfigOverrides(stored, { logger: popupLogger, source: "popup" });
  popupLogger.updateConfig?.(merged);

  logPopupEvent({
    type: "info",
    message: "Loaded popup runtime settings",
    context: { hasStoredConfig: Boolean(Object.keys(stored).length) },
  });

  if (chromeApi?.storage?.onChanged) {
    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[RUNTIME_CONFIG_STORAGE_KEY]) return;
      const nextConfig = changes[RUNTIME_CONFIG_STORAGE_KEY].newValue || {};
      const updated = applyRuntimeConfigOverrides(nextConfig, {
        logger: popupLogger,
        source: "popup",
      });
      popupLogger.updateConfig?.(updated);
      logPopupEvent({
        type: "info",
        message: "Popup runtime settings updated",
        context: { keys: Object.keys(nextConfig) },
      });
      onUpdate?.(updated);
    });
  }

  onUpdate?.(merged);
  return getRuntimeConfig();
}

/**
 * Persists runtime configuration overrides from the popup UI.
 *
 * @param {object} config - Runtime configuration overrides.
 * @returns {Promise<{stored: boolean}>} Storage outcome.
 */
export async function persistPopupRuntimeSettings(config) {
  if (!chromeApi?.storage?.local?.set) {
    return { stored: false };
  }
  await chromeApi.storage.local.set({ [RUNTIME_CONFIG_STORAGE_KEY]: config });
  logPopupEvent({
    type: "info",
    message: "Saved runtime settings",
    context: { keys: Object.keys(config || {}) },
  });
  return { stored: true };
}
