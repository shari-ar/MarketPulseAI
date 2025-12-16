# Configuration

## Runtime Parameters

- **Market hours:** Default open-to-close window is 09:00–13:00 IRST (UTC+03:30), during which the extension remains fully idle; the close value feeds scheduling checks and both endpoints are editable in settings.
- **Storage names:** Database `marketpulseai` with tables `topBoxSnapshots` and `analysisCache`.
- **Data retention:** Default window keeps the last 7 days of snapshots; users can increase or reduce this in settings.
- **Top-swing list size:** The extension displays the top 5 swing candidates on the popup, and this default count is shown in settings alongside other adjustable values.

All of these values are presented as defaults; users can update them in the extension settings to match their preferred schedule or naming scheme.

## Environment

- **Offline-first:** No external APIs are required; ensure TensorFlow.js and SheetJS bundles ship with the extension.
- **Permissions:** Manifest requests only the scopes needed to navigate symbol pages and store data locally.
