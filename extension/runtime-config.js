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

export function getRuntimeConfig(overrides = {}) {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    ...overrides,
    LOG_RETENTION_DAYS: {
      ...DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS,
      ...(overrides.LOG_RETENTION_DAYS || {}),
    },
  };
}
