import { RUNTIME_CONFIG } from "./runtime-config.js";

const DEFAULT_TIMEZONE = "Asia/Tehran";
const DEFAULT_LOCK_START = { hour: 8, minute: 0 };
const DEFAULT_LOCK_END = { hour: 13, minute: 0 };

export const MARKET_TIMEZONE = RUNTIME_CONFIG?.MARKET_TIMEZONE || DEFAULT_TIMEZONE;

function parseTime(value, fallback) {
  if (typeof value !== "string") return fallback;
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return fallback;
  return { hour, minute };
}

const lockStart = parseTime(RUNTIME_CONFIG?.MARKET_LOCK_START_TIME, DEFAULT_LOCK_START);
const lockEnd = parseTime(RUNTIME_CONFIG?.MARKET_LOCK_END_TIME, DEFAULT_LOCK_END);

export const MARKET_LOCK_START_HOUR = lockStart.hour;
export const MARKET_LOCK_START_MINUTE = lockStart.minute;
export const MARKET_LOCK_END_HOUR = lockEnd.hour;
export const MARKET_LOCK_END_MINUTE = lockEnd.minute;

function extractMarketParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
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

export function formatMarketClock(now = new Date()) {
  const { hour, minute } = extractMarketParts(now);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isAtOrAfterLockStart(hour, minute) {
  if (hour > MARKET_LOCK_START_HOUR) return true;
  if (hour < MARKET_LOCK_START_HOUR) return false;
  return minute >= MARKET_LOCK_START_MINUTE;
}

function isBeforeLockEnd(hour, minute) {
  if (hour < MARKET_LOCK_END_HOUR) return true;
  if (hour > MARKET_LOCK_END_HOUR) return false;
  return minute < MARKET_LOCK_END_MINUTE;
}

export function isWithinMarketLockWindow(now = new Date()) {
  const { hour, minute } = extractMarketParts(now);
  return isAtOrAfterLockStart(hour, minute) && isBeforeLockEnd(hour, minute);
}

function formatLockPoint(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatMarketLockWindow() {
  return `${formatLockPoint(MARKET_LOCK_START_HOUR, MARKET_LOCK_START_MINUTE)}-${formatLockPoint(MARKET_LOCK_END_HOUR, MARKET_LOCK_END_MINUTE)}`;
}

export function currentMarketTimestamp(now = new Date()) {
  const { year, month, day, hour, minute } = extractMarketParts(now);
  return (
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` +
    `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
}

export function currentMarketDate(now = new Date()) {
  const { year, month, day } = extractMarketParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
