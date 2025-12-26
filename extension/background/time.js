import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";

/**
 * Converts a "HH:mm" string into numeric hour/minute parts.
 *
 * @param {string} value - Time string in 24-hour format.
 * @returns {{hour: number, minute: number} | null} Parsed parts or null when invalid.
 */
function parseTimeString(value) {
  if (typeof value !== "string") return null;
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

const WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Extracts timezone-aware date components for consistent trading-day calculations.
 *
 * @param {Date} now - Source date to evaluate.
 * @param {string} timeZone - IANA timezone identifier.
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, weekday: number}}
 *   Discrete components mapped to the configured trading timezone.
 */
function extractParts(now = new Date(), timeZone = DEFAULT_RUNTIME_CONFIG.MARKET_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[String(parts.weekday).slice(0, 3).toLowerCase()],
  };
}

/**
 * Converts hour/minute parts to total minutes to simplify range comparisons.
 *
 * @param {{hour: number, minute: number}} param0 - Time components.
 * @returns {number} Minutes since 00:00.
 */
function minutesFromParts({ hour, minute }) {
  return hour * 60 + minute;
}

/**
 * Formats the current market time for display using the configured timezone.
 *
 * @param {Date} [now=new Date()] - Date to format.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration with MARKET_TIMEZONE.
 * @returns {string} Time string in HH:mm.
 */
export function formatMarketClock(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  const { hour, minute } = extractParts(now, runtimeConfig.MARKET_TIMEZONE);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Determines if the provided time falls within trading hours on a configured trading day.
 *
 * @param {Date} [now=new Date()] - Time to evaluate.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling schedule.
 * @returns {boolean} True when within open trading hours.
 */
export function isWithinBlackout(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  const { hour, minute, weekday } = extractParts(now, runtimeConfig.MARKET_TIMEZONE);
  if (!runtimeConfig.TRADING_DAYS.includes(weekday)) return false;
  const minutes = minutesFromParts({ hour, minute });
  const open = minutesFromParts(parseTimeString(runtimeConfig.MARKET_OPEN));
  const close = minutesFromParts(parseTimeString(runtimeConfig.MARKET_CLOSE));
  return minutes >= open && minutes < close;
}

/**
 * Checks whether analysis data collection is permitted, accounting for markets that close
 * before or after midnight relative to the configured analysis deadline.
 *
 * @param {Date} [now=new Date()] - Time to evaluate.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling schedule.
 * @returns {boolean} True when within the collection window.
 */
export function isWithinCollectionWindow(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  const { hour, minute, weekday } = extractParts(now, runtimeConfig.MARKET_TIMEZONE);

  if (!runtimeConfig.TRADING_DAYS.includes(weekday)) return true;

  const minutes = minutesFromParts({ hour, minute });
  const close = minutesFromParts(parseTimeString(runtimeConfig.MARKET_CLOSE));
  const deadline = minutesFromParts(parseTimeString(runtimeConfig.ANALYSIS_DEADLINE));

  if (close > deadline) {
    // Window crosses midnight; allow from close until 23:59 and 00:00 until deadline
    return minutes >= close || minutes < deadline;
  }

  return minutes >= close && minutes < deadline;
}

/**
 * Produces a YYYY-MM-DD string for the market date associated with an ISO timestamp.
 *
 * @param {string} isoString - ISO timestamp to convert.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling timezone.
 * @returns {string|null} Market date string or null when the input is invalid.
 */
export function marketDateFromIso(isoString, config = DEFAULT_RUNTIME_CONFIG) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return null;

  const runtimeConfig = getRuntimeConfig(config);
  const { year, month, day } = extractParts(date, runtimeConfig.MARKET_TIMEZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Evaluates whether the analysis deadline has passed while ensuring the market is not open.
 *
 * @param {Date} [now=new Date()] - Time to evaluate.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling schedule.
 * @returns {boolean} True when the deadline has passed outside active trading hours.
 */
export function isPastAnalysisDeadline(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  const { hour, minute } = extractParts(now, runtimeConfig.MARKET_TIMEZONE);
  const minutes = minutesFromParts({ hour, minute });
  const deadline = minutesFromParts(parseTimeString(runtimeConfig.ANALYSIS_DEADLINE));
  return minutes >= deadline && !isWithinBlackout(now, runtimeConfig);
}

/**
 * Calculates the delay (in milliseconds) until the next occurrence of a market
 * time in the configured timezone. Useful for scheduling close/deadline timers.
 *
 * @param {Date} [now=new Date()] - Current time reference.
 * @param {string} targetTime - Target time in "HH:mm" format.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration.
 * @param {object} [options]
 * @param {boolean} [options.requireTradingDay=true] - Skip to the next trading day.
 * @returns {number|null} Milliseconds until the next target time or null if invalid.
 */
export function getDelayUntilMarketTime(
  now = new Date(),
  targetTime,
  config = DEFAULT_RUNTIME_CONFIG,
  { requireTradingDay = true } = {}
) {
  const runtimeConfig = getRuntimeConfig(config);
  const target = parseTimeString(targetTime);
  if (!target) return null;

  const { hour, minute, weekday } = extractParts(now, runtimeConfig.MARKET_TIMEZONE);
  const currentMinutes = minutesFromParts({ hour, minute });
  const targetMinutes = minutesFromParts(target);
  const isTradingDay = (day) => runtimeConfig.TRADING_DAYS.includes(day);

  let dayOffset = 0;
  let candidateWeekday = weekday;

  const advanceDay = () => {
    dayOffset += 1;
    candidateWeekday = (candidateWeekday + 1) % 7;
  };

  if (requireTradingDay && !isTradingDay(candidateWeekday)) {
    while (!isTradingDay(candidateWeekday)) {
      advanceDay();
    }
  }

  if (dayOffset === 0 && currentMinutes >= targetMinutes) {
    advanceDay();
  }

  if (requireTradingDay) {
    while (!isTradingDay(candidateWeekday)) {
      advanceDay();
    }
  }

  const minutesUntil = dayOffset * 1440 + (targetMinutes - currentMinutes);
  return Math.max(0, minutesUntil) * 60 * 1000;
}
