# Testing

## Automated Checks

- **Unit tests:** Run `npm test` to execute the project's Jest suite.
- **Linting:** Follow configured ESLint/Prettier rules; run `npm run lint` if available in future scripts.

## Manual Verification

- **IndexedDB state:** After scraping, confirm `topBoxSnapshots` entries populate with correct timestamps.
- **Analysis run:** Trigger TensorFlow.js analysis from the popup and verify the progress modal completes without errors.
- **Excel export:** Generate an export and open the `.xlsx` file to ensure columns match the UI table.
