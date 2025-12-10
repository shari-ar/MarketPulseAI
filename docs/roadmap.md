# MarketPulseAI Roadmap

Short, shippable steps grouped by category. Each task should land with visible results and keep the extension smooth.

## Setup & Tooling

| Step | Task                                                                         | Outcome                                   |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | Add npm scripts for lint, test, and build (`npm run lint:test:build` bundle) | One-command quality gate in CI & locally. |
| 2    | Wire basic CI (lint + unit tests) on push                                    | Automatic red/green signal per commit.    |
| 3    | Create `.env.example` with required keys and defaults                        | Clear onboarding and fewer config errors. |
| 4    | Add pre-commit formatting with Prettier/ESLint                               | Consistent code style at every save.      |

## Data Collection & Storage

| Step | Task                                                               | Outcome                                                   |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| 1    | Stub IndexedDB schema in Dexie (single version)                    | Stable shape for OHLC records without migration overhead. |
| 2    | Implement "wait until 13:00" guard with a visible banner           | Extension shows locked state before market close.         |
| 3    | Build oldest-first ticker selector using Dexie queries             | Deterministic crawl order and reproducible runs.          |
| 4    | Implement tab navigator that visits symbol pages sequentially      | Guaranteed per-symbol capture without UI freezes.         |
| 5    | Add write validation (open/high/low/close/timestamp) before saving | Clean, trusted records only.                              |
| 6    | Log collection progress to console + in-page toast                 | Dev insight and user-visible feedback per batch.          |

## Analysis & Modeling

| Step | Task                                                         | Outcome                                          |
| ---- | ------------------------------------------------------------ | ------------------------------------------------ |
| 1    | Normalize OHLC arrays utility with unit tests                | Safe, repeatable model inputs.                   |
| 2    | Load TensorFlow.js model lazily on analysis start            | Faster idle load and responsive UI.              |
| 3    | Add modal progress bar tied to actual inference batches      | Users see real-time completion to 100%.          |
| 4    | Rank results by swing probability with deterministic sorting | Predictable, debuggable ordering.                |
| 5    | Cache latest analysis timestamp per symbol                   | Prevents re-running on fresh data unnecessarily. |

## UI & UX

| Step | Task                                                | Outcome                                      |
| ---- | --------------------------------------------------- | -------------------------------------------- | ----- | ---------------------------------------- |
| 1    | Add global status badge (Idle/Collecting/Analyzing) | Clear state at a glance.                     |
| 2    | Create compact table view for results (Symbol       | Probability                                  | Date) | Readable outputs matching export schema. |
| 3    | Add retry/skip buttons in modal for failed tickers  | Smooth recovery without reloading extension. |
| 4    | Implement light/dark theming toggle                 | Better accessibility and comfort.            |
| 5    | Add keyboard shortcuts for opening modal/export     | Faster power-user workflow.                  |

## Export & Reporting

| Step | Task                                                    | Outcome                                 |
| ---- | ------------------------------------------------------- | --------------------------------------- |
| 1    | Map on-screen table columns to SheetJS export           | Perfect parity between UI and Excel.    |
| 2    | Include analysis metadata row (run date, model version) | Self-describing exports for audits.     |
| 3    | Add download success/failure toast                      | User knows export status instantly.     |
| 4    | Validate exported rows count matches on-screen rows     | Trustworthy exports with sanity checks. |

## Quality, Performance & Observability

| Step | Task                                                             | Outcome                                      |
| ---- | ---------------------------------------------------------------- | -------------------------------------------- |
| 1    | Add unit tests for Dexie queries and validators                  | Regression coverage for data flow.           |
| 2    | Profile TensorFlow.js inference with sample dataset              | Baseline latency numbers to improve later.   |
| 3    | Add lightweight logging abstraction (console + optional storage) | Consistent, toggleable logs for debugging.   |
| 4    | Implement feature-flag toggles for analysis and export           | Safe rollout of risky changes.               |
| 5    | Add error boundary UI around modal                               | Graceful failures without breaking the page. |

## Release & Distribution

| Step | Task                                                     | Outcome                                |
| ---- | -------------------------------------------------------- | -------------------------------------- |
| 1    | Bundle extension with versioned changelog in `dist/`     | Releasable artifact every iteration.   |
| 2    | Add manual smoke checklist for post-build verification   | Repeatable QA before publishing.       |
| 3    | Prepare Chrome Web Store draft listing assets            | Ready-to-submit store entry.           |
| 4    | Set semantic versioning rule (e.g., `major.minor.patch`) | Predictable release cadence and diffs. |
