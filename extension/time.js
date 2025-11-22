export const MARKET_TIMEZONE = "Asia/Tehran";
export const MARKET_CLOSE_HOUR = 13;
export const MARKET_CLOSE_MINUTE = 0;

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

export function isBeforeMarketClose(now = new Date()) {
  const { hour, minute } = extractMarketParts(now);
  if (hour < MARKET_CLOSE_HOUR) return true;
  if (hour > MARKET_CLOSE_HOUR) return false;
  return minute < MARKET_CLOSE_MINUTE;
}

export function currentMarketTimestamp(now = new Date()) {
  const { year, month, day, hour, minute } = extractMarketParts(now);
  return (
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` +
    `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
}
