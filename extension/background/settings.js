import { RUNTIME_CONFIG_STORAGE_KEY, applyRuntimeConfigOverrides } from "../runtime-settings.js";
import { getRuntimeConfig } from "../runtime-config.js";

const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

async function fetchStoredConfig() {
  if (!chromeApi?.storage?.local?.get) return {};
  const data = await chromeApi.storage.local.get(RUNTIME_CONFIG_STORAGE_KEY);
  return data?.[RUNTIME_CONFIG_STORAGE_KEY] || {};
}

export async function initializeRuntimeSettings({ logger, onUpdate } = {}) {
  const stored = await fetchStoredConfig();
  const merged = applyRuntimeConfigOverrides(stored);

  logger?.log?.({
    type: "info",
    message: "Loaded runtime settings",
    source: "settings",
    context: { hasStoredConfig: Boolean(Object.keys(stored).length) },
  });

  if (chromeApi?.storage?.onChanged) {
    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[RUNTIME_CONFIG_STORAGE_KEY]) return;
      const nextConfig = changes[RUNTIME_CONFIG_STORAGE_KEY].newValue || {};
      const updated = applyRuntimeConfigOverrides(nextConfig);
      logger?.log?.({
        type: "info",
        message: "Runtime settings updated",
        source: "settings",
        context: { keys: Object.keys(nextConfig) },
      });
      onUpdate?.(updated);
    });
  }

  onUpdate?.(merged);
  return getRuntimeConfig();
}
