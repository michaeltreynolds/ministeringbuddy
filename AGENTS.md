# Repo instructions for AI agents

This repo is public. Michael works from several machines, so `git pull` before starting, and commit and push
to `main` when a task is finished.

## Member data never reaches you

- See real LCR only through `tools/bridge.mjs`, which is sanitized in the browser. Never use browser-control
  tools or take screenshots on the real `lcr.churchofjesuschrist.org`. Screenshots are for the mock only.
- Never ask for, or put in this repo: real names, member IDs, contact details, raw captures or auth tokens.
  Raw captures belong in the gitignored `private/` folder. Only sanitized output may become a fixture in `tests/fixtures/`.
- If the leak scan blocks a result, tighten the policy. Never weaken the scan to get output through.
- The bridge stays read-only. Don't add commands that write to LCR, and don't let `fetch` use anything but GET.
- The bridge must never ship. `npm run check:store` has to pass.

## Categories

- A fixed list in code, never user-editable, with no free-text field. A category says what the situation is or
  records a person's own request. It never records their circumstances.
- Compute facts from LCR rather than storing them. "Bishop" is inferred from the calling.
n## Cloud

- Data lives in Firestore in church-mt (us-west3), accessed over REST with a Chrome identity token. IAM on the project is the only lock, so never add API keys, a Firebase web app, or other accounts. Michael chose no client-side encryption.

## Before committing

Run `npm run typecheck`, `npm test`, `npm run build` and `npm run check:store`. If you change the sanitizer or the
bridge, also run `npm run test:mutation`, `npm run build:bridge` and `npm run test:e2e`, and add a mutation for each
new privacy rule.

Windows machines: use `;` rather than `&&` in PowerShell 5.1.
