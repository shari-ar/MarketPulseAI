# Configuration

## Runtime Parameters

- **Market hours:** Default open-to-close window is 09:00–13:00 IRST (UTC+03:30) on Saturday–Wednesday, during which the extension stays in read-only mode; scheduling relies on the 13:00 close to start work until the 07:00 pre-open buffer and keeps the Wednesday window open until 07:00 on Saturday. Both endpoints remain editable in settings.
- **Storage names:** Database `marketpulseai` with tables `topBoxSnapshots` and `analysisCache`.
- **Data retention:** Default window keeps the last 7 days of snapshots; users can increase or reduce this in settings.
- **Log retention:** Logs are stored in IndexedDB with per-type retention windows exposed in settings—e.g., defaults of 30 days for errors, 7 days for warnings, and 3 days for informational entries. Each type can be tuned independently to match team audit needs.
- **Top-swing list size:** The extension displays the top 5 swing candidates on the popup, and this default count is shown in settings alongside other adjustable values.

All of these values are presented as defaults; users can update them in the extension settings to match their preferred schedule or naming scheme.

## Environment

- **Offline-first:** No external APIs are required; ensure TensorFlow.js and SheetJS bundles ship with the extension.
- **Permissions:** Manifest requests only the scopes needed to navigate symbol pages and store data locally.
