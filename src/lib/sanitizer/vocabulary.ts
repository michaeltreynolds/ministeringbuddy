import { wordsOf } from './leakScan';
import type { SanitizerPolicy } from './policy';

// Words the sanitizer itself writes, plus HTML names. None of them came from member data.
const OUTPUT_WORDS = `
  string text key url date value attr class person household id number boolean chars cycle too deep
  function symbol bigint undefined null true false truncated svg element unknown amp lt gt quot
`;

export const HTML_TAGS = `
  a abbr article aside b body br button caption code col colgroup dd details dialog div dl dt em fieldset
  figure footer form h1 h2 h3 h4 h5 h6 header hr html i img input label legend li main mark menu nav ol
  optgroup option output p pre progress section select small span strong summary table tbody td textarea
  tfoot th thead time tr u ul
`.trim().split(/\s+/);

export const VISIBLE_ATTRIBUTES = `
  role type colspan rowspan tabindex disabled checked selected hidden aria-haspopup aria-expanded
  aria-hidden aria-selected aria-disabled aria-sort
`.trim().split(/\s+/);

export const REDACTED_ATTRIBUTES = `
  id href src alt title name value placeholder for action aria-label aria-labelledby aria-describedby
`.trim().split(/\s+/);

export function splitCamel(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function buildSafeWords(policy: SanitizerPolicy): Set<string> {
  const words = new Set(wordsOf(OUTPUT_WORDS));
  for (const word of [...HTML_TAGS, ...VISIBLE_ATTRIBUTES, ...REDACTED_ATTRIBUTES]) {
    for (const part of wordsOf(word)) words.add(part);
  }
  for (const label of policy.labels) for (const word of wordsOf(label)) words.add(word);
  for (const [field, rule] of Object.entries(policy.fields)) {
    for (const word of wordsOf(splitCamel(field))) words.add(word);
    if (rule.kind === 'enum') {
      for (const value of rule.values) for (const word of wordsOf(value)) words.add(word);
    }
  }
  return words;
}
