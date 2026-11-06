import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { cloud } from '../lib/cloud/auth';
import { startBridge } from '../lib/bridge/connect';

export type BackgroundMessage = { type: 'test-cloud' };
export type CloudTestResult = { ok: true; previous: string | null; now: string } | { ok: false; error: string };

// Writes a timestamp and reads back the previous one, so you can see a write from another computer.
async function testCloud(): Promise<CloudTestResult> {
  try {
    const client = cloud();
    const previous = await client.get('meta/connection');
    const now = new Date().toISOString();
    await client.set('meta/connection', { lastCheck: now });
    return { ok: true, previous: typeof previous?.lastCheck === 'string' ? previous.lastCheck : null, now };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: BackgroundMessage) => {
    if (message?.type === 'test-cloud') return testCloud();
    return undefined;
  });
  // Vite replaces MODE at build time, so store builds drop the bridge code entirely.
  if (import.meta.env.MODE === 'bridge') startBridge();
});
