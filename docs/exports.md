# Exports

## Excel Generation

- **Manual trigger only:** Analysis runs automatically, but exports are created only when the user explicitly invokes them.
- **SheetJS pipeline via popup:** The export popup is the surface that invokes SheetJS to convert the current table view into an `.xlsx` file without server calls.
- **Column parity:** Exported columns mirror the on-screen table—including both `predictedSwingPercent` and `predictedSwingProbability`—so offline reviewers see identical data.
- **Freshness guarantee:** The exported file always reflects the latest analyzed table shown to the user.
- **File naming:** Exports are timestamped to reflect when the analysis was generated.
- **QA checklist:** Open the generated `.xlsx` and confirm that all analysis columns (`predictedSwingPercent`, `predictedSwingProbability`) match the corresponding database records.
