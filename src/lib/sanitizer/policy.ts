// What may pass through the sanitizer. Anything not named here is redacted.

export type FieldRule =
  | { kind: 'structure' } // the key is visible, children are sanitized on their own terms
  | { kind: 'person' } // becomes Person_N
  | { kind: 'household' } // becomes Household_N
  | { kind: 'id' } // becomes Id_N
  | { kind: 'age' } // becomes a decade band such as "30s"
  | { kind: 'date' } // becomes [date]
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[] };

export interface SanitizerPolicy {
  /** JSON field names that may be shown, and how to treat their values. */
  fields: Readonly<Record<string, FieldRule>>;
  /** Exact UI strings that may pass unchanged. */
  labels: readonly string[];
  /** UI strings with a safe shape, such as "Count: 49". */
  labelPatterns: readonly RegExp[];
  /** Elements whose text is a person's name, such as "td a". */
  personSelectors: readonly string[];
  /**
   * Show identifier-like field names that are not in `fields`, to learn an unknown API's shape.
   * Values stay redacted. Off by default, because a map keyed by first name could slip through.
   */
  discoverKeys?: boolean;
  /** Names or other values that must never appear, whatever the rules above allow. */
  extraSensitive?: readonly string[];
}

export function isAllowedLabel(text: string, policy: SanitizerPolicy): boolean {
  return policy.labels.includes(text) || policy.labelPatterns.some((pattern) => pattern.test(text));
}
