// End to end: real Chromium, real extension, mock LCR. Checks that what reaches the command line is
// sanitized and that the bridge never writes. Needs `npm run build:bridge` and `npx playwright install chromium`.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const EXTENSION = resolve('.output/chrome-mv3-bridge');
const PROFILE = resolve('e2e/.profile');
const SECRETS = /Jones|Bob|Keller|Barnaby|Gerber|Allison|Frankworth|Bert|Ernie|555-01|example\.com|Maple|3141592653|2718281828|12345/i;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function start(script) {
  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((ready) => child.stdout.once('data', () => ready(child)));
}

function bridge(...args) {
  return execFileSync(process.execPath, ['tools/bridge.mjs', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function bridgeWhenConnected(...args) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return bridge(...args);
    } catch {
      await sleep(500);
    }
  }
  return bridge(...args);
}

const children = [await start('tools/bridge-server.mjs'), await start('tools/mock-lcr.mjs')];
rmSync(PROFILE, { recursive: true, force: true });
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});

let failed = false;
const check = async (name, run) => {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
};

try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8766/ministering-proposed-assignments?type=EQ&tab=unassigned');
  assert.ok(SECRETS.test(await page.content()), 'the mock page should really contain the fake secrets');

  await check('the store check rejects a build containing the bridge', () => {
    assert.throws(() =>
      execFileSync(process.execPath, ['scripts/check-store-build.mjs', EXTENSION], { stdio: 'pipe' }),
    );
  });

  await check('status reports the page without query values', async () => {
    const output = await bridgeWhenConnected('status');
    assert.match(output, /127\.0\.0\.1\/ministering-proposed-assignments\?type&tab/);
    assert.doesNotMatch(output, /EQ|unassigned/);
  });

  await check('dom hides names and keeps labels', async () => {
    const output = bridge('dom');
    assert.doesNotMatch(output, SECRETS);
    assert.match(output, /Unassigned Ministering Brothers/);
    assert.match(output, /Person_1/);
    assert.match(output, /sc-b78c45da-0/);
  });

  await check('fetch shows the JSON shape and hides its values', async () => {
    const output = bridge('fetch', '/api/ministering/unassigned');
    assert.doesNotMatch(output, SECRETS);
    assert.match(output, /status: 200/);
    assert.match(output, /legacyCmisId/);
    assert.match(output, /districtName/);
  });

  await check('network lists endpoints without IDs or names', async () => {
    const output = bridge('network');
    assert.doesNotMatch(output, SECRETS);
    assert.match(output, /\/api\/ministering\/unassigned\?unitNumber&name/);
  });

  await check('fetch refuses to leave the origin', () => {
    assert.throws(() => bridge('fetch', '//evil.example/x'));
  });

  await check('an unknown command such as a write is refused by the server', () => {
    assert.throws(() => bridge('publish'));
  });

  await check('the bridge sent no writes', async () => {
    const writes = await (await fetch('http://127.0.0.1:8766/__writes')).json();
    assert.deepEqual(writes, []);
  });

  await check('a web page cannot connect to the bridge as the extension', async () => {
    const result = await page.evaluate(
      () =>
        new Promise((done) => {
          const socket = new WebSocket('ws://127.0.0.1:8765');
          socket.onopen = () => done('open');
          socket.onerror = () => done('refused');
        }),
    );
    assert.equal(result, 'refused');
  });

  // Must stay last. An extension loaded with --load-extension does not return after runtime.reload,
  // even a trivial one, so this can only check that the command is acknowledged.
  await check('reload is acknowledged', () => {
    assert.match(bridge('reload'), /reloading/);
  });
} finally {
  await browser.close();
  for (const child of children) child.kill();
  rmSync(PROFILE, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
