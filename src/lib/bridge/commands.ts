// The commands the development bridge can run in the page. They are read-only by construction:
// the only network call is a GET, and every result passes through the sanitizer before it leaves.
import {
  hasLeaks,
  LCR_POLICY,
  scanForLeaks,
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
  | { command: 'embedded'; index: number }
  | { command: 'next'; path: string }
  | { command: 'outline'; path: string }
  | { command: 'box'; selector: string };

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

async function fetchNextData(path: string): Promise<unknown> {
  if (!isSameOriginPath(path)) throw new BridgeError('Only same-origin relative paths are allowed.');
  const response = await fetch(path, { method: 'GET', credentials: 'include' });
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const script = page.querySelector('script#__NEXT_DATA__');
  if (!script) throw new BridgeError(`No __NEXT_DATA__ in that page (status ${response.status}).`);
  try {
    return JSON.parse(script.textContent ?? '');
  } catch {
    throw new BridgeError('The embedded data is not JSON.');
  }
}

class BridgeError extends Error {}

async function withBridgeErrors(run: () => Promise<BridgeResult>): Promise<BridgeResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BridgeError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Fetches an LCR page and returns the sanitized shape of its embedded Next.js data. */
function runNext(path: string): Promise<BridgeResult> {
  return withBridgeErrors(async () => sanitizeJson(await fetchNextData(path), discoveryPolicy(), session));
}

const OUTLINE_DEPTH = 9;
const OUTLINE_KEY = /^[a-zA-Z_][a-zA-Z_]{0,36}\d{0,3}$/;

/** Multi-word strings under a field whose name contains "name", such as "Jones, Bob": the people in the data. */
function namesIn(data: unknown): string[] {
  const names: string[] = [];
  const looksLikeName = (value: string) => /\p{L}/u.test(value) && /[,\s]/.test(value.trim()) && value.trim().length >= 4;
  // Person fields such as name, nameSort, supervisorName, householdNameFamilyLocal, directoryPreferredLocal.
  // Not labels, titles, or district, unit and org names, which are interface text.
  const isPersonField = (key: string) =>
    /(^name|Name|PreferredLocal)/.test(key) && !/label|title|district|unit|org|lang|group|position|calling/i.test(key);
  // Only person records count, so a district named "Elders Quorum District 1" doesn't make "district" a name.
  const isPerson = (record: object) => Object.hasOwn(record, 'personUuid') || Object.hasOwn(record, 'legacyCmisId');
  (function walk(value: unknown, key: string, inPerson: boolean) {
    if (typeof value === 'string' && inPerson && isPersonField(key) && looksLikeName(value)) names.push(value);
    else if (value && typeof value === 'object') {
      if (!Array.isArray(value) && Object.keys(value).length > 50) return; // translation tables, not people
      const person = Array.isArray(value) ? inPerson : isPerson(value);
      for (const [k, child] of Object.entries(value)) walk(child, Array.isArray(value) ? key : k, person);
    }
  })(data, '', false);
  return names;
}

/**
 * Field names only, as an indented outline, with array lengths. No values are included.
 * A field name is hidden if it looks like an ID or contains any word of any person's name in the data.
 */
function outline(data: unknown, nameWords: Set<string>, shownKeyWords: Set<string>): string {
  const lines: string[] = [];
  // Returns the key, or a placeholder saying why it's hidden. The reason never reveals the key.
  const showKey = (key: string): string => {
    if (!OUTLINE_KEY.test(key)) return '[key: id-like]';
    const parts = wordsOf(key.replace(/([a-z])([A-Z])/g, '$1 $2'));
    if (parts.some((part) => nameWords.has(part))) return '[key: name-part]';
    // A run-together key such as "smithjones" must not contain any name word.
    const lower = key.toLowerCase();
    if (parts.length === 1 && [...nameWords].some((word) => word.length >= 4 && lower.includes(word))) return '[key: name-inside]';
    for (const part of [key.toLowerCase(), ...parts]) shownKeyWords.add(part);
    return key;
  };
  (function walk(value: unknown, label: string, depth: number) {
    const indent = '  '.repeat(depth);
    if (Array.isArray(value)) {
      lines.push(`${indent}${label}: [${value.length}]`);
      const first = value.find((item) => item && typeof item === 'object');
      if (first && depth < OUTLINE_DEPTH) walk(first, '[0]', depth + 1);
    } else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length > 50) {
        lines.push(`${indent}${label}: {${keys.length} keys}`);
        return;
      }
      lines.push(`${indent}${label}: {}`);
      if (depth >= OUTLINE_DEPTH) return;
      for (const key of keys) walk((value as Record<string, unknown>)[key], showKey(key), depth + 1);
    } else {
      lines.push(`${indent}${label}: ${value === null ? 'null' : typeof value}`);
    }
  })(data, 'root', 0);
  return lines.join('\n');
}

function runOutline(path: string): Promise<BridgeResult> {
  return withBridgeErrors(async () => {
    const data = await fetchNextData(path);
    const names = namesIn(data);
    const nameWords = new Set(names.flatMap((name) => wordsOf(name)).filter((word) => word.length >= 2));
    const shownKeyWords = new Set<string>();
    const output = outline(data, nameWords, shownKeyWords);
    // The outline's own labels. A member surnamed "Key" must not block every line.
    const safeWords = new Set(['root', 'key', 'keys', 'string', 'number', 'boolean', 'object', 'null', 'undefined', 'id', 'like', 'name', 'part', 'inside']);
    const findings = scanForLeaks({ output, sensitive: [], alwaysBlock: names, safeWords, opaqueWords: shownKeyWords });
    return hasLeaks(findings) ? { ok: false, findings } : { ok: true, output };
  });
}

/** Where an element is and whether it can be seen. Geometry and styles only, never text. */
function runBox(selector: string): BridgeResult {
  const describe = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return `${element.localName}: x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} h=${Math.round(rect.height)} display=${style.display} visibility=${style.visibility} position=${style.position} z=${style.zIndex} opacity=${style.opacity}`;
  };
  const element = document.querySelector(selector);
  if (!element) return { ok: false, error: 'No element matches that selector.' };
  const lines = [`viewport: ${innerWidth}x${innerHeight} scrollY=${Math.round(scrollY)}`, describe(element)];
  for (const child of Array.from(element.shadowRoot?.children ?? [])) if (child.localName !== 'style') lines.push(`  shadow ${describe(child)}`);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.transform !== 'none' || style.filter !== 'none' || style.contain !== 'none' || style.overflow !== 'visible') {
      lines.push(`  ancestor ${parent.localName}: transform=${style.transform} filter=${style.filter} contain=${style.contain} overflow=${style.overflow}`);
    }
  }
  return { ok: true, output: lines.join('\n') };
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
    case 'next':
      return runNext(request.path);
    case 'outline':
      return runOutline(request.path);
    case 'box':
      return runBox(request.selector);
    default:
      return { ok: false, error: 'Unknown command.' };
  }
}
