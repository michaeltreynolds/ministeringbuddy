// Development only: removed from store builds by wxt.config.ts.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { runBridgeCommand, type BridgeCommand } from '../lib/bridge/commands';

export default defineContentScript({
  matches: ['https://lcr.churchofjesuschrist.org/*', 'http://127.0.0.1:8766/*'],
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      return runBridgeCommand(message as BridgeCommand).catch(() => ({
        ok: false,
        // Fixed text: an exception message could quote page data.
        error: 'The command failed in the page.',
      }));
    });
  },
});
