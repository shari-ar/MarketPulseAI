/**
 * Default runtime configuration mirrors the documented settings in `docs/configuration.md`.
 * Environment variables can override any value using the `MARKETPULSEAI_` prefix, keeping
 * the extension configurable without code changes (e.g., `MARKETPULSEAI_TOP_SWING_COUNT=7`).
 */
export const DEFAULT_RUNTIME_CONFIG = {
  MARKET_TIMEZONE: "Asia/Tehran",
  MARKET_OPEN: "09:00",
  MARKET_CLOSE: "13:00",
  ANALYSIS_DEADLINE: "07:00",
  TRADING_DAYS: [6, 0, 1, 2, 3],
  RETENTION_DAYS: 7,
  TOP_SWING_COUNT: 5,
  LOG_RETENTION_DAYS: {
    error: 30,
    warning: 7,
    info: 3,
  },
};

const ENV_PREFIX = "MARKETPULSEAI_";

function getEnvSource() {
  const maybeProcess = typeof globalThis !== "undefined" ? globalThis.process : undefined;
  if (maybeProcess?.env) return maybeProcess.env;
  if (typeof globalThis !== "undefined" && globalThis.MarketPulseAIEnv) {
    return globalThis.MarketPulseAIEnv;
  }
  return {};
}

function parseTradingDays(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map((day) => Number(day)).filter(Number.isFinite);
  if (typeof value === "string") {
    const parts = value
      .split(",")
      .map((part) => Number(part.trim()))
      .filter(Number.isFinite);
    return parts.length ? parts : null;
  }
  return null;
}

function parseLogRetention(env) {
  const retention = {};
  const serialized = env[`${ENV_PREFIX}LOG_RETENTION_DAYS`];
  if (serialized) {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed && typeof parsed === "object") Object.assign(retention, parsed);
    } catch (error) {
      console.warn("Invalid LOG_RETENTION_DAYS env config", error); // eslint-disable-line no-console
    }
  }

  ["error", "warning", "info"].forEach((type) => {
    const value = env[`${ENV_PREFIX}LOG_RETENTION_${type.toUpperCase()}`];
    if (value !== undefined) {
      const days = Number(value);
      if (Number.isFinite(days)) retention[type] = days;
    }
  });

  return Object.keys(retention).length ? retention : null;
}

function loadEnvRuntimeConfig() {
  const env = getEnvSource();
  const tradingDays = parseTradingDays(env[`${ENV_PREFIX}TRADING_DAYS`]);
  const logRetention = parseLogRetention(env);

  const config = {
    MARKET_TIMEZONE: env[`${ENV_PREFIX}MARKET_TIMEZONE`],
    MARKET_OPEN: env[`${ENV_PREFIX}MARKET_OPEN`],
    MARKET_CLOSE: env[`${ENV_PREFIX}MARKET_CLOSE`],
    ANALYSIS_DEADLINE: env[`${ENV_PREFIX}ANALYSIS_DEADLINE`],
    TRADING_DAYS: tradingDays,
    RETENTION_DAYS: env[`${ENV_PREFIX}RETENTION_DAYS`]
      ? Number(env[`${ENV_PREFIX}RETENTION_DAYS`])
      : undefined,
    TOP_SWING_COUNT: env[`${ENV_PREFIX}TOP_SWING_COUNT`]
      ? Number(env[`${ENV_PREFIX}TOP_SWING_COUNT`])
      : undefined,
    LOG_RETENTION_DAYS: logRetention || undefined,
  };

  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined && value !== null)
  );
}

const ENV_RUNTIME_CONFIG = loadEnvRuntimeConfig();

export function getRuntimeConfig(overrides = {}) {
  const base = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...ENV_RUNTIME_CONFIG,
    ...overrides,
  };

  return {
    ...base,
    LOG_RETENTION_DAYS: {
      ...DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS,
      ...(ENV_RUNTIME_CONFIG.LOG_RETENTION_DAYS || {}),
      ...(overrides.LOG_RETENTION_DAYS || {}),
    },
  };
}
