# Logging & Diagnostics

## Troubleshooting

- **No data after close:** Confirm system time matches IRST offset and that symbol pages are reachable.
- **Analysis stalls:** Check worker logs for model loading issues or malformed records; clear `analysisCache` if needed.
- **Export mismatch:** Ensure the popup table reflects the latest analysis before downloading Excel.
