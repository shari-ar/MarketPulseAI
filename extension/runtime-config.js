export const RUNTIME_CONFIG = {
  MARKET_TIMEZONE: "Asia/Tehran",
  MARKET_LOCK_START_TIME: "08:00",
  MARKET_LOCK_END_TIME: "13:00",
};

const chromeRuntime = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;
const hasChromeRuntime = !!chromeRuntime?.runtime?.getURL;

export const ANALYSIS_CONFIG = {
  tensorflowCdnUrl: "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js",
  modelUrl: hasChromeRuntime
    ? chromeRuntime.runtime.getURL("analysis/model/model.json")
    : "analysis/model/model.json",
};
