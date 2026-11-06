// The second line of defense: inspects finished output for anything that looks private.
// Findings hold counts only, so a blocked result can never echo the value it caught.

export type LeakKind =
  | 'known-name' // a caller-supplied value appeared whole
  | 'sensitive-value' // a word from a redacted value appeared as a word
  | 'sensitive-substring' // a word from a redacted value appeared inside a longer word
  | 'email'
  | 'phone'
  | 'membership-number'
  | 'long-digits'
  | 'long-token'
  | 'street-address';

export type LeakFindings = Partial<Record<LeakKind, number>>;

const PATTERNS: ReadonlyArray<[LeakKind, RegExp]> = [
  ['email', /[^\s@<>"'[\]]+@[^\s@<>"'[\]]+\.[a-z]{2,}/gi],
  ['membership-number', /(?<![\w-])\d{3}-\d{4}-\d{4}(?![\w-])/g],
  ['phone', /(?<![\w-])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w-])/g],
  ['long-digits', /(?<![\w-])\d{7,}(?![\w-])/g],
  // Tokens and hashes mix letters and digits. A long all-letter run is a camelCase field name.
  ['long-token', /(?<![\w-])(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{32,}(?![\w-])/g],
  [
    'street-address',
    /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z][A-Za-z.]*(?:\s+[A-Za-z.]+){0,3}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|way|boulevard|blvd|place|pl)\b/gi,
  ],
];

const MARKERS = /\[(?:string|text|key)#\d+(?:, \d+ chars)?\]|\b(?:Person|Household|Id)_\d+\b/g;

// Letters without accents, so "José" and "Jose" compare equal.
export function foldText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function wordsOf(value: string): string[] {
  return foldText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function isScannableWord(word: string): boolean {
  if (/^\p{N}+$/u.test(word)) return word.length >= 5;
  return word.length >= 2;
}

export interface LeakScanInput {
  output: string;
  /** Raw values the sanitizer redacted. */
  sensitive: Iterable<string>;
  /** Caller-supplied values that also block on a whole-string match, whatever the safe list says. */
  alwaysBlock?: Iterable<string>;
  /** The output's own vocabulary. A member surnamed "Bishop" must not block every label. */
  safeWords: ReadonlySet<string>;
  /**
   * Random identifiers in the output, such as generated class names. They are still checked for whole-word
   * matches, but not for words hidden inside them, since a random "b7dead1" contains "dead" by chance.
   */
  opaqueWords?: ReadonlySet<string>;
}

export function scanForLeaks({ output, sensitive, alwaysBlock = [], safeWords, opaqueWords = new Set() }: LeakScanInput): LeakFindings {
  const findings: LeakFindings = {};
  const add = (kind: LeakKind, count = 1) => {
    findings[kind] = (findings[kind] ?? 0) + count;
  };

  for (const [kind, pattern] of PATTERNS) {
    const matches = output.match(pattern);
    if (matches) add(kind, matches.length);
  }

  const foldedOutput = foldText(output).replace(/\s+/g, ' ');
  for (const value of alwaysBlock) {
    const folded = foldText(value).trim().replace(/\s+/g, ' ');
    if (folded && foldedOutput.includes(folded)) add('known-name');
  }

  // The sanitizer's own markers carry counters such as "string#12345" that can equal a real ID by chance.
  const withoutMarkers = output.replace(MARKERS, ' ');
  const outputWords = new Set(wordsOf(withoutMarkers).filter((word) => !safeWords.has(word)));
  const wordsToFind = new Set<string>();
  for (const value of [...sensitive, ...alwaysBlock]) {
    for (const word of wordsOf(value)) {
      if (isScannableWord(word) && !safeWords.has(word)) wordsToFind.add(word);
    }
  }
  for (const word of wordsToFind) {
    if (outputWords.has(word)) {
      add('sensitive-value');
    } else if (word.length >= 4) {
      // Catches run-together forms such as "BobJones" in a class name.
      for (const candidate of outputWords) {
        if (opaqueWords.has(candidate)) continue;
        if (candidate.includes(word)) {
          add('sensitive-substring');
          break;
        }
      }
    }
  }
  return findings;
}

export function hasLeaks(findings: LeakFindings): boolean {
  return Object.keys(findings).length > 0;
}
