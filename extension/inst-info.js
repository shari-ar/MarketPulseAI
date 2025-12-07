export const INST_INFO_SYMBOL_REGEX = /\/instInfo\/([^/?#"'\s]+)(?=[/?#]|$)/i;
export const INST_INFO_SYMBOL_GLOBAL_REGEX = /\/instInfo\/([^/?#"'\s]+)(?=[/?#]|$)/gi;

export function extractInstInfoSymbol(url) {
  if (typeof url !== "string") return null;
  const match = url.match(INST_INFO_SYMBOL_REGEX);
  return match ? decodeURIComponent(match[1]) : null;
}
