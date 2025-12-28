// Centralized logger for build scripts to keep console output consistent.
const LEVELS = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${LEVELS[level]}] ${message}`;
}

/**
 * Emit an informational log line for build-time scripts.
 *
 * @param {string} message - Message to record.
 */
function logInfo(message) {
  console.log(formatMessage("info", message)); // eslint-disable-line no-console
}

/**
 * Emit a warning log line for build-time scripts.
 *
 * @param {string} message - Message to record.
 */
function logWarn(message) {
  console.warn(formatMessage("warn", message)); // eslint-disable-line no-console
}

/**
 * Emit an error log line for build-time scripts.
 *
 * @param {string} message - Message to record.
 */
function logError(message) {
  console.error(formatMessage("error", message)); // eslint-disable-line no-console
}

module.exports = { logInfo, logWarn, logError };
