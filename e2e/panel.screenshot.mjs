// Screenshots of the categories panel on the mock LCR, which has only made-up data.
// Needs `npm run build:bridge` first.   node e2e/panel.screenshot.mjs <output folder>
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT = resolve(process.argv[2] ?? 'e2e/screenshots');
const EXTENSION = resolve('.output/chrome-mv3-bridge');
const PROFILE = resolve('e2e/.profile-panel');
mkdirSync(OUT, { recursive: true });

const mock = spawn(process.execPath, ['tools/mock-lcr.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ready) => mock.stdout.once('data', ready));
rmSync(PROFILE, { recursive: true, force: true });
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});

try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8766/ministering-proposed-assignments?lang=eng&type=EQ');
  await page.locator('#ministering-buddy-panel .toggle').click();
  // Chrome sign-in can't complete headless, so this shows LCR's data with saved categories still loading.
  await page.locator('#ministering-buddy-panel summary').first().waitFor();
  for (const tab of ['Brothers', 'Households', 'Companionships']) {
    await page.locator('#ministering-buddy-panel nav button', { hasText: tab }).click();
    await page.screenshot({ path: join(OUT, `panel-${tab.toLowerCase()}.png`) });
  }
  console.log(`status: ${await page.locator('#ministering-buddy-panel .status').textContent()}`);
  console.log(`screenshots in ${OUT}`);
} finally {
  await browser.close();
  mock.kill();
  rmSync(PROFILE, { recursive: true, force: true });
}
