# Extension Structure

```
extension/
├── analysis/           # TensorFlow.js workers, ranking, progress modal
├── navigation/         # Browser navigation helpers
├── parsing/            # DOM extraction utilities
├── storage/            # Dexie schema, cache, validation, and writes
├── vendor/             # Third-party bundles (e.g., TensorFlow.js)
├── popup.*             # Popup UI scripts and styles
├── manifest.json       # Extension manifest and permissions
└── runtime-config.js   # Runtime configuration utilities
```

## Key Entry Points

- **`manifest.json`** wires background and popup scripts for the browser.
- **`navigator.js`** coordinates page movement and triggers parsing.
- **`analysis/index.js`** orchestrates worker-based scoring and progress reporting.
- **`popup.js` & `popup.html`** display rankings, trigger analysis, and handle exports.
