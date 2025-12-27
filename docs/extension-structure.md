# Extension Structure

```
extension/
├── background/         # Navigation, parsing, scheduling, and gating logic
│   ├── navigation/     # Shared travel helpers for symbol pages
│   │   ├── crawler.js  # Sequential crawler + retry coordination
│   │   ├── helpers.js  # Tab navigation utilities + parser runner
│   │   ├── README.md   # Navigation module overview
│   │   └── symbols.js  # Extracts symbol ids from TSETMC listings
│   ├── parsing/        # DOM extraction utilities
│   │   ├── README.md   # Parsing module overview
│   │   └── top-box.js  # Parses top-box metrics into snapshot payloads
│   ├── logger.js       # IndexedDB-backed logging helpers
│   ├── scheduling.js   # Collection/analysis gating rules
│   ├── settings.js     # Runtime settings hydration from storage
│   ├── time.js         # Market-time scheduling utilities
│   └── navigator.js    # Drives page movement and crawl orchestration
├── analysis/           # Worker, TensorFlow.js assets, scalers, calibration metadata
│   ├── models/         # Bundled model JSON/weights versions (swing-tcn-<date>-vN)
│   │   ├── README.md
│   │   ├── manifest.json
│   │   ├── swing-tcn-2023-12-01-v1/ # Versioned TF.js metadata, scalers, calibration, weights
│   │   └── swing-tcn-2024-01-01-v1/ # Versioned TF.js metadata, scalers, calibration, weights
│   ├── feature-engineering.js # Feature extraction + z-score normalization helpers
│   ├── logger.js        # Analysis-specific structured logging
│   ├── model-runtime.js # TF.js loading + weight-based fallback scoring
│   ├── rank.js          # Ranking helper with probability + percent tie-break
│   ├── runner.js        # Worker orchestration with fallback to in-process scoring
│   └── index.js         # Worker entry for scoring and progress reporting
├── popup/              # Popup UI scripts, styles, and markup
│   ├── popup.html      # Popup markup registered by the manifest
│   ├── popup.js        # Rankings, exports, imports, and controls
│   ├── popup.css       # Popup styling and modal layout
│   ├── logger.js       # Popup log persistence helpers
│   ├── settings.js     # Settings persistence + popup hydration helpers
│   └── xlsx-loader.js  # SheetJS loader for exports/imports
├── storage/            # Dexie schema, cache, validation, and writes
│   ├── adapter.js      # IndexedDB/Dexie adapter with in-memory fallback
│   ├── logger.js       # Storage logging helpers
│   ├── retention.js    # Snapshot + log retention utilities
│   └── schema.js       # Snapshot/log schemas and validation
├── vendor/             # Third-party bundles (e.g., TensorFlow.js, SheetJS)
│   └── README.md
├── manifest.json       # Registers background, worker, and popup bundles
├── package.json        # Extension module type declaration
├── runtime-config.js   # Runtime configuration utilities
└── runtime-settings.js # Normalizes/merges runtime config overrides
```

## Key Entry Points

- **`manifest.json`** wires background, worker, and popup bundles for the browser.
- **`background/navigator.js`** coordinates page movement, gating, and parsing.
- **`analysis/index.js`** orchestrates worker-based scoring and progress reporting.
- **`popup/popup.js` & `popup/popup.html`** display rankings and handle exports/imports, keeping the Excel schema aligned in both directions.
