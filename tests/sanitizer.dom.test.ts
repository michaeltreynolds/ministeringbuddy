// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LCR_POLICY, Pseudonymizer, sanitizeDom, type SanitizerPolicy } from '../src/lib/sanitizer';

const EMPTY: SanitizerPolicy = { fields: {}, labels: [], labelPatterns: [], personSelectors: [] };

function dom(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

function run(html: string, policy = EMPTY): string {
  const result = sanitizeDom(dom(html), policy, new Pseudonymizer());
  if (!result.ok) throw new Error(`blocked: ${JSON.stringify(result.findings)}`);
  return result.output;
}

describe('sanitizeDom: the LCR unassigned page', () => {
  const page = readFileSync('tests/fixtures/unassigned-page.html', 'utf8');
  const output = run(page, LCR_POLICY);

  it('hides every name', () => {
    expect(output).not.toMatch(/Jones|Bob|Keller|Barnaby|Gerber|Allison|Frankworth|Bert|Ernie/);
  });

  it('keeps the labels and structure needed to write selectors', () => {
    const expected = ['Unassigned Ministering Brothers', 'Unassigned Households', 'Sort By', 'Count: 49', 'Count: 48', '<table', '<tbody', 'sc-b78c45da-0'];
    for (const text of expected) expect(output).toContain(text);
  });

  it('gives each person a pseudonym and hides ages', () => {
    expect(output).toContain('Person_1');
    expect(output).toContain('Person_4');
    expect(output).not.toMatch(/>\s*(68|25)\s*</);
  });
});

describe('sanitizeDom: places a name can hide', () => {
  const secret = 'Jones';
  it.each([
    ['text', `<div>${secret}</div>`],
    ['text next to an element', `<div>${secret}<b>x</b></div>`],
    ['href query', `<a href="/member?name=${secret}">x</a>`],
    ['href path', `<a href="/member/${secret}/edit">x</a>`],
    ['aria-label', `<button aria-label="Edit ${secret}">x</button>`],
    ['title', `<span title="${secret}">x</span>`],
    ['alt', `<img alt="${secret}" src="/photo/${secret}.jpg">`],
    ['input value', `<input value="${secret}">`],
    ['placeholder', `<input placeholder="${secret}">`],
    ['textarea content', `<textarea>${secret}</textarea>`],
    ['option', `<select><option>${secret}</option></select>`],
    ['data attribute', `<div data-member-name="${secret}">x</div>`],
    ['data attribute name', `<div data-jones="1">x</div>`],
    ['id', `<div id="member-${secret}">x</div>`],
    ['class', `<div class="member-${secret}">x</div>`],
    ['plain capitalized class', `<div class="${secret}">x</div>`],
    ['style', `<div style="background:url(/photo/${secret}.jpg)">x</div>`],
    ['script', `<script>var name = "${secret}"</script>`],
    ['inline style tag', `<style>.${secret}{}</style>`],
    ['comment', `<!-- ${secret} -->`],
    ['svg title', `<svg><title>${secret}</title></svg>`],
    ['iframe', `<iframe srcdoc="${secret}"></iframe>`],
    ['template', `<template><div>${secret}</div></template>`],
    ['custom element name', `<x-jones>x</x-jones>`],
    ['visible attribute with odd value', `<div role="${secret}, member of the quorum">x</div>`],
  ])('hides a name in: %s', (_where, html) => {
    expect(run(html).toLowerCase()).not.toContain('jones');
  });

  it('drops script and style elements entirely, rather than redacting them', () => {
    expect(run('<script>var a = 1</script><style>.a{}</style><p></p>')).toBe('<div>\n  <p></p>\n</div>\n');
  });

  it('hides phones and emails in free text', () => {
    expect(run('<p>Call 801-555-0100 or bob@example.com</p>')).not.toMatch(/555|bob|example/);
  });

  it('gives repeated text the same marker', () => {
    const output = run('<i>Elm</i><i>Elm</i><i>Oak</i>');
    expect(output.match(/text#1,/g)).toHaveLength(2);
    expect(output.match(/text#2,/g)).toHaveLength(1);
  });

  it('blocks when a bad label would show a known name', () => {
    const policy = { ...EMPTY, labels: ['Jones, Bob'], extraSensitive: ['Jones, Bob'] };
    const result = sanitizeDom(dom('<div>Jones, Bob</div>'), policy, new Pseudonymizer());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/Jones|Bob/);
  });

  it('does not block when a member is surnamed like a label word', () => {
    const output = run('<h1>Unassigned Ministering Brothers</h1><td><a>Brothers, Bob</a></td>', LCR_POLICY);
    expect(output).toContain('Unassigned Ministering Brothers');
    expect(output).not.toContain('Bob');
  });
});

describe('sanitizeDom: generated class names', () => {
  it('does not block when a random class name happens to contain a redacted word', () => {
    // "dead" is redacted page text, and the generated class "sc-0dead1-0" contains it by chance.
    const output = run('<div class="sc-0dead1-0"><p>dead</p></div>');
    expect(output).toContain('sc-0dead1-0');
    expect(output).not.toMatch(/>dead</);
  });

  it('still blocks a class name that is exactly a redacted word', () => {
    const result = sanitizeDom(dom('<div class="sc-0dead1-0"><p>0dead1</p></div>'), EMPTY, new Pseudonymizer());
    expect(result.ok).toBe(false);
  });
});
