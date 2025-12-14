# User Workflow

1. **Install the extension** in a Chromium-based browser with developer mode.
2. **Wait for market close**; the collector activates after 13:00 IRST (UTC+03:30) and shuts down at the 07:00 deadline even if a crawl was still running.
3. **Browse symbol pages**; the extension scrapes each symbol once per 24 hours, refreshing the stalest records first.
4. **Let analysis fire** automatically after a full crawl or precisely at the 07:00 cutoff if scraping is still underway; the popup progress modal reports status without manual requests.
5. **Review ranked results** sorted by `predictedSwingProbability` with `predictedSwingPercent` shown for context; the extension page calls out the top 5 swing symbols explicitly, with that count mirrored in settings.
6. **Export to Excel** for the exact dataset shown in the UI table via a one-click SheetJS download.
