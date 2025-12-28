// Prefer the globally injected XLSX bundle in the extension runtime.
let XLSX = globalThis.XLSX;

// Fall back to dynamic import for local tooling/tests where the vendor bundle is absent.
if (!XLSX && typeof process !== "undefined") {
  const module = await import("xlsx");
  XLSX = module.default ?? module;
}

// Exported helpers mirror the XLSX API to keep popup imports consistent.
const utils = XLSX?.utils;
const read = XLSX?.read;
const writeFile = XLSX?.writeFile;

export { XLSX, utils, read, writeFile };
export default XLSX;
