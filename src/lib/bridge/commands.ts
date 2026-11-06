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
  | { command: 'network' }
  | { command: 'scripts' }
  | { command: 'embedded'; index: number };

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

/** Whole names shown on the page, so discovery never reveals them as field names or values. */
function pageNames(): string[] {
  return LCR_POLICY.personSelectors.flatMap((selector) =>
    Array.from(document.querySelectorAll(selector), (element) => element.textContent?.trim() ?? '').filter(Boolean),
  );
}

function discoveryPolicy(): SanitizerPolicy {
  return { ...DISCOVERY_POLICY, extraSensitive: pageNames() };
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
      result = sanitizeJson(JSON.parse(body), discoveryPolicy(), session);
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
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  for (const entry of entries) {
    if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
      paths.add(sanitizeUrl(entry.name, location.href, blocked));
    }
  }
  return { ok: true, output: `resource entries: ${entries.length}\n${[...paths].sort().join('\n')}` };
}

const SAFE_ID = /^[_a-zA-Z][\w-]{0,40}$/;

/** Every script tag: its type, a safe id, where it loads from, and the size of any inline text. */
function runScripts(): BridgeResult {
  const blocked = namesOnPage(document);
  const lines = Array.from(document.scripts).map((script, index) => {
    const safeId = SAFE_ID.test(script.id) && !/\d{5,}/.test(script.id);
    const id = script.id ? (safeId ? script.id : '[id]') : '';
    const source = script.src ? sanitizeUrl(script.src, location.href, blocked) : `inline, ${script.text.length} chars`;
    return `${index}\t${script.type || 'classic'}\t${id}\t${source}`;
  });
  return { ok: true, output: lines.join('\n') };
}

/** The sanitized shape of an inline JSON script, such as Next.js page data. */
function runEmbedded(index: number): BridgeResult {
  const script = document.scripts[index];
  if (!script || script.src) return { ok: false, error: 'No inline script at that index.' };
  try {
    return sanitizeJson(JSON.parse(script.text), discoveryPolicy(), session);
  } catch {
    return { ok: false, error: 'That script is not JSON.' };
  }
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
    case 'scripts':
      return runScripts();
    case 'embedded':
      return runEmbedded(Number(request.index));
    default:
      return { ok: false, error: 'Unknown command.' };
  }
}
