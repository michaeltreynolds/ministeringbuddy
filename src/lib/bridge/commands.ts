// The commands the development bridge can run in the page. They are read-only by construction:
// the only network call is a GET, and every result passes through the sanitizer before it leaves.
import {
  LCR_POLICY,
  Pseudonymizer,
  sanitizeDom,
  sanitizeJson,
  sanitizeUrl,
  wordsOf,
  type SanitizeResult,
  type SanitizerPolicy,
} from '../sanitizer';

export type BridgeCommand =
  | { command: 'status' }
  | { command: 'dom'; selector?: string }
  | { command: 'fetch'; path: string }
  | { command: 'network' };

export type BridgeResult = SanitizeResult | { ok: false; error: string };

const session = new Pseudonymizer();
const DISCOVERY_POLICY: SanitizerPolicy = { ...LCR_POLICY, discoverKeys: true };

/** A relative path on this origin. Rejects "//host", "/\host" and full URLs, which would leave the origin. */
export function isSameOriginPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path) && !/[\\\s]/.test(path);
}

function namesOnPage(root: ParentNode): Set<string> {
  const words = new Set<string>();
  for (const selector of LCR_POLICY.personSelectors) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      for (const word of wordsOf(element.textContent ?? '')) words.add(word);
    }
  }
  return words;
}

function runStatus(): BridgeResult {
  const url = sanitizeUrl(location.href, location.href, namesOnPage(document));
  const elements = document.querySelectorAll('*').length;
  return { ok: true, output: `url: ${url}\nelements: ${elements}\nreadyState: ${document.readyState}` };
}

function runDom(selector = 'body'): BridgeResult {
  const element = document.querySelector(selector);
  if (!element) return { ok: false, error: 'No element matches that selector.' };
  return sanitizeDom(element, LCR_POLICY, session);
}

async function runFetch(path: string): Promise<BridgeResult> {
  if (!isSameOriginPath(path)) return { ok: false, error: 'Only same-origin relative paths are allowed.' };
  const response = await fetch(path, { method: 'GET', credentials: 'include' });
  const body = await response.text();
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0] ?? '';
  const header = `status: ${response.status}\ncontent-type: ${contentType}\nbytes: ${body.length}\n\n`;

  let result: SanitizeResult;
  if (contentType.includes('json')) {
    try {
      result = sanitizeJson(JSON.parse(body), DISCOVERY_POLICY, session);
    } catch {
      return { ok: true, output: `${header}[unparseable JSON]` };
    }
  } else if (contentType.includes('html')) {
    const parsed = new DOMParser().parseFromString(body, 'text/html');
    result = sanitizeDom(parsed.documentElement, LCR_POLICY, session);
  } else {
    return { ok: true, output: `${header}[not shown]` };
  }
  return result.ok ? { ok: true, output: header + result.output } : result;
}

function runNetwork(): BridgeResult {
  const blocked = namesOnPage(document);
  const paths = new Set<string>();
  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
      paths.add(sanitizeUrl(entry.name, location.href, blocked));
    }
  }
  return { ok: true, output: [...paths].sort().join('\n') };
}

export async function runBridgeCommand(request: BridgeCommand): Promise<BridgeResult> {
  switch (request.command) {
    case 'status':
      return runStatus();
    case 'dom':
      return runDom(request.selector);
    case 'fetch':
      return runFetch(request.path);
    case 'network':
      return runNetwork();
    default:
      return { ok: false, error: 'Unknown command.' };
  }
}
