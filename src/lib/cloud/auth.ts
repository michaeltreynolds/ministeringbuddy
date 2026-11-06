import { browser } from 'wxt/browser';
import { FIRESTORE_DOCUMENTS } from '../../config';
import { FirestoreClient, type TokenProvider } from './firestore';

let lastToken: string | undefined;

/**
 * A Google access token for the account signed in to this Chrome profile.
 * The first call on a computer shows a one-time consent prompt; after that Chrome refreshes silently.
 */
export const chromeToken: TokenProvider = async ({ refresh }) => {
  if (refresh && lastToken) await browser.identity.removeCachedAuthToken({ token: lastToken });
  const result = await browser.identity.getAuthToken({ interactive: true });
  const token = typeof result === 'string' ? result : result.token;
  if (!token) throw new Error('Chrome did not return a Google token.');
  lastToken = token;
  return token;
};

export function cloud(): FirestoreClient {
  return new FirestoreClient(FIRESTORE_DOCUMENTS, chromeToken);
}
