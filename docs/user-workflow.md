# User Workflow

1. **Install the extension** in a Chromium-based browser with developer mode.
2. **Wait for market close**; the collector activates after 13:00 IRST (UTC+03:30) to fetch fresh daily data.
3. **Browse symbol pages**; the extension scrapes top-box fields quietly and refreshes records with the oldest timestamps.
4. **Let analysis fire** automatically after a full crawl or at 07:00 if scraping is still underway; the popup progress modal
   reports status without manual requests.
5. **Review ranked results** sorted by computed swing probabilities and supporting metrics.
6. **Export to Excel** for the exact dataset shown in the UI table via a one-click SheetJS download.
