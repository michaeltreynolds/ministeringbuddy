import { browser } from 'wxt/browser';
import type { BackgroundMessage, CloudTestResult } from '../background';

const button = document.querySelector<HTMLButtonElement>('#test-cloud')!;
const status = document.querySelector<HTMLDivElement>('#cloud-status')!;

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Connecting…';
  const result: CloudTestResult = await browser.runtime.sendMessage({ type: 'test-cloud' } satisfies BackgroundMessage);
  status.textContent = result.ok
    ? `Connected. Saved ${when(result.now)}. Previous check: ${result.previous ? when(result.previous) : 'none'}.`
    : `Not connected: ${result.error}`;
  button.disabled = false;
});
