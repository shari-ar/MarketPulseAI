# Model Assets

- `manifest.json` declares the active model tag and keeps the latest two tagged versions for rollback.
- Each `swing-tcn-<yyyy-mm-dd>-vN/` directory bundles TensorFlow.js metadata, scalers, calibration data, and weights.
- `model.json` stores the architecture descriptor, while `scalers.json`, `weights.json`, and `calibration.json` supply runtime assets.
