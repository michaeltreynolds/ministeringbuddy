// The second line of defense: inspects finished output for anything that looks private.
// Findings hold counts only, so a blocked result can never echo the value it caught.

export type LeakKind =
  | 'sensitive-value'
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
  ['long-token', /[A-Za-z0-9_-]{32,}/g],
  [
    'street-address',
    /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z][A-Za-z.]*(?:\s+[A-Za-z.]+){0,3}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|way|boulevard|blvd|place|pl)\b/gi,
  ],
];

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
}

export function scanForLeaks({ output, sensitive, alwaysBlock = [], safeWords }: LeakScanInput): LeakFindings {
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
    if (folded && foldedOutput.includes(folded)) add('sensitive-value');
  }

  const outputWords = new Set(wordsOf(output).filter((word) => !safeWords.has(word)));
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
        if (candidate.includes(word)) {
          add('sensitive-value');
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
