import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";

function parseTimeString(value) {
  if (typeof value !== "string") return null;
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function extractParts(now = new Date(), timeZone = DEFAULT_RUNTIME_CONFIG.MARKET_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  };
}

function minutesFromParts({ hour, minute }) {
  return hour * 60 + minute;
}

export function formatMarketClock(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const { hour, minute } = extractParts(now, config.MARKET_TIMEZONE);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isWithinBlackout(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const { hour, minute } = extractParts(now, config.MARKET_TIMEZONE);
  const minutes = minutesFromParts({ hour, minute });
  const open = minutesFromParts(parseTimeString(config.MARKET_OPEN));
  const close = minutesFromParts(parseTimeString(config.MARKET_CLOSE));
  return minutes >= open && minutes < close;
}

export function isWithinCollectionWindow(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const { hour, minute } = extractParts(now, config.MARKET_TIMEZONE);
  const minutes = minutesFromParts({ hour, minute });
  const close = minutesFromParts(parseTimeString(config.MARKET_CLOSE));
  const deadline = minutesFromParts(parseTimeString(config.ANALYSIS_DEADLINE));

  if (close > deadline) {
    // Window crosses midnight; allow from close until 23:59 and 00:00 until deadline
    return minutes >= close || minutes < deadline;
  }

  return minutes >= close && minutes < deadline;
}

export function marketDateFromIso(isoString, config = DEFAULT_RUNTIME_CONFIG) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return null;

  const { year, month, day } = extractParts(date, config.MARKET_TIMEZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isPastAnalysisDeadline(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const { hour, minute } = extractParts(now, config.MARKET_TIMEZONE);
  const minutes = minutesFromParts({ hour, minute });
  const deadline = minutesFromParts(parseTimeString(config.ANALYSIS_DEADLINE));
  return minutes >= deadline && !isWithinBlackout(now, config);
}
