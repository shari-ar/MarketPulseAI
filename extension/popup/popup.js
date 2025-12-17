import * as XLSX from "xlsx";
import { rankSwingResults } from "../analysis/rank.js";
import { SNAPSHOT_FIELDS } from "../storage/schema.js";

const COLUMN_ORDER = Object.keys(SNAPSHOT_FIELDS);
const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

export function buildExportWorkbook(rows = []) {
  const data = [COLUMN_ORDER];
  rows.forEach((row) => {
    data.push(COLUMN_ORDER.map((key) => row[key] ?? null));
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "rankings");
  return workbook;
}

export function mergeImportedRows(existing = [], incoming = []) {
  const byKey = new Set(existing.map((row) => `${row.id}-${row.dateTime}`));
  incoming.forEach((row) => {
    const key = `${row.id}-${row.dateTime}`;
    if (!byKey.has(key)) {
      existing.push(row);
      byKey.add(key);
    }
  });
  return existing;
}

function renderRankings(rows = []) {
  if (typeof document === "undefined") return;
  const tbody = document.querySelector("#rankings tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (index < 5) tr.classList.add("highlight");
    tr.innerHTML = `
      <td>${row.symbolAbbreviation || row.id}</td>
      <td>${(row.predictedSwingProbability * 100).toFixed(1)}%</td>
      <td>${row.predictedSwingPercent.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportCurrentRows(rows) {
  const workbook = buildExportWorkbook(rows);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  XLSX.writeFile(workbook, `marketpulseai-${timestamp}.xlsx`);
}

function setupUi() {
  if (typeof document === "undefined") return;
  const exportBtn = document.getElementById("export");
  const importBtn = document.getElementById("import");
  const importFile = document.getElementById("import-file");

  let latestRows = [];

  const handleExport = () => exportCurrentRows(latestRows);
  const handleImport = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    latestRows = mergeImportedRows(latestRows, rows);
    renderRankings(rankSwingResults(latestRows));
  };

  exportBtn?.addEventListener("click", handleExport);
  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", handleImport);

  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.get(["rankedResults"], ({ rankedResults = [] }) => {
      latestRows = rankedResults;
      renderRankings(rankSwingResults(rankedResults));
    });
  }
}

setupUi();
