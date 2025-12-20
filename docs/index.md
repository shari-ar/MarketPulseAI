# MarketPulseAI Documentation

Welcome to the reference hub for MarketPulseAI, a privacy-first browser extension that collects and analyzes Iranian stock market data entirely on-device. Use this landing page to understand the product goals, the moving parts behind the extension, and where to dive deeper across the documentation set.

> Default values only: Any numbers or named values mentioned across these docs (times, thresholds, schema names, etc.) ship as the suggested defaults, but every one of them can be overridden through the extension's settings UI.

## Product Foundations

- **Offline by design:** All scraping, storage, TensorFlow.js analysis, and exports/imports run locally—no remote services involved.
- **Blackout-aware collection:** Data gathering resumes only after the 09:00–13:00 IRST blackout to avoid intraday disruption, with no navigation, scraping, storage, or analysis activity while the blackout is active.
- **Repeatable insights:** IndexedDB snapshots feed TensorFlow.js scoring so users can reliably track swings and rankings over time.
- **Exact exports/imports:** SheetJS mirrors the popup table into Excel and ingests the same schema, keeping what you see aligned with what you download or add back.

## Audience & Expectations

This guide is for developers and testers working on the extension codebase. It assumes familiarity with Chromium extension development, IndexedDB/Dexie, and modern JavaScript tooling (Node, npm, Jest, ESLint/Prettier). For a user-facing walkthrough, start with **User Workflow** below.

## Core Workflows at a Glance

| Workflow              | Purpose                                                                                 | Where to start                                          |
| --------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Daily data collection | Scrape each symbol once per blackout cycle.                                             | [Data Collection](data-collection.md)                   |
| Swing forecasting     | Build and run seven-day TCN-based swing predictions for ranking.                        | [Swing Forecasting](forecasting.md)                     |
| Local analysis        | Run TensorFlow.js scoring and ranking in a dedicated worker with UI progress.           | [Analysis](analysis.md) & [Diagnostics](diagnostics.md) |
| Export/Import Excel   | Round-trip `.xlsx` files that mirror the popup table; imports add only missing records. | [Exports & Imports](exports.md)                         |
| Developer setup       | Install dependencies, run the extension locally, and validate changes.                  | [Developer Setup](dev-setup.md) & [Testing](testing.md) |

## Architecture Overview

- **Surfaces:** Background scripts orchestrate scraping and scheduling; the popup renders ranked insights and triggers exports/imports.
- **Data pipeline:** Navigation helpers load symbol pages, parsers normalize top-box fields, and Dexie schemas persist snapshots with composite keys for quick lookups.
- **Analysis layer:** TensorFlow.js runs inside a worker to keep the UI responsive while scoring and ranking symbols.
- **Storage, exports, and imports:** IndexedDB holds historical snapshots and analysis cache; SheetJS transforms the current table into Excel and reads the same schema back without server calls.

For a deeper breakdown of runtime boundaries and sequence, see [Architecture](architecture.md).

## Scheduling & Safeguards

- **Time gating:** Scraping begins once the 09:00–13:00 IRST blackout ends to avoid partial intraday data, and all extension tasks are paused while the blackout is active.
- **Tab-aware activation:** The background worker only runs while a tab is on `https://tsetmc.com/*` (or subdomains); closing, navigating away, or switching tabs shuts the run down until the next visit.
- **Validation:** DOM inputs are sanitized before persistence to prevent malformed records in IndexedDB.
- **Responsive UI:** Analysis progress is surfaced through a modal while workers handle heavy TensorFlow.js tasks.

More detail lives in [Scheduling](scheduling.md) and [Diagnostics](diagnostics.md).

## Repository Map

- **Extension structure:** File layout and build artifacts are outlined in [Extension Structure](extension-structure.md).
- **Configuration:** Environment and runtime toggles are documented in [Configuration](configuration.md).
- **Storage:** IndexedDB schema, table keys, and migrations are covered in [Storage](storage.md).
- **Roadmap:** Planned milestones and future enhancements live in [Roadmap](roadmap.md).
- **Tooling plan:** Full-stack tool choices and quality gates live in [Full-Stack Tool Plan](tooling-plan.md).

## Contributing & Verification

- **Set up locally:** Follow [Developer Setup](dev-setup.md) to install dependencies and run the extension in a Chromium browser.
- **Run checks:** Use [Testing](testing.md) for guidance on Jest tests, linting expectations, and manual verification steps.
- **Validate outputs:** After scraping, confirm `topBoxSnapshots` entries exist in IndexedDB; after analysis, ensure the progress modal completes without errors; after export, open the `.xlsx` to verify column fidelity; after import, confirm only previously missing rows were added.

Use this page as your anchor for navigating the documentation and aligning implementation choices with MarketPulseAI's privacy-first, on-device principles.
