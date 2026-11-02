import { hasLeaks, scanForLeaks, wordsOf } from './leakScan';
import { isAllowedLabel, type FieldRule, type SanitizerPolicy } from './policy';
import type { Pseudonymizer } from './pseudonymizer';
import type { SanitizeResult } from './result';
import { buildSafeWords, splitCamel } from './vocabulary';

const MAX_DEPTH = 32;
const MAX_DISCOVERABLE_KEYS = 50; // more keys than this looks like a map keyed by person, not a schema
const IDENTIFIER_KEY = /^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/;

function ageBand(value: unknown): string {
  const age = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(age) || age < 0 || age > 150) return '[age]';
  return `${Math.floor(age / 10) * 10}s`;
}

class JsonSanitizer {
  readonly sensitive = new Set<string>();
  readonly #inProgress = new WeakSet<object>();
  readonly #rawWords = new Set<string>();

  constructor(
    private readonly policy: SanitizerPolicy,
    private readonly session: Pseudonymizer,
  ) {
    for (const value of policy.extraSensitive ?? []) {
      for (const word of wordsOf(value)) this.#rawWords.add(word);
    }
  }

  /** Words in raw values decide which unknown keys are safe to show, so this walks first. */
  collectWords(value: unknown, seen = new WeakSet<object>()): void {
    if (typeof value === 'string') {
      for (const word of wordsOf(value)) this.#rawWords.add(word);
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const child of Object.values(value)) this.collectWords(child, seen);
    }
  }

  value(value: unknown, depth: number): unknown {
    if (value === null) return null;
    switch (typeof value) {
      case 'string':
        if (isAllowedLabel(value, this.policy)) return value;
        this.sensitive.add(value);
        return `[string#${this.session.number('string', value)}, ${value.length} chars]`;
      case 'number':
        this.sensitive.add(String(value));
        return '[number]';
      case 'boolean':
        return '[boolean]';
      case 'object':
        return this.#container(value, depth);
      default:
        return `[${typeof value}]`;
    }
  }

  #container(value: object, depth: number): unknown {
    if (depth >= MAX_DEPTH) return '[too deep]';
    if (value instanceof Date) return '[date]';
    if (this.#inProgress.has(value)) return '[cycle]';
    this.#inProgress.add(value);
    const result = Array.isArray(value)
      ? value.map((item) => this.value(item, depth + 1))
      : this.#object(value as Record<string, unknown>, depth);
    this.#inProgress.delete(value);
    return result;
  }

  #object(value: Record<string, unknown>, depth: number): Record<string, unknown> {
    const entries = Object.entries(value);
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, child] of entries) {
      const rule = Object.hasOwn(this.policy.fields, key) ? this.policy.fields[key] : undefined;
      const outputKey = rule || this.#canShowKey(key, entries.length) ? key : this.#redactKey(key);
      output[outputKey] = rule ? this.#byRule(child, rule, depth) : this.value(child, depth + 1);
    }
    return output;
  }

  #canShowKey(key: string, siblingCount: number): boolean {
    if (!this.policy.discoverKeys || siblingCount > MAX_DISCOVERABLE_KEYS) return false;
    if (!IDENTIFIER_KEY.test(key) || key === '__proto__') return false;
    return !wordsOf(splitCamel(key)).some((word) => this.#rawWords.has(word));
  }

  #redactKey(key: string): string {
    this.sensitive.add(key);
    return `[key#${this.session.number('key', key)}]`;
  }

  #byRule(value: unknown, rule: FieldRule, depth: number): unknown {
    if (rule.kind === 'structure' || typeof value === 'object') return this.value(value, depth + 1);
    switch (rule.kind) {
      case 'person':
      case 'household':
      case 'id': {
        const raw = String(value);
        this.sensitive.add(raw);
        const kind = rule.kind === 'person' ? 'Person' : rule.kind === 'household' ? 'Household' : 'Id';
        return this.session.name(kind, raw);
      }
      case 'age':
        return ageBand(value);
      case 'date':
        this.sensitive.add(String(value));
        return '[date]';
      case 'number':
        return typeof value === 'number' ? value : this.value(value, depth + 1);
      case 'boolean':
        return typeof value === 'boolean' ? value : this.value(value, depth + 1);
      case 'enum':
        return typeof value === 'string' && rule.values.includes(value) ? value : this.value(value, depth + 1);
    }
  }
}

export function sanitizeJson(raw: unknown, policy: SanitizerPolicy, session: Pseudonymizer): SanitizeResult {
  const sanitizer = new JsonSanitizer(policy, session);
  sanitizer.collectWords(raw);
  const output = JSON.stringify(sanitizer.value(raw, 0), null, 2) ?? 'null';
  const findings = scanForLeaks({
    output,
    sensitive: sanitizer.sensitive,
    alwaysBlock: policy.extraSensitive,
    safeWords: buildSafeWords(policy),
  });
  return hasLeaks(findings) ? { ok: false, findings } : { ok: true, output };
}
