import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { choiceId, type Choice, type Kind } from '../lib/categories';
import { cloud } from '../lib/cloud/auth';
import { startBridge } from '../lib/bridge/connect';

export type BackgroundMessage =
  | { type: 'test-cloud' }
  | { type: 'list-choices' }
  | { type: 'set-choice'; kind: Kind; personUuid: string; category: string | null };

export type CloudTestResult = { ok: true; previous: string | null; now: string } | { ok: false; error: string };
export type ChoicesResult = { ok: true; choices: Choice[] } | { ok: false; error: string };
export type SetChoiceResult = { ok: true } | { ok: false; error: string };

const CHOICES = 'categories';

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' };
}

// Writes a timestamp and reads back the previous one, so you can see a write from another computer.
async function testCloud(): Promise<CloudTestResult> {
  try {
    const client = cloud();
    const previous = await client.get('meta/connection');
    const now = new Date().toISOString();
    await client.set('meta/connection', { lastCheck: now });
    return { ok: true, previous: typeof previous?.lastCheck === 'string' ? previous.lastCheck : null, now };
  } catch (error) {
    return failure(error);
  }
}

async function listChoices(): Promise<ChoicesResult> {
  try {
    const documents = await cloud().list(CHOICES);
    const choices = documents.map(({ data }) => data as unknown as Choice).filter((choice) => choice.personUuid && choice.kind);
    return { ok: true, choices };
  } catch (error) {
    return failure(error);
  }
}

async function setChoice(kind: Kind, personUuid: string, category: string | null): Promise<SetChoiceResult> {
  try {
    const path = `${CHOICES}/${choiceId(kind, personUuid)}`;
    if (category) await cloud().set(path, { kind, personUuid, category, since: new Date().toISOString() });
    else await cloud().delete(path);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: BackgroundMessage) => {
    switch (message?.type) {
      case 'test-cloud':
        return testCloud();
      case 'list-choices':
        return listChoices();
      case 'set-choice':
        return setChoice(message.kind, message.personUuid, message.category);
      default:
        return undefined;
    }
  });
  // Vite replaces MODE at build time, so store builds drop the bridge code entirely.
  if (import.meta.env.MODE === 'bridge') startBridge();
});
