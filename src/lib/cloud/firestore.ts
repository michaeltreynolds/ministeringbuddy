// A small Firestore client over the REST API. Access is decided by IAM on the church-mt project:
// the caller's Google token must belong to an account with a role there.

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain };

export function encode(value: Plain): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: encodeFields(value) } };
}

function encodeFields(value: { [key: string]: Plain }): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child)]));
}

export function decode(value: FirestoreValue): Plain {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  return decodeFields(value.mapValue.fields ?? {});
}

function decodeFields(fields: Record<string, FirestoreValue>): { [key: string]: Plain } {
  return Object.fromEntries(Object.entries(fields).map(([key, child]) => [key, decode(child)]));
}

/** "snapshots/2026-11-05" -> URL path. Rejects empty segments and odd segment counts for documents. */
export function documentPath(path: string): string {
  const segments = path.split('/');
  if (segments.length % 2 !== 0 || segments.some((segment) => !segment)) {
    throw new Error('A document path needs collection/document pairs.');
  }
  return segments.map(encodeURIComponent).join('/');
}

export type TokenProvider = (options: { refresh: boolean }) => Promise<string>;

export class FirestoreClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get(path: string): Promise<{ [key: string]: Plain } | null> {
    const response = await this.#request('GET', documentPath(path));
    if (response.status === 404) return null;
    const document = await response.json();
    return decodeFields(document.fields ?? {});
  }

  async set(path: string, data: { [key: string]: Plain }): Promise<void> {
    await this.#request('PATCH', documentPath(path), { fields: encodeFields(data) });
  }

  async #request(method: string, path: string, body?: unknown): Promise<Response> {
    const send = async (refresh: boolean) =>
      this.fetchImpl(`${this.baseUrl}/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await this.getToken({ refresh })}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    let response = await send(false);
    if (response.status === 401) response = await send(true); // a cached token can expire
    if (!response.ok && response.status !== 404) {
      throw new Error(`Firestore ${method} failed with ${response.status}.`);
    }
    return response;
  }
}
