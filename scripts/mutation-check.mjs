// Breaks the sanitizer one way at a time. The test suite must fail for every mutation.
// A mutation that survives means a privacy rule that no test is really protecting.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const S = 'src/lib/sanitizer/';
const MUTATIONS = [
  ['JSON strings pass through', S + 'sanitizeJson.ts', "return `[string#${this.session.number('string', value)}, ${value.length} chars]`;", 'return value;'],
  ['JSON numbers pass through', S + 'sanitizeJson.ts', "return '[number]';", 'return value;'],
  ['unknown keys always shown', S + 'sanitizeJson.ts', 'if (!this.policy.discoverKeys) return false;', 'return true;'],
  ['raw-word check on keys removed', S + 'sanitizeJson.ts', 'if (parts.some((word) => this.#rawWords.has(word))) return false;', ''],
  ['wide-map detection removed', S + 'sanitizeJson.ts', 'keys.length > MAX_DISCOVERABLE_KEYS', 'false'],
  ['enum check removed', S + 'sanitizeJson.ts', "typeof value === 'string' && rule.values.includes(value) ? value", "typeof value === 'string' ? value"],
  ['leak scan disabled', S + 'leakScan.ts', 'return findings;', 'return {};'],
  ['accent folding removed', S + 'leakScan.ts', ".replace(/\\p{M}/gu, '')", ''],
  ['run-together check removed', S + 'leakScan.ts', 'if (candidate.includes(word)) {', 'if (false) {'],
  ['DOM text passes through', S + 'sanitizeDom.ts', "return `[text#${this.session.number('text', text)}, ${text.length} chars]`;", 'return text;'],
  ['person rule shows the name', S + 'sanitizeDom.ts', "return this.session.name('Person', text);", 'return text;'],
  ['redacted attributes shown', S + 'sanitizeDom.ts', 'return `${name}="[attr, ${value.length} chars]"`;', 'return `${name}="${value}"`;'],
  ['all classes shown', S + 'sanitizeDom.ts', "const shown = tokens.map((token) => (isGeneratedClass(token) ? token : '[class]'));", 'const shown = tokens;'],
  ['visible attribute values unchecked', S + 'sanitizeDom.ts', 'if (SAFE_ATTRIBUTE_VALUE.test(value)) parts', 'if (true) parts'],
  ['script and style contents kept', S + 'sanitizeDom.ts', "if (DROPPED_TAGS.has(tag)) return '';", ''],
  ['custom tag names shown', S + 'sanitizeDom.ts', "KNOWN_TAGS.has(tag) ? tag : 'unknown-element'", 'tag'],
  ['URL parts unchecked', S + 'sanitizeUrl.ts', 'SAFE_SEGMENT.test(part) && !/\\d{5,}/.test(part) && !wordsOf(part).some((word) => blockedWords.has(word));', 'true;'],
  ['other hosts shown', S + 'sanitizeUrl.ts', "SAFE_HOST.test(url.hostname) ? url.hostname : '[other-host]'", 'url.hostname'],
  ['mapping serializable', S + 'pseudonymizer.ts', "return '[Pseudonymizer]';", 'return JSON.stringify([...this.#assigned]);'],
  ['run-together key check removed', S + 'sanitizeJson.ts', 'if (parts.length === 1 && key.length >= 6) {', 'if (false) {'],
  ['marker stripping catches real text', S + 'leakScan.ts', "const withoutMarkers = output.replace(MARKERS, ' ');", "const withoutMarkers = output.replace(/[A-Za-z]+/g, ' ');"],
  ['wide-map keys not collected', S + 'sanitizeJson.ts', 'if (wide || !IDENTIFIER_KEY.test(key)) for', 'if (false) for'],
  ['known names allowed as schema keys', S + 'sanitizeJson.ts', 'if (parts.some((word) => this.#knownNameWords.has(word))) return false;', ''],
  ['schema repeat threshold ignored', S + 'sanitizeJson.ts', 'if ((this.#keyCounts.get(key) ?? 0) >= SCHEMA_REPEATS) {', 'if (true) {'],
  ['ID-like keys allowed', S + 'sanitizeJson.ts', String.raw`const IDENTIFIER_KEY = /^[a-zA-Z_][a-zA-Z_]{0,36}\d{0,3}$/;`, 'const IDENTIFIER_KEY = /^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/;'],
  ['same-origin check weakened', 'src/lib/bridge/commands.ts', 'return /^\\/(?![/\\\\])/.test(path) && !/[\\\\\\s]/.test(path);', "return path.startsWith('/');"],
];

let survived = 0;
for (const [name, file, from, to] of MUTATIONS) {
  const original = readFileSync(file, 'utf8');
  if (!original.includes(from)) {
    console.log(`NOT APPLIED  ${name}`);
    survived++;
    continue;
  }
  writeFileSync(file, original.replace(from, () => to));
  try {
    execSync('npx vitest run', { stdio: 'pipe' });
    console.log(`SURVIVED     ${name}`);
    survived++;
  } catch {
    console.log(`caught       ${name}`);
  } finally {
    writeFileSync(file, original);
  }
}
console.log(survived ? `${survived} of ${MUTATIONS.length} NOT caught` : `All ${MUTATIONS.length} caught.`);
process.exit(survived ? 1 : 0);
