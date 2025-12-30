# Exports & Imports

## Excel Generation

- **Manual trigger only:** Analysis runs automatically, but exports are created only when the user explicitly invokes them.
- **SheetJS pipeline via popup:** The export popup is the surface that invokes SheetJS to convert local IndexedDB content into an `.xlsx` file without server calls.
- **Three-table export:** The export workbook includes one worksheet per IndexedDB table, covering all three tables in the database.
- **Exact table fidelity:** Each worksheet reproduces its source table’s full schema and current rows so the Excel file is a faithful, table-by-table snapshot of the database.
- **File naming:** Exports are timestamped to reflect when the file was downloaded.
- **QA checklist:** Open the generated `.xlsx` and confirm each sheet matches its corresponding table schema and contents.

## Imports

- **Same-surface control:** An Import button sits beside the Export button in the popup so users can round-trip Excel without hunting through menus.
- **Schema alignment:** Imports accept the exact `.xlsx` schema produced by exports; column names and order must match the SheetJS output.
- **Idempotent merge:** For each imported row, if a matching record already exists in IndexedDB (same `id + dateTime` key), the file row is ignored; otherwise, the new record is appended to the table.
- **No destructive writes:** Imports never overwrite or delete existing entries—they only add missing rows.
- **Verification:** After importing, spot-check that only previously absent records appeared in the table and that existing rows remain unchanged.
