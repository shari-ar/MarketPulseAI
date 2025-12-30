# Full-Stack Tool Plan

This plan outlines the end-to-end tooling and platform choices that keep MarketPulseAI fast, secure, and locally reliable while remaining easy to extend.

## Objectives

- **Zero-backend discipline:** Keep all scraping, analysis, and exports running locally under Manifest V3 constraints.
- **Deterministic builds:** Single-command, reproducible outputs for CI and local usage.
- **Trustworthy insights:** Strong linting, tests, and diagnostics to keep TensorFlow.js scoring and IndexedDB writes consistent.

## Stack Blueprint

| Layer                | Tooling & Rationale                                                                                                                                       | Default Commands                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Extension shell      | Chromium MV3 background + service workers with a vanilla JS popup; runtime config toggles CDN-loaded TensorFlow.js.                                       | `npm run build`                 |
| Bundling & packaging | Copy-based build via `scripts/build-extension.js` today; fold in esbuild bundling/minification next to shrink payloads while keeping the manifest intact. | `npm run build` (packaging)     |
| Data & storage       | Dexie over IndexedDB with composite keys for symbol/time lookups; runtime config keeps dev/prod DBs isolated.                                             | N/A                             |
| Analysis             | TensorFlow.js worker to keep the popup responsive during scoring with shape validation before running inference.                                          | N/A                             |
| Exports              | SheetJS (xlsx) mirroring the popup table for fidelity in Excel output.                                                                                    | N/A                             |
| Quality gates        | ESLint + Prettier + Node test runner on Node 18/20; Husky + lint-staged guard staged files before commits.                                                | `npm run lint` / `npm run test` |
| Release packaging    | `scripts/build-extension.js` writes runtime config and emits MV3-ready dist for Chrome Web Store upload.                                                  | `npm run build`                 |

## Local Development

- **Environment:** Node 18+ with npm; Chromium-based browser for loading `extension/` as unpacked.
- **Iteration loop:**
  1. `npm install`
  2. `npm run lint:test:build` to validate code + artifacts.
  3. Load unpacked extension and verify IndexedDB log writes via the in-app log viewer for direct visibility.
- **Data realism:** Use real pages from outside the 09:00–13:00 blackout when possible; fall back to saved HTML fixtures to validate parsers offline.

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
  - Background logs are structured, written to IndexedDB, and pruned at the 13:00 daily kickoff according to per-type retention windows configured in settings.
  - IndexedDB sanity check: verify `stocks` writes per symbol per session before analysis runs.

## Observability for Analysis

- **Performance budgets:** Track worker execution time per batch; fail builds if regression crosses threshold (e.g., +15% over baseline).
- **TensorFlow.js guardrails:** Validate model input shapes before scoring; log misaligned tensors with symbol context only.

## Release Readiness

- **Packaging:** Ensure `scripts/build-extension.js` emits clean `dist/` with hashed assets and MV3 manifest validation.
- **Manual QA checklist:**
  - Load/unload extension with clean startup diagnostics.
  - Complete a full crawl after the blackout and confirm analysis modal resolves.
  - Export `.xlsx` and verify column order matches popup table.
- **Store submission:** Run Chrome Web Store MV3 validation; attach built artifact from CI for traceability.
