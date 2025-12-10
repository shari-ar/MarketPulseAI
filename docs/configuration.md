# Configuration

## Runtime Parameters

- **Market close time:** Defaulted to 13:00 IRST (UTC+03:30) for scheduling checks.
- **Storage names:** Database `marketpulseai` with tables `topBoxSnapshots` and `analysisCache`.
- **Data retention:** Default window keeps the last 7 days of snapshots; users can increase or reduce this in settings.

All of these values are presented as defaults; users can update them in the extension settings to match their preferred schedule or naming scheme.

## Environment

- **Offline-first:** No external APIs are required; ensure TensorFlow.js and SheetJS bundles ship with the extension.
- **Permissions:** Manifest requests only the scopes needed to navigate symbol pages and store data locally.

## Customization Ideas

- Adjust refresh cadence or symbol selection strategy in navigation scripts.
- Extend snapshot fields if new top-box metrics become relevant.
