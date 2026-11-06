// Adds the categories panel to LCR's EQ Proposed Assignments page. It reads LCR and never writes to it.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { BackgroundMessage, ChoicesResult, SetChoiceResult } from './background';
import { fetchMinisteringData } from '../lib/lcr/ministeringData';
import { mountPanel } from '../lib/panel/panel';

function send<T>(message: BackgroundMessage): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

export default defineContentScript({
  matches: [
    'https://lcr.churchofjesuschrist.org/ministering-proposed-assignments*',
    // The mock LCR, for development builds only.
    ...(import.meta.env.MODE === 'bridge' ? ['http://127.0.0.1:8766/ministering-proposed-assignments*'] : []),
  ],
  main() {
    if (!new URLSearchParams(location.search).get('type')?.startsWith('EQ')) return;
    mountPanel({
      loadData: fetchMinisteringData,
      async loadChoices() {
        const result = await send<ChoicesResult>({ type: 'list-choices' });
        if (!result.ok) throw new Error(result.error);
        return result.choices;
      },
      async saveChoice(kind, personUuid, category) {
        const result = await send<SetChoiceResult>({ type: 'set-choice', kind, personUuid, category });
        if (!result.ok) throw new Error(result.error);
      },
    });
  },
});
