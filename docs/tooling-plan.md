# Full-Stack Tool Plan

This plan outlines the end-to-end tooling and platform choices that keep MarketPulseAI fast, secure, and locally reliable while remaining easy to extend.

## Objectives

- **Zero-backend discipline:** Keep all scraping, analysis, and exports running locally under Manifest V3 constraints.
- **Deterministic builds:** Single-command, reproducible outputs for CI and local usage.
- **Trustworthy insights:** Strong linting, tests, and diagnostics to keep TensorFlow.js scoring and IndexedDB writes consistent.

## Stack Blueprint

| Layer                   | Tooling & Rationale                                                           | Default Commands                |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| Extension shell         | Chromium MV3 background + service workers; popup built with vanilla JS/DOM.   | `npm run build`                 |
| Bundling & minification | esbuild (2024) bundles, tree-shakes, and minifies MV3 assets with sourcemaps. | `npm run build`                 |
| Data & storage          | Dexie over IndexedDB with composite keys for symbol/time lookups.             | N/A                             |
| Analysis                | TensorFlow.js worker to keep the popup responsive during scoring.             | N/A                             |
| Exports                 | SheetJS (xlsx) mirroring the popup table for fidelity in Excel output.        | N/A                             |
| Quality gates           | ESLint + Prettier + Node test runner (stable on Node 18+).                    | `npm run lint` / `npm run test` |
| Release packaging       | `scripts/build-extension.js` to assemble MV3 artifacts for upload.            | `npm run build`                 |

## Local Development

- **Environment:** Node 18+ with npm; Chromium-based browser for loading `extension/` as unpacked.
- **Iteration loop:**
  1. `npm install`
  2. `npm run lint:test:build` to validate code + artifacts.
  3. Load unpacked extension and verify IndexedDB log writes via the in-app log viewer (no console logging).
- **Data realism:** Use real post-close pages when possible; fall back to saved HTML fixtures to validate parsers offline.

## Automation & CI

- **Git hooks:** Husky + lint-staged to enforce Prettier/ESLint on staged files before commits.
- **CI pipeline (recommended GitHub Actions):**
  - `npm ci` with Node 20 LTS matrix.
  - `npm run lint:test:build` with cache keyed on `package-lock.json`.
  - Artifact upload of the built `extension/` bundle for manual QA.
- **Static checks:** ESLint rules stay strict; consider adding `eslint-plugin-security` for DOM parsing guardrails.

## Quality & Diagnostics

- **Test strategy:**
  - Node test runner for parsers, schedulers, and worker orchestration.
  - Snapshot-based tests for popup table rendering to protect export fidelity.
- **Runtime diagnostics:**
  - Background logs are structured, written to IndexedDB (never the console), and pruned at the 13:00 daily kickoff according to per-type retention windows configured in settings.
  - IndexedDB sanity check: verify `topBoxSnapshots` writes per symbol per session before analysis runs.

## Observability for Analysis

- **Performance budgets:** Track worker execution time per batch; fail builds if regression crosses threshold (e.g., +15% over baseline).
- **TensorFlow.js guardrails:** Validate model input shapes before scoring; log misaligned tensors with symbol context only.

## Release Readiness

- **Packaging:** Ensure `scripts/build-extension.js` emits clean `dist/` with hashed assets and MV3 manifest validation.
- **Manual QA checklist:**
  - Load/unload extension without console errors.
  - Complete a full crawl post-close and confirm analysis modal resolves.
  - Export `.xlsx` and verify column order matches popup table.
- **Store submission:** Run Chrome Web Store MV3 validation; attach built artifact from CI for traceability.
