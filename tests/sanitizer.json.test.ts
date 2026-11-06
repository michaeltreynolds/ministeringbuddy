import { describe, expect, it } from 'vitest';
import { Pseudonymizer, sanitizeJson, type SanitizerPolicy } from '../src/lib/sanitizer';

const EMPTY: SanitizerPolicy = { fields: {}, labels: [], labelPatterns: [], personSelectors: [] };
const FIELDS: SanitizerPolicy = {
  ...EMPTY,
  fields: {
    members: { kind: 'structure' },
    name: { kind: 'person' },
    household: { kind: 'household' },
    memberId: { kind: 'id' },
    age: { kind: 'age' },
    count: { kind: 'number' },
    assigned: { kind: 'boolean' },
    status: { kind: 'enum', values: ['ACTIVE', 'PROPOSED'] },
    moveDate: { kind: 'date' },
  },
};

function run(raw: unknown, policy = FIELDS, session = new Pseudonymizer()): string {
  const result = sanitizeJson(raw, policy, session);
  if (!result.ok) throw new Error(`blocked: ${JSON.stringify(result.findings)}`);
  return result.output;
}

describe('sanitizeJson: fail closed', () => {
  it('redacts every value under an unknown key', () => {
    const output = run(
      { phone: '801-555-0100', email: 'bob@example.com', address: '123 Maple St', note: 'Lost his job', id: 12345678 },
      EMPTY,
    );
    for (const secret of ['801-555', 'bob', 'example', 'Maple', 'Lost', 'job', '12345678']) {
      expect(output).not.toContain(secret);
    }
  });

  it('hides unknown key names by default', () => {
    expect(run({ lostHisJob: true }, EMPTY)).not.toContain('lostHisJob');
  });

  it('hides booleans under unknown keys', () => {
    expect(run({ x: true }, EMPTY)).not.toContain('true');
  });

  it('hides maps keyed by name or by ID', () => {
    const output = run({ 'Jones, Bob': 1, Keller: 2, '3141592653': 3 }, EMPTY);
    for (const secret of ['Jones', 'Bob', 'Keller', '3141592653']) expect(output).not.toContain(secret);
  });

  it('survives cycles, depth bombs, and odd types without leaking', () => {
    const cycle: Record<string, unknown> = { secret: 'Jones' };
    cycle.self = cycle;
    expect(run(cycle, EMPTY)).toContain('[cycle]');
    let deep: unknown = 'Jones';
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(run(deep, EMPTY)).not.toContain('Jones');
    expect(run({ a: () => 'Jones', b: undefined, c: Symbol('Jones'), d: new Date(0) }, EMPTY)).not.toContain('Jones');
  });

  it('does not let __proto__ through or pollute objects', () => {
    const raw = JSON.parse('{"__proto__": {"polluted": "Jones"}}');
    expect(run(raw, EMPTY)).not.toContain('Jones');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not treat inherited names such as constructor as allowed', () => {
    const raw = JSON.parse('{"constructor": "Jones", "toString": "Keller"}');
    expect(run(raw, EMPTY)).not.toMatch(/Jones|Keller|constructor/);
  });
});

describe('sanitizeJson: rules', () => {
  it('gives stable pseudonyms that ignore case and spacing', () => {
    const raw = { members: [{ name: 'Jones, Bob' }, { name: ' jones,  BOB ' }, { name: 'Keller, Barnaby' }] };
    const output = JSON.parse(run(raw));
    expect(output.members.map((m: { name: string }) => m.name)).toEqual(['Person_1', 'Person_1', 'Person_2']);
  });

  it('keeps pseudonyms stable across calls in one session', () => {
    const session = new Pseudonymizer();
    const first = JSON.parse(run({ name: 'Jones, Bob' }, FIELDS, session));
    run({ name: 'Keller, Barnaby' }, FIELDS, session);
    expect(JSON.parse(run({ name: 'Jones, Bob' }, FIELDS, session))).toEqual(first);
  });

  it('never serializes the mapping', () => {
    const session = new Pseudonymizer();
    run({ name: 'Jones, Bob' }, FIELDS, session);
    expect(JSON.stringify({ session })).not.toMatch(/jones/i);
    expect(JSON.stringify(Object.entries(session))).not.toMatch(/jones/i);
  });

  it('turns ages into bands', () => {
    expect(JSON.parse(run({ age: 68 })).age).toBe('60s');
    expect(JSON.parse(run({ age: 'not an age' })).age).toBe('[age]');
  });

  it('passes enum values only when listed', () => {
    expect(run({ status: 'ACTIVE' })).toContain('ACTIVE');
    expect(run({ status: 'Jones' })).not.toContain('Jones');
  });

  it('redacts a value of the wrong type under a typed rule', () => {
    expect(run({ count: 'Jones', assigned: 'Keller' })).not.toMatch(/Jones|Keller/);
  });

  it('does not treat an object under a person rule as safe', () => {
    expect(run({ name: { first: 'Bob', last: 'Jones' } })).not.toMatch(/Bob|Jones|first|last/);
  });

  it('redacts dates under a date rule', () => {
    expect(run({ moveDate: '2026-02-03' })).not.toContain('2026');
  });
});

describe('sanitizeJson: key discovery', () => {
  const DISCOVER = { ...EMPTY, discoverKeys: true };

  it('shows schema-like key names but never their values', () => {
    const output = run({ districtName: 'Elm', companionships: [{ legacyCmisId: 123456789 }] }, DISCOVER);
    expect(output).toContain('districtName');
    expect(output).toContain('legacyCmisId');
    expect(output).not.toMatch(/Elm|123456789/);
  });

  it('hides a key that matches any raw value', () => {
    expect(run({ jones: { spokenName: 'Bob Jones' } }, DISCOVER)).not.toMatch(/jones/i);
  });

  it('hides non-identifier keys', () => {
    expect(run({ 'Jones, Bob': 1, '12345': 2 }, DISCOVER)).not.toMatch(/Jones|12345/);
  });

  it('treats a very wide object as a map, not a schema', () => {
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`bob${i}`, 1]));
    expect(run(wide, DISCOVER)).not.toContain('bob0');
  });

  it('hides a key matching a caller-supplied name', () => {
    expect(run({ jones: 1 }, { ...DISCOVER, extraSensitive: ['Bob Jones'] })).not.toMatch(/jones/i);
  });
});

describe('sanitizeJson: leak scan as second line', () => {
  it('blocks a label that is really an email, and reports no value', () => {
    const policy = { ...EMPTY, labels: ['bob.jones@example.com'] };
    const result = sanitizeJson('bob.jones@example.com', policy, new Pseudonymizer());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/bob|jones|example/i);
  });

  it.each([
    ['phone', 'Call 801-555-0100'],
    ['phone', '(801) 555-0100'],
    ['membership-number', '123-4567-8901'],
    ['long-digits', '3141592653'],
    ['long-token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc'],
    ['street-address', '123 N Maple Tree Street'],
  ])('blocks %s passed through a bad label pattern', (kind, value) => {
    const result = sanitizeJson(value, { ...EMPTY, labelPatterns: [/.*/] }, new Pseudonymizer());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings).toHaveProperty(kind);
  });

  it('blocks a known name passed through a bad label, even when its words are on the safe list', () => {
    const policy = { ...EMPTY, labels: ['Jones, Bob'], extraSensitive: ['Jones, Bob'] };
    expect(sanitizeJson('Jones, Bob', policy, new Pseudonymizer()).ok).toBe(false);
  });

  it('matches names regardless of accents and case', () => {
    const policy = { ...EMPTY, labelPatterns: [/^jose$/], extraSensitive: ['JOSÉ'] };
    expect(sanitizeJson('jose', policy, new Pseudonymizer()).ok).toBe(false);
  });

  it('matches a short name whose accent would otherwise split it', () => {
    const policy = { ...EMPTY, labelPatterns: [/^noel$/], extraSensitive: ['Noël'] };
    expect(sanitizeJson('noel', policy, new Pseudonymizer()).ok).toBe(false);
  });

  it('catches a run-together form of a redacted value in a bad label', () => {
    const policy = { ...EMPTY, labelPatterns: [/^BobJones$/] };
    expect(sanitizeJson({ a: 'Jones', b: 'BobJones' }, policy, new Pseudonymizer()).ok).toBe(false);
  });
});

describe('sanitizeJson: name collisions must not block normal output', () => {
  it('allows a member surnamed like the output vocabulary', () => {
    const policy: SanitizerPolicy = {
      ...EMPTY,
      labels: ['Unassigned Ministering Brothers'],
      fields: { name: { kind: 'person' } },
    };
    const output = run({ title: 'Unassigned Ministering Brothers', people: [{ name: 'Brothers, String' }] }, policy);
    expect(output).toContain('Unassigned Ministering Brothers');
    expect(output).toContain('Person_1');
  });
});

describe('sanitizeJson: randomized canaries', () => {
  // Any canary reaching the output is a failure. A block counts as safe.
  const CANARIES = ['Zebulon Quackenbush', 'zquack@example.com', '801-555-0177', '123-4567-8901', '555 Canary Lane', '9876543210'];

  function mulberry32(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(random: () => number, depth: number): unknown {
    const pick = random();
    const canary = CANARIES[Math.floor(random() * CANARIES.length)] as string;
    if (depth > 5 || pick < 0.3) return canary;
    if (pick < 0.4) return Number(canary.replace(/\D/g, '')) || 7;
    if (pick < 0.7) return Array.from({ length: Math.floor(random() * 4) }, () => generate(random, depth + 1));
    const useKey = random();
    const key = useKey < 0.3 ? canary : useKey < 0.6 ? 'name' : useKey < 0.8 ? 'status' : `field${depth}`;
    return { [key]: generate(random, depth + 1), other: generate(random, depth + 1) };
  }

  it.each([false, true])('never emits a canary (discoverKeys=%s)', (discoverKeys) => {
    const random = mulberry32(452);
    const parts = CANARIES.flatMap((c) => c.split(/[\s@-]+/)).filter((p) => p.length >= 4);
    let passed = 0;
    for (let i = 0; i < 2000; i++) {
      const result = sanitizeJson(generate(random, 0), { ...FIELDS, discoverKeys }, new Pseudonymizer());
      if (!result.ok) continue;
      passed++;
      for (const part of parts) expect(result.output.toLowerCase()).not.toContain(part.toLowerCase());
    }
    expect(passed).toBeGreaterThan(1000); // the sanitizer must redact, not just block everything
  });
});

describe('sanitizeJson: false alarms seen on real LCR data', () => {
  const DISCOVER = { ...EMPTY, discoverKeys: true };

  it('does not block when a marker counter equals a real ID', () => {
    // 12,346 distinct strings push the marker counter past an ID that is also in the data.
    const raw = { ids: [12345678, 23456], values: Array.from({ length: 12346 }, (_, i) => `value ${i}`) };
    expect(sanitizeJson(raw, EMPTY, new Pseudonymizer()).ok).toBe(true);
  });

  it('does not block when a raw word appears inside a camelCase field name', () => {
    const output = run({ householdId: 'x', assignmentList: 'x', label: 'House Sign' }, DISCOVER);
    expect(output).toContain('householdId');
    expect(output).toContain('assignmentList');
    expect(output).not.toMatch(/House|Sign/);
  });

  it('hides a run-together key that contains a raw word', () => {
    expect(run({ smithjones: 1, owner: 'Bob Jones' }, DISCOVER)).not.toMatch(/smithjones/);
  });
});

describe('sanitizeJson: keys hidden in a wide map stay hidden elsewhere', () => {
  it('hides a field name that is also a key in a map keyed by person', () => {
    const byPerson = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`person${i}`, 1]));
    byPerson.jones = 1;
    const result = sanitizeJson({ byPerson, profile: { jones: 1 } }, { ...EMPTY, discoverKeys: true }, new Pseudonymizer());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).not.toMatch(/jones/i);
  });
});

describe('sanitizeJson: repeated field names are schema', () => {
  const DISCOVER = { ...EMPTY, discoverKeys: true };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ pageProps: i, name: `Row name ${i}` }));

  it('shows a field name found in several objects, even if its words appear in values', () => {
    const output = run({ rows: rows(3), title: 'Page props and name' }, DISCOVER);
    expect(output).toContain('pageProps');
    expect(output).toContain('"name"');
    expect(output).not.toMatch(/Row|Page props/);
  });

  it('still hides a field name seen only once if its words appear in values', () => {
    expect(run({ rows: rows(1), title: 'Page props' }, DISCOVER)).not.toContain('pageProps');
  });

  it('never shows a known name as a field name, however often it repeats', () => {
    const raw = { a: { jones: 1 }, b: { jones: 2 }, c: { jones: 3 } };
    const result = sanitizeJson(raw, { ...DISCOVER, extraSensitive: ['Jones, Bob'] }, new Pseudonymizer());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).not.toMatch(/jones/i);
  });
});

describe('sanitizeJson: ID-like field names', () => {
  it('hides keys that look like IDs, even when they repeat', () => {
    const id = 'a3f9c2e1b7d04e5f8a6b9c0d1e2f3a4b';
    const output = run({ x: { [id]: 1 }, y: { [id]: 2 }, z: { [id]: 3 }, w: { m12345678: 1 } }, { ...EMPTY, discoverKeys: true });
    expect(output).not.toContain(id);
    expect(output).not.toContain('12345678');
  });

  it('allows a short numeric suffix', () => {
    expect(run({ address2: 1 }, { ...EMPTY, discoverKeys: true })).toContain('address2');
  });
});

describe('leak scan: long tokens', () => {
  it('does not mistake a long camelCase field name for a token', () => {
    const key = 'ministeringAssignmentsUnassignedList'; // 35 letters
    const output = run({ a: { [key]: 1 }, b: { [key]: 2 }, c: { [key]: 3 } }, { ...EMPTY, discoverKeys: true });
    expect(output).toContain(key);
  });

  it('still blocks a long token with digits', () => {
    const policy = { ...EMPTY, labelPatterns: [/.*/] };
    expect(sanitizeJson('abc123def456ghi789jkl012mno345pqr678', policy, new Pseudonymizer()).ok).toBe(false);
  });
});
