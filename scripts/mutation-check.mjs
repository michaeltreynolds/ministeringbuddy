// Breaks the sanitizer one way at a time. The test suite must fail for every mutation.
// A mutation that survives means a privacy rule that no test is really protecting.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const S = 'src/lib/sanitizer/';
const MUTATIONS = [
  ['JSON strings pass through', S + 'sanitizeJson.ts', "return `[string#${this.session.number('string', value)}, ${value.length} chars]`;", 'return value;'],
  ['JSON numbers pass through', S + 'sanitizeJson.ts', "return '[number]';", 'return value;'],
  ['unknown keys always shown', S + 'sanitizeJson.ts', 'if (!this.policy.discoverKeys || siblingCount > MAX_DISCOVERABLE_KEYS) return false;', 'return true;'],
  ['raw-word check on keys removed', S + 'sanitizeJson.ts', 'return !wordsOf(splitCamel(key)).some((word) => this.#rawWords.has(word));', 'return true;'],
  ['wide-map check removed', S + 'sanitizeJson.ts', ' || siblingCount > MAX_DISCOVERABLE_KEYS', ''],
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
