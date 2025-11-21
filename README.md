# MarketPulseAI

MarketPulseAI is a browser extension that automatically gathers daily OHLC data after market close and runs on-device volatility analysis using TensorFlow.js. Dexie.js manages IndexedDB persistence while SheetJS powers one-click Excel exports, letting you review historical forecasts offline.

## Core Behaviors
- **Post-close collection**: Workflow only starts once the market closes (13:00). If tabs are open earlier, the extension stays read-only until the session ends.
- **Oldest-first refresh**: Locates symbols with the stalest daily records in IndexedDB, then visits each symbol page (sequentially or in parallel) to capture fresh OHLC entries.
- **Complete cycle**: Continues visiting symbols until every ticker has a new daily record stored locally.
- **Strict data storage**: No writes occur before 13:00; all captured OHLC values are persisted in IndexedDB via Dexie.js.

## Analysis Mode
- **User-triggered modal**: When analysis is activated, a modal appears showing real-time progress that reaches 100% when calculations finish.
- **Seven-day window**: For each symbol, the built-in AI model uses the past 7 trading days of OHLC data to estimate the probability of an intraday swing greater than 3%.
- **Local-only computation**: All math runs on-device with TensorFlow.js, using only previously stored IndexedDB data—no external calls.
- **Results view**: Outputs a table sorted by descending swing probability, with symbol, probability, and analysis date.
- **Excel export**: Users can export the same dataset to a structured Excel file via SheetJS for downstream analysis.

## Data Flow
1. **Wait for close** → Detect 13:00 cutoff and block writes until then.
2. **Select symbols** → Query IndexedDB for oldest records per symbol.
3. **Navigate & fetch** → Visit symbol pages and scrape daily OHLC values.
4. **Persist** → Store entries in IndexedDB using Dexie.js schema.
5. **Analyze** → On demand, load 7-day windows into TensorFlow.js, run probability model, update modal progress.
6. **Report** → Render sorted results table and offer Excel export of the dataset.

## Tech Stack
- **Dexie.js** for IndexedDB schemas, migrations, and efficient queries.
- **TensorFlow.js** for on-device probability estimation of >3% intraday swings.
- **SheetJS** for generating Excel exports matching on-screen results.

## UI Notes
- Modal progress must clearly reflect computation status, reaching 100% upon completion.
- Collection and analysis must handle symbols sequentially or in parallel without blocking the UI thread.
- All features operate from stored data; the extension stays functional offline once records exist.

## Development Tips
- Model inputs: normalize 7-day OHLC arrays before feeding TensorFlow.js.
- Data validation: ensure each daily record contains open, high, low, close, and timestamp fields before writes.
- Export fidelity: align Excel column ordering with the on-screen table (Symbol | Probability >3% | Analysis Date).
- Testing: mock market-close gating and IndexedDB states to verify no writes occur before 13:00.

## Future Enhancements
- Add configurable market close time for different exchanges.
- Provide per-symbol collection status badges during the refresh cycle.
- Offer offline-friendly cached exports with versioned filenames.
