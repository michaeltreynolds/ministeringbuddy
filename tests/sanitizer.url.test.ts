import { describe, expect, it } from 'vitest';
import { isSameOriginPath } from '../src/lib/bridge/commands';
import { sanitizeUrl } from '../src/lib/sanitizer';

const BASE = 'https://lcr.churchofjesuschrist.org/ministering';
const NONE = new Set<string>();

describe('sanitizeUrl', () => {
  it('shows route names and query keys but drops query values', () => {
    const url = sanitizeUrl('/ministering-proposed-assignments?type=EQ&tab=unassigned', BASE, NONE);
    expect(url).toBe('lcr.churchofjesuschrist.org/ministering-proposed-assignments?type&tab');
  });

  it('hides IDs in the path', () => {
    expect(sanitizeUrl('/member/3141592653/edit', BASE, NONE)).toBe('lcr.churchofjesuschrist.org/member/[segment]/edit');
    expect(sanitizeUrl('/member/m3141592653', BASE, NONE)).toContain('[segment]');
  });

  it('hides capitalized or spaced segments, which could be names', () => {
    expect(sanitizeUrl('/member/Jones', BASE, NONE)).not.toContain('Jones');
    expect(sanitizeUrl('/member/bob%20jones', BASE, NONE)).not.toMatch(/bob|jones/);
  });

  it('hides a lowercase segment or key matching a known name', () => {
    const names = new Set(['jones']);
    expect(sanitizeUrl('/member/jones', BASE, names)).not.toContain('jones');
    expect(sanitizeUrl('/member?jones=1', BASE, names)).not.toContain('jones');
  });

  it('hides other hosts', () => {
    expect(sanitizeUrl('https://evil.example/path', BASE, NONE)).toBe('[other-host]/path');
    expect(sanitizeUrl('https://churchofjesuschrist.org.evil.example/', BASE, NONE)).toContain('[other-host]');
  });

  it('survives a malformed URL', () => {
    expect(sanitizeUrl('http://', BASE, NONE)).toBe('[url]');
  });
});

describe('isSameOriginPath', () => {
  it.each(['/api/report', '/ministering?type=EQ'])('allows %s', (path) => {
    expect(isSameOriginPath(path)).toBe(true);
  });

  it.each(['//evil.example/x', '/\\evil.example', 'https://evil.example', 'api/report', '', '/a b', '/\tevil'])(
    'rejects %j',
    (path) => {
      expect(isSameOriginPath(path)).toBe(false);
    },
  );
});
