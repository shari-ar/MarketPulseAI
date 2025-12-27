# Extension Structure

```
extension/
├── background/         # Navigation, parsing, scheduling, and gating logic
│   ├── navigation/     # Shared travel helpers for symbol pages
│   ├── parsing/        # DOM extraction utilities
│   ├── settings.js     # Runtime settings hydration from storage
│   └── navigator.js    # Drives page movement and crawl orchestration
├── analysis/           # Worker, TensorFlow.js assets, scalers, calibration metadata
│   ├── models/         # Bundled model JSON/weights versions (swing-tcn-<date>-vN)
│   │   ├── manifest.json
│   │   └── swing-tcn-2024-01-01-v1/ # Versioned TF.js metadata, scalers, calibration, weights
│   ├── feature-engineering.js # Feature extraction + z-score normalization helpers
│   └── index.js        # Worker entry for scoring and progress reporting
├── popup/              # Popup UI scripts, styles, and markup
│   ├── popup.html      # Popup markup registered by the manifest
│   ├── popup.js        # Rankings, exports, imports, and controls
│   └── settings.js     # Settings persistence + popup hydration helpers
├── storage/            # Dexie schema, cache, validation, and writes
├── vendor/             # Third-party bundles (e.g., TensorFlow.js, SheetJS)
├── manifest.json       # Registers background, worker, and popup bundles
└── runtime-config.js   # Runtime configuration utilities
└── runtime-settings.js # Normalizes/merges runtime config overrides
```

## Key Entry Points

- **`manifest.json`** wires background, worker, and popup bundles for the browser.
- **`background/navigator.js`** coordinates page movement, gating, and parsing.
- **`analysis/index.js`** orchestrates worker-based scoring and progress reporting.
- **`popup/popup.js` & `popup/popup.html`** display rankings and handle exports/imports, keeping the Excel schema aligned in both directions.
