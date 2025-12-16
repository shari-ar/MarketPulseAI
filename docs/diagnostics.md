# Logging & Diagnostics

## Troubleshooting

- **No data after close:** Confirm system time matches IRST offset and that symbol pages are reachable.
- **Analysis stalls:** Check the stored log entries (IndexedDB diagnostics table) for model loading issues or malformed records; clear `analysisCache` if needed.
- **Export mismatch:** Ensure the popup table reflects the latest analysis before downloading Excel.

## Logging Policy

- **Storage-first:** All logs write to the IndexedDB `logs` table, keeping diagnostics durable and reviewable.
- **Per-type retention:** Default expirations are 30 days for `error`, 7 days for `warning`, 3 days for `info`, and 1 day for `debug`, all adjustable in settings.
- **Daily cleanup:** At 13:00 each day, the extension runs a sweep that deletes expired log rows alongside old stock snapshot history.
