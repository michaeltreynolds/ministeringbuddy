import { wordsOf } from './leakScan';

const SAFE_SEGMENT = /^[a-z][a-zA-Z0-9_-]{0,40}$/;
const SAFE_HOST = /(^|\.)churchofjesuschrist\.org$|^127\.0\.0\.1$/;

/**
 * Shows the shape of a URL so endpoints can be discovered. Query values are always dropped.
 * A path segment or query key is hidden unless it looks like a route name and matches no known name.
 */
export function sanitizeUrl(rawUrl: string, baseUrl: string, blockedWords: ReadonlySet<string>): string {
  let url: URL;
  try {
    url = new URL(rawUrl, baseUrl);
  } catch {
    return '[url]';
  }
  const isSafe = (part: string) =>
    SAFE_SEGMENT.test(part) && !/\d{5,}/.test(part) && !wordsOf(part).some((word) => blockedWords.has(word));

  const host = SAFE_HOST.test(url.hostname) ? url.hostname : '[other-host]';
  const path = url.pathname
    .split('/')
    .map((segment) => (!segment || isSafe(segment) ? segment : '[segment]'))
    .join('/');
  const keys = [...url.searchParams.keys()].map((key) => (isSafe(key) ? key : '[key]'));
  return `${host}${path}${keys.length ? `?${keys.join('&')}` : ''}`;
}
