import { RUNTIME_CONFIG_STORAGE_KEY, applyRuntimeConfigOverrides } from "../runtime-settings.js";
import { getRuntimeConfig } from "../runtime-config.js";

const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

/**
 * Retrieves persisted runtime configuration from Chrome storage.
 *
 * @returns {Promise<object>} Stored runtime configuration overrides.
 */
async function fetchStoredConfig() {
  if (!chromeApi?.storage?.local?.get) return {};
  const data = await chromeApi.storage.local.get(RUNTIME_CONFIG_STORAGE_KEY);
  return data?.[RUNTIME_CONFIG_STORAGE_KEY] || {};
}

/**
 * Initializes runtime configuration updates for the background service worker.
 *
 * @param {object} [options] - Configuration hooks.
 * @param {object} [options.logger] - Structured logger for configuration events.
 * @param {Function} [options.onUpdate] - Callback invoked when config changes.
 * @returns {Promise<object>} Resolved runtime configuration.
 */
export async function initializeRuntimeSettings({ logger, onUpdate } = {}) {
  const stored = await fetchStoredConfig();
  logger?.log?.({
    type: "debug",
    message: "Fetched stored runtime config",
    source: "settings",
    context: { keyCount: Object.keys(stored).length },
  });
  const merged = applyRuntimeConfigOverrides(stored, { logger, source: "settings" });
  logger?.log?.({
    type: "debug",
    message: "Applied stored runtime config overrides",
    source: "settings",
    context: { mergedKeys: Object.keys(merged).length },
  });

  logger?.log?.({
    type: "info",
    message: "Loaded runtime settings",
    source: "settings",
    context: { hasStoredConfig: Boolean(Object.keys(stored).length) },
  });

  if (chromeApi?.storage?.onChanged) {
    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[RUNTIME_CONFIG_STORAGE_KEY]) return;
      logger?.log?.({
        type: "debug",
        message: "Observed runtime config storage change",
        source: "settings",
        context: { area },
      });
      const nextConfig = changes[RUNTIME_CONFIG_STORAGE_KEY].newValue || {};
      const updated = applyRuntimeConfigOverrides(nextConfig, { logger, source: "settings" });
      logger?.log?.({
        type: "info",
        message: "Runtime settings updated",
        source: "settings",
        context: { keys: Object.keys(nextConfig) },
      });
      onUpdate?.(updated);
    });
  } else {
    // Emit a debug signal when change listeners are unavailable (tests or non-extension envs).
    logger?.log?.({
      type: "debug",
      message: "Runtime settings change listener unavailable",
      source: "settings",
      context: { hasStorageApi: Boolean(chromeApi?.storage) },
    });
  }

  onUpdate?.(merged);
  return getRuntimeConfig();
}
