# Ministering Buddy

A Chrome extension to make ministering changes easier for an elders quorum presidency.
It works alongside Leader and Clerk Resources (LCR) and is not affiliated with or endorsed by
The Church of Jesus Christ of Latter-day Saints.

**Status:** on LCR's EQ Proposed Assignments page, a **Categories** button opens a panel that groups every
brother, household and companionship by category, with "Needs a decision" first. Small icons set a category;
choices are saved to Firestore. The extension never writes to LCR. Not yet built: snapshots, and inferring
"Bishop" from callings.

## Design

- **Compute from LCR.** Anything LCR already knows (callings, assignments, move-ins) is read live, not stored.
- **Store only what LCR can't know:** the presidency's category choices, from a fixed list with no free text.
- **Saved in Firestore** in the church-mt project, reached with the Google account Chrome is signed in to.
- **Read-only first.** Writing to the Proposed Assignments sandbox comes later. Publishing stays a manual click in LCR.

The June 2025 prototype is in the git history, and its requirements are in
[docs/reference/original-prompt-2025.txt](docs/reference/original-prompt-2025.txt) (those names are made up).

## Commands

| Command | Does |
| --- | --- |
| `npm test` | Unit tests, including the sanitizer's adversarial cases |
| `npm run test:mutation` | Breaks the sanitizer 20 ways and requires the tests to catch each one |
| `npm run build:bridge`, then `npm run test:e2e` | Real Chromium, real extension, mock LCR. Needs `npx playwright install chromium` once |
| `npm run build`, then `npm run check:store` | Builds the store package and fails if any trace of the bridge shipped |
| `node e2e/panel.screenshot.mjs <folder>` | Screenshots of the panel on the mock LCR, after `npm run build:bridge` |
| `node tools/mock-lcr.mjs` | Fake LCR at `http://127.0.0.1:8766/ministering-proposed-assignments` |

## Using the bridge on real LCR

The bridge lets a coding assistant see what the extension sees, without member data reaching it.

1. Run `npm install`, then `npm run build:bridge`.
2. In `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `.output/chrome-mv3-bridge`.
3. Run `node tools/bridge-server.mjs` and leave it running.
4. Sign in to LCR and open the unassigned ministering page.
5. In a second terminal: `node tools/bridge.mjs status`, then `dom`, `network`, or `fetch /some/path`.

Remove the bridge build from Chrome when you're done with it.

## How the sanitizer protects member data

Everything runs in the browser, before anything leaves it.

1. **Allowlist, failing closed.** Only known labels, field names and enum values pass. Other text becomes a
   marker like `[string#3, 14 chars]`, and names become `Person_17`. The real-to-fake mapping never leaves the page.
2. **Leak scan.** The finished output is checked for every redacted value, plus patterns for emails, phones,
   membership numbers, addresses and long tokens. A hit blocks the whole result and reports only counts.

The bridge is read-only by construction: it can only send same-origin GET requests, and it has no command
that writes. It uses the browser's signed-in session and never handles auth tokens. It never takes screenshots
of real pages, because those can't be sanitized reliably. Screenshots are for the mock only.

**Field names in discovery mode.** To learn an unknown structure, `fetch` and `embedded` show field names that
look like words (no IDs). A name found in three or more objects counts as schema; others are shown only if none
of their words appear in the data. Names shown on the page are never shown as field names. The remaining risk is
a field name that is a person's name and repeats in several objects, which is unlikely in real data.

## Cloud storage

Data is saved in Firestore in the church-mt project. The extension asks Chrome for a Google token for the
signed-in profile (the `identity` permission and the `oauth2` manifest section), then calls Firestore's REST
API. Access is controlled by IAM on church-mt, so only accounts with a role there can read or write.
There's no API key and no Firebase web app.

The extension ID is fixed at `kdodgbabpmjhbbehpmcnhfkeeiceaiec` by the public `key` in the manifest, so the
OAuth client works on every computer. The OAuth client ID goes in `src/config.ts`.
