# Exports & Imports

## Excel Generation

- **Manual trigger only:** Analysis runs automatically, but exports are created only when the user explicitly invokes them.
- **SheetJS pipeline via popup:** The export popup is the surface that invokes SheetJS to convert the current table view into an `.xlsx` file without server calls.
- **Column parity:** Exported columns mirror the on-screen table—including both `predictedSwingPercent` and `predictedSwingProbability`—so offline reviewers see identical data.
- **Freshness guarantee:** The exported file always reflects the latest analyzed table shown to the user.
- **File naming:** Exports are timestamped to reflect when the analysis was generated.
- **QA checklist:** Open the generated `.xlsx` and confirm that all analysis columns (`predictedSwingPercent`, `predictedSwingProbability`) match the corresponding database records.

## Imports

- **Same-surface control:** An Import button sits beside the Export button in the popup so users can round-trip Excel without hunting through menus.
- **Schema alignment:** Imports accept the exact `.xlsx` schema produced by exports; column names and order must match the SheetJS output.
- **Idempotent merge:** For each imported row, if a matching record already exists in IndexedDB (same `id + dateTime` key), the file row is ignored; otherwise, the new record is appended to the table.
- **No destructive writes:** Imports never overwrite or delete existing entries—they only add missing rows.
- **Verification:** After importing, spot-check that only previously absent records appeared in the table and that existing rows remain unchanged.
