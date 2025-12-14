const INST_INFO_LINK_REGEX = /\/instInfo\/([^/?#"'\s]+)(?=[/?#]|$)/gi;

function parseNumberFromText(text) {
  if (typeof text !== "string") return null;
  const normalized = text.replace(/\u066B/g, ".").replace(/\u066C/g, ",");
  const match = normalized.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const cleaned = match[0].replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function sumNumbers(values = []) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((total, value) => total + value, 0);
}

function coerceText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function extractTextById(html, id) {
  const regex = new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  const match = html.match(regex);
  if (!match) return null;

  const content = match[1];
  const titleMatch = content.match(/title=["']([^"']+)["']/i);
  if (titleMatch) return titleMatch[1];

  const stripped = content.replace(/<[^>]*>/g, " ").trim();
  return stripped || null;
}

function parseNumberById(html, id) {
  return parseNumberFromText(extractTextById(html, id));
}

function extractRangePair(html, label) {
  const regex = new RegExp(
    `${label}</td>\\s*<td[^>]*>\\s*<div[^>]*>\\s*<div[^>]*>([^<]*)<\\/div>.*?<td[^>]*>\\s*<div[^>]*>\\s*<div[^>]*>([^<]*)`,
    "i"
  );
  const match = html.match(regex);
  if (!match) return { low: null, high: null };

  const first = parseNumberFromText(match[1]);
  const second = parseNumberFromText(match[2]);
  const [low, high] = [first, second].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  return { low, high };
}

function extractLabeledRowNumber(html, label) {
  const rowRegex = new RegExp(`${label}</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
  const rowMatch = html.match(rowRegex);
  if (!rowMatch) return null;

  const titleMatch = rowMatch[1].match(/title=["']([^"']+)["']/i);
  if (titleMatch) {
    const parsed = parseNumberFromText(titleMatch[1]);
    if (parsed !== null) return parsed;
  }

  const text = rowMatch[1].replace(/<[^>]*>/g, "");
  return parseNumberFromText(text);
}

function extractCountRow(html, label) {
  const countsSection = html.split(/تعداد<\/td>\s*<td>خرید<\/td><td>فروش<\/td>/i)[1] ?? html;
  const regex = new RegExp(
    `${label}</td>\\s*<td[^>]*>[\\s\\S]*?<div[^>]*>\\s*<div[^>]*>([^<]*)<\\/div>[\\s\\S]*?<td[^>]*>[\\s\\S]*?<div[^>]*>\\s*<div[^>]*>([^<]*)`,
    "i"
  );
  const match = countsSection.match(regex);
  if (!match) return { buy: null, sell: null };
  return { buy: parseNumberFromText(match[1]), sell: parseNumberFromText(match[2]) };
}

function extractSymbolHeader(html) {
  const headerMatch = html.match(
    /<div[^>]*class=["'][^"']*header\s+bigheader[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  if (!headerMatch) return { symbolName: null, symbolAbbreviation: null };

  const spanMatches = Array.from(headerMatch[1].matchAll(/<span[^>]*>([^<]*)<\/span>/gi));
  const [symbolName, symbolAbbreviation] = spanMatches.map((match) => coerceText(match[1]));

  return {
    symbolName: symbolName || null,
    symbolAbbreviation: symbolAbbreviation || null,
  };
}

export function extractTopBoxSnapshotFromPage(html = "") {
  if (typeof html !== "string" || !html.trim()) return null;

  const close = parseNumberById(html, "d02");
  const primeCost = parseNumberById(html, "d03");
  const open = parseNumberById(html, "d04");
  const tradesCount = parseNumberById(html, "d08");
  const tradingVolume = parseNumberById(html, "d09");
  const tradingValue = parseNumberById(html, "d10");
  const marketValue = parseNumberById(html, "d11");
  const closeTime = coerceText(extractTextById(html, "d00"));
  const status = coerceText(extractTextById(html, "d01"));

  const dayRange = extractRangePair(html, "بازه روز");
  const { low, high } = dayRange;
  const allowedHigh = parseNumberById(html, "PRange1");
  const allowedLow = parseNumberById(html, "PRange2");

  const shareCount = extractLabeledRowNumber(html, "تعداد سهام");
  const baseVolume = extractLabeledRowNumber(html, "حجم مبنا");
  const floatingShares = extractLabeledRowNumber(html, "سهام شناور");
  const averageMonthlyVolume = extractLabeledRowNumber(html, "میانگین حجم ماه");

  const naturalBuyVolume = parseNumberById(html, "e0");
  const juridicalBuyVolume = parseNumberById(html, "e1");
  const naturalSellVolume = parseNumberById(html, "e3");
  const juridicalSellVolume = parseNumberById(html, "e4");

  const totalBuyVolume = sumNumbers([naturalBuyVolume, juridicalBuyVolume]);
  const totalSellVolume = sumNumbers([naturalSellVolume, juridicalSellVolume]);

  const totalCounts = extractCountRow(html, "مجموع");
  const naturalCounts = extractCountRow(html, "حقیقی");
  const juridicalCounts = extractCountRow(html, "حقوقی");

  const snapshot = {
    ...extractSymbolHeader(html),
    close,
    primeCost,
    open,
    tradesCount,
    tradingVolume,
    tradingValue,
    marketValue,
    closeTime,
    status,
    low,
    high,
    allowedLow,
    allowedHigh,
    shareCount,
    baseVolume,
    floatingShares,
    averageMonthlyVolume,
    naturalBuyVolume,
    naturalSellVolume,
    juridicalBuyVolume,
    juridicalSellVolume,
    totalBuyVolume: Number.isFinite(totalBuyVolume) ? totalBuyVolume : null,
    totalSellVolume: Number.isFinite(totalSellVolume) ? totalSellVolume : null,
    naturalBuyCount: naturalCounts.buy,
    naturalSellCount: naturalCounts.sell,
    juridicalBuyCount: juridicalCounts.buy,
    juridicalSellCount: juridicalCounts.sell,
    totalBuyCount: totalCounts.buy,
    totalSellCount: totalCounts.sell,
  };

  const missingRequiredField = Object.entries(snapshot).some(
    ([field, value]) => field !== "floatingShares" && (value === null || value === undefined)
  );

  if (missingRequiredField) return null;

  return snapshot;
}

export function extractTopBoxSnapshotFromDom(root = globalThis.document) {
  if (!root?.querySelector) return null;
  const container = root.querySelector("#TopBox") ?? root;

  function textFromId(id) {
    const node = container.querySelector(`#${id}`);
    const candidate = node?.getAttribute?.("title") ?? node?.textContent ?? null;
    return parseNumberFromText(candidate);
  }

  function rawTextById(id) {
    const node = container.querySelector(`#${id}`);
    if (!node) return null;
    return node.textContent ? node.textContent.trim() : null;
  }

  function labeledValue(label) {
    const cell = Array.from(container.querySelectorAll("td")).find((td) =>
      td.textContent?.includes(label)
    );
    if (!cell?.parentElement) return null;
    const valueCell = Array.from(cell.parentElement.querySelectorAll("td")).find(
      (td, idx) => idx > 0
    );
    if (!valueCell) return null;
    const titleText = valueCell.getAttribute?.("title");
    const parsedTitle = parseNumberFromText(titleText);
    if (parsedTitle !== null) return parsedTitle;
    return parseNumberFromText(valueCell.textContent ?? "");
  }

  function extractCountsRow(label) {
    const rows = Array.from(container.querySelectorAll("tr"));
    const target = rows.find((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return cells.length >= 3 && cells[0].textContent?.trim().includes(label);
    });

    if (!target) return { buy: null, sell: null };
    const cells = Array.from(target.querySelectorAll("td"));
    return {
      buy: parseNumberFromText(cells[1]?.textContent ?? ""),
      sell: parseNumberFromText(cells[2]?.textContent ?? ""),
    };
  }

  const rangeLabel = Array.from(container.querySelectorAll("td")).find((cell) =>
    cell.textContent?.includes("بازه روز")
  );
  let low = null;
  let high = null;
  if (rangeLabel?.parentElement) {
    const numbers = Array.from(rangeLabel.parentElement.querySelectorAll("div"))
      .map((node) => parseNumberFromText(node.textContent))
      .filter((num) => num !== null);
    if (numbers.length >= 2) {
      low = Math.min(...numbers);
      high = Math.max(...numbers);
    } else if (numbers.length === 1) {
      low = high = numbers[0];
    }
  }

  const naturalCounts = extractCountsRow("حقیقی");
  const juridicalCounts = extractCountsRow("حقوقی");
  const totalCounts = extractCountsRow("مجموع");

  const header =
    root.querySelector("#MainBox > div.header.bigheader") ??
    root.querySelector("div.header.bigheader");
  const [symbolName, symbolAbbreviation] = header
    ? Array.from(header.querySelectorAll("span"))
        .map((span) => coerceText(span.textContent))
        .slice(0, 2)
    : [];

  const naturalBuyVolume = textFromId("e0");
  const juridicalBuyVolume = textFromId("e1");
  const naturalSellVolume = textFromId("e3");
  const juridicalSellVolume = textFromId("e4");

  const totalBuyVolume = sumNumbers([naturalBuyVolume, juridicalBuyVolume]);
  const totalSellVolume = sumNumbers([naturalSellVolume, juridicalSellVolume]);

  const snapshot = {
    symbolName: symbolName || null,
    symbolAbbreviation: symbolAbbreviation || null,
    close: textFromId("d02"),
    primeCost: textFromId("d03"),
    open: textFromId("d04"),
    tradesCount: textFromId("d08"),
    tradingVolume: textFromId("d09"),
    tradingValue: textFromId("d10"),
    marketValue: textFromId("d11"),
    closeTime: rawTextById("d00"),
    status: rawTextById("d01"),
    low,
    high,
    allowedLow: textFromId("PRange2"),
    allowedHigh: textFromId("PRange1"),
    shareCount: labeledValue("تعداد سهام"),
    baseVolume: labeledValue("حجم مبنا"),
    floatingShares: labeledValue("سهام شناور"),
    averageMonthlyVolume: labeledValue("میانگین حجم ماه"),
    naturalBuyVolume,
    naturalSellVolume,
    juridicalBuyVolume,
    juridicalSellVolume,
    totalBuyVolume: Number.isFinite(totalBuyVolume) ? totalBuyVolume : null,
    totalSellVolume: Number.isFinite(totalSellVolume) ? totalSellVolume : null,
    naturalBuyCount: naturalCounts.buy,
    naturalSellCount: naturalCounts.sell,
    juridicalBuyCount: juridicalCounts.buy,
    juridicalSellCount: juridicalCounts.sell,
    totalBuyCount: totalCounts.buy,
    totalSellCount: totalCounts.sell,
  };

  const missingRequiredField = Object.entries(snapshot).some(
    ([field, value]) => field !== "floatingShares" && (value === null || value === undefined)
  );

  if (missingRequiredField) return null;

  return snapshot;
}

export function extractSymbolsFromHtml(html = "") {
  if (typeof html !== "string") return [];
  return Array.from(new Set([...html.matchAll(INST_INFO_LINK_REGEX)].map((match) => match[1])));
}
