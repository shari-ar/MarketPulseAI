# Logging & Diagnostics

## Observability

- **Console logs:** Background scripts and the popup surface status messages for navigation, parsing, and analysis progress.
- **IndexedDB inspection:** Use browser DevTools to inspect `marketpulseai` and validate snapshot contents.

## Troubleshooting

- **No data after close:** Confirm system time matches IRST offset and that symbol pages are reachable.
- **Analysis stalls:** Check worker logs for model loading issues or malformed records; clear `analysisCache` if needed.
- **Export mismatch:** Ensure the popup table reflects the latest analysis before downloading Excel.
