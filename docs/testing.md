# Testing

## Automated Checks

- **Unit tests:** Run `npm test` to execute the project's Jest suite.
- **Linting:** Follow configured ESLint/Prettier rules; run `npm run lint` if available in future scripts.

## Manual Verification

- **IndexedDB state:** After scraping, confirm `topBoxSnapshots` entries populate with correct timestamps.
- **Analysis run:** Confirm analysis auto-starts after a completed crawl or at the 07:00 cutoff when crawling is incomplete, and verify the progress modal completes without errors.
- **Excel export:** Generate an export and open the `.xlsx` file to ensure columns match the db records.
- **Excel import:** Import an export-shaped `.xlsx` file and confirm only missing `[id + dateTime]` rows are inserted; existing records should remain untouched.
