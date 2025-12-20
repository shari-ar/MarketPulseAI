# User Workflow

1. **Install the extension** in a Chromium-based browser with developer mode.
2. **Open a `https://tsetmc.com/*` page** whenever you want the extension to work; entering the site spins up pruning, scraping, and forecasting automatically. Navigating away, switching tabs, or closing the page stops the run immediately and resets for the next visit.
3. **Wait for market close**; the extension stays fully idle during open hours (09:00–13:00 IRST) and only activates after 13:00 IRST (UTC+03:30), shutting down at the 07:00 deadline even if a crawl was still running.
4. **Browse symbol pages**; the extension scrapes each symbol once per 24 hours, refreshing the stalest records first.
5. **Let analysis fire** automatically after a full crawl or precisely at the 07:00 cutoff if scraping is still underway; the popup progress modal reports status without manual requests.
6. **Review ranked results** sorted by `predictedSwingProbability` (desc), breaking ties by `predictedSwingPercent` (desc); the extension page calls out the top 5 swing symbols explicitly, with that count mirrored in settings.
7. **Export or import Excel** from the popup: the Export and Import buttons sit together, using the same schema. Imports append only new `[id + dateTime]` rows and ignore records already in IndexedDB.
