# MarketPulseAI

MarketPulseAI is a privacy-first browser extension for the Iranian Stock Market that quietly collects daily OHLC data after the closing bell and runs local volatility analysis. Everything—scraping, storage, inference, and export—happens on-device so traders can review signals even when offline.

## What It Does
- **Close-aware harvesting:** Waits until market close (13:00 IRST, UTC+03:30) to start gathering fresh daily data from symbol pages.
- **IndexedDB durability:** Persists OHLC history with Dexie.js, refreshing symbols with the stalest records first.
- **On-device forecasts:** Uses TensorFlow.js to calculate swing probabilities from stored history—no external APIs.
- **Actionable outputs:** Presents a sorted results table and enables one-click Excel exports via SheetJS.

## How It Works (High Level)
1. Detect market close and unlock write operations.
2. Identify symbols with the oldest stored records.
3. Navigate to each symbol page, scrape daily OHLC entries, and persist them locally.
4. Run TensorFlow.js analysis on demand, updating a progress modal until completion.
5. Render ranked results and generate an Excel file that mirrors the on-screen data.

## Why It Matters
- **Offline ready:** Analysis and history stay usable without network access once data is cached.
- **Predictable scheduling:** Data collection only runs when the market is closed, protecting intraday browsing.
- **Consistent exports:** Download the exact dataset shown in the UI for downstream review.

## Tech Stack
- **Dexie.js** for IndexedDB schemas and migrations.
- **TensorFlow.js** for local probability modeling.
- **SheetJS** for Excel export parity with the UI table.

## Contributing
1. Install dependencies: `npm install`.
2. Run checks: `npm test`.
3. Submit concise PRs focused on either data collection, analysis, or export flows.

## License
This project is licensed under the MIT License.
