import { describe, expect, it } from 'vitest';
import { decode, documentPath, encode, FirestoreClient, type Plain } from '../src/lib/cloud/firestore';

describe('Firestore value encoding', () => {
  it('round-trips nested data', () => {
    const value: Plain = { a: 1, b: 1.5, c: 'x', d: true, e: null, f: [1, 'two', { g: [] }], h: {} };
    expect(decode(encode(value))).toEqual(value);
  });

  it('sends integers as strings, the way Firestore expects', () => {
    expect(encode(3)).toEqual({ integerValue: '3' });
  });
});

describe('documentPath', () => {
  it('encodes each segment', () => {
    expect(documentPath('snapshots/2026-11-05 a')).toBe('snapshots/2026-11-05%20a');
  });

  it.each(['snapshots', 'a/b/c', 'a//b', '/a/b'])('rejects %j', (path) => {
    expect(() => documentPath(path)).toThrow();
  });
});

describe('FirestoreClient', () => {
  function fakeFetch(responses: Response[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responses.shift()!;
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it('calls the global fetch on the global object, as browsers require', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      // Chrome throws "Illegal invocation" when fetch is called on any other object.
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('{}'));
    } as typeof fetch;
    try {
      await new FirestoreClient('https://base', async () => 'token').get('meta/connection');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('reads a document', async () => {
    const { impl } = fakeFetch([new Response(JSON.stringify({ fields: { lastCheck: { stringValue: 'x' } } }))]);
    const client = new FirestoreClient('https://base', async () => 'token', impl);
    expect(await client.get('meta/connection')).toEqual({ lastCheck: 'x' });
  });

  it('returns null for a missing document', async () => {
    const { impl } = fakeFetch([new Response('{}', { status: 404 })]);
    const client = new FirestoreClient('https://base', async () => 'token', impl);
    expect(await client.get('meta/none')).toBeNull();
  });

  it('retries once with a fresh token after a 401', async () => {
    const { calls, impl } = fakeFetch([new Response('', { status: 401 }), new Response('{}')]);
    const tokens: boolean[] = [];
    const client = new FirestoreClient('https://base', async ({ refresh }) => (tokens.push(refresh), refresh ? 'new' : 'old'), impl);
    await client.set('meta/connection', { lastCheck: 'x' });
    expect(tokens).toEqual([false, true]);
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer new');
  });

  it('throws on other errors without quoting the response body', async () => {
    const { impl } = fakeFetch([new Response('secret body', { status: 403 })]);
    const client = new FirestoreClient('https://base', async () => 'token', impl);
    await expect(client.get('meta/connection')).rejects.toThrow(/^Firestore GET failed with 403\.$/);
  });
});
