import { hasLeaks, scanForLeaks, wordsOf } from './leakScan';
import { isAllowedLabel, type SanitizerPolicy } from './policy';
import type { Pseudonymizer } from './pseudonymizer';
import type { SanitizeResult } from './result';
import { buildSafeWords, HTML_TAGS, REDACTED_ATTRIBUTES, VISIBLE_ATTRIBUTES } from './vocabulary';

const MAX_ELEMENTS = 20000;
const DROPPED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'link', 'meta', 'head']);
const KNOWN_TAGS = new Set(HTML_TAGS);
const VISIBLE = new Set(VISIBLE_ATTRIBUTES);
const REDACTED = new Set(REDACTED_ATTRIBUTES);
const SAFE_ATTRIBUTE_VALUE = /^[a-z0-9-]{0,20}$/i;

// Generated class names: "sc-b78c45da-0", or a hash with a capital after the first letter such as "jbzcWL".
function isGeneratedClass(token: string): boolean {
  return /^sc-[0-9a-f]{5,10}-\d{1,2}$/.test(token) || (/^[a-zA-Z]{5,7}$/.test(token) && /[A-Z]/.test(token.slice(1)));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class DomSanitizer {
  readonly sensitive = new Set<string>();
  readonly opaqueWords = new Set<string>();
  #elements = 0;

  constructor(
    private readonly policy: SanitizerPolicy,
    private readonly session: Pseudonymizer,
  ) {}

  #text(raw: string, parent: Element): string | null {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (!text) return null;
    if (isAllowedLabel(text, this.policy)) return escapeHtml(text);
    this.sensitive.add(text);
    if (this.policy.personSelectors.some((selector) => parent.matches(selector))) {
      return this.session.name('Person', text);
    }
    return `[text#${this.session.number('text', text)}, ${text.length} chars]`;
  }

  #redactedAttribute(name: string, value: string): string {
    this.sensitive.add(value);
    return `${name}="[attr, ${value.length} chars]"`;
  }

  #attributes(element: Element): string {
    const parts: string[] = [];
    for (const { name, value } of Array.from(element.attributes)) {
      if (name === 'class') {
        const tokens = value.trim().split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          if (!isGeneratedClass(token)) this.sensitive.add(token);
          else for (const word of wordsOf(token)) this.opaqueWords.add(word);
        }
        const shown = tokens.map((token) => (isGeneratedClass(token) ? token : '[class]'));
        if (shown.length) parts.push(`class="${shown.join(' ')}"`);
      } else if (VISIBLE.has(name)) {
        if (SAFE_ATTRIBUTE_VALUE.test(value)) parts.push(value ? `${name}="${value}"` : name);
        else parts.push(this.#redactedAttribute(name, value));
      } else if (REDACTED.has(name)) {
        parts.push(this.#redactedAttribute(name, value));
      } else {
        // Unknown attributes such as data-member-id: neither name nor value is shown.
        this.sensitive.add(name);
        this.sensitive.add(value);
      }
    }
    return parts.length ? ` ${parts.join(' ')}` : '';
  }

  element(element: Element, depth: number): string {
    if (++this.#elements > MAX_ELEMENTS) return '[truncated]\n';
    const tag = element.localName;
    if (DROPPED_TAGS.has(tag)) return '';
    const indent = '  '.repeat(depth);
    if (tag === 'svg') return `${indent}<svg/>\n`;
    const shownTag = KNOWN_TAGS.has(tag) ? tag : 'unknown-element';
    const attributes = this.#attributes(element);

    let children = '';
    let inlineText = '';
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 1) {
        children += this.element(node as Element, depth + 1);
      } else if (node.nodeType === 3) {
        const text = this.#text(node.nodeValue ?? '', element);
        if (text) inlineText += (inlineText ? ' ' : '') + text;
      }
    }
    if (!children) return `${indent}<${shownTag}${attributes}>${inlineText}</${shownTag}>\n`;
    const textLine = inlineText ? `${indent}  ${inlineText}\n` : '';
    return `${indent}<${shownTag}${attributes}>\n${textLine}${children}${indent}</${shownTag}>\n`;
  }
}

export function sanitizeDom(root: Element, policy: SanitizerPolicy, session: Pseudonymizer): SanitizeResult {
  const sanitizer = new DomSanitizer(policy, session);
  const output = sanitizer.element(root, 0);
  const findings = scanForLeaks({
    output,
    sensitive: sanitizer.sensitive,
    alwaysBlock: policy.extraSensitive,
    safeWords: buildSafeWords(policy),
    opaqueWords: sanitizer.opaqueWords,
  });
  return hasLeaks(findings) ? { ok: false, findings } : { ok: true, output };
}
