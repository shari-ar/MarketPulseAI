let XLSX = globalThis.XLSX;

if (!XLSX && typeof process !== "undefined") {
  const module = await import("xlsx");
  XLSX = module.default ?? module;
}

const utils = XLSX?.utils;
const read = XLSX?.read;
const writeFile = XLSX?.writeFile;

export { XLSX, utils, read, writeFile };
export default XLSX;
