# Development Setup

## Prerequisites

- Node.js 18+ and npm.
- Chromium-based browser for loading the unpacked extension.

## Installation

1. Run `npm install` in the repository root.
2. Build or bundle extension assets as needed (extension sources are already consumable during development).

## Loading the Extension

1. Open browser extensions page and enable **Developer Mode**.
2. Click **Load unpacked** and select the `extension/` directory.
3. Confirm background scripts and popup load without console errors.

## Local Development Tips

- Observe automatic analysis after a full crawl or at 07:00 even if crawling is incomplete.
- Keep DevTools open to monitor network requests (should remain idle) and IndexedDB writes.
