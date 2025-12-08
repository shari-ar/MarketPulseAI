export const GLOBAL_STATUS = {
  IDLE: "idle",
  COLLECTING: "collecting",
  ANALYZING: "analyzing",
};

const STATUS_VALUES = Object.values(GLOBAL_STATUS);

function isValidStatus(status) {
  return STATUS_VALUES.includes(status);
}

export function normalizeStatus(status) {
  if (isValidStatus(status)) return status;
  return GLOBAL_STATUS.IDLE;
}

export function requestGlobalStatus() {
  const runtime = globalThis?.chrome?.runtime;
  if (!runtime?.sendMessage) {
    return Promise.resolve({ value: GLOBAL_STATUS.IDLE, updatedAt: null });
  }

  return runtime
    .sendMessage({ type: "GLOBAL_STATUS" })
    .then((response) => ({
      value: normalizeStatus(response?.value),
      updatedAt: response?.updatedAt || null,
    }))
    .catch(() => ({ value: GLOBAL_STATUS.IDLE, updatedAt: null }));
}

export function sendStatusUpdate(status, { source } = {}) {
  const runtime = globalThis?.chrome?.runtime;
  if (!runtime?.sendMessage || !isValidStatus(status)) {
    return Promise.resolve(null);
  }

  return runtime.sendMessage({ type: "SET_GLOBAL_STATUS", status, source }).catch(() => null);
}

export function onStatusChange(callback) {
  const runtime = globalThis?.chrome?.runtime;
  if (!runtime?.onMessage?.addListener || typeof callback !== "function") {
    return () => {};
  }

  const listener = (message) => {
    if (message?.type !== "GLOBAL_STATUS_CHANGE") return;
    const nextStatus = message?.status?.value || message?.status;
    if (nextStatus) {
      callback(normalizeStatus(nextStatus), message?.status || null);
    }
  };

  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

export function isValidGlobalStatus(status) {
  return isValidStatus(status);
}
