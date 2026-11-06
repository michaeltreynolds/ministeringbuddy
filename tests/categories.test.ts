import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeRows, groupRows, type Choice } from '../src/lib/categories';
import { MinisteringDataError, readMinisteringData } from '../src/lib/lcr/ministeringData';

// Made-up data in the shape of LCR's page. See docs/reference/lcr-ministering-data.md.
const data = readMinisteringData(JSON.parse(readFileSync('tests/fixtures/ministering-next-data.json', 'utf8')));
const categoryOf = (rows: { label: string; category: { id: string } }[], label: string) =>
  rows.find((row) => row.label === label)?.category.id;

describe('readMinisteringData', () => {
  it('reads the draft, the published assignments, brothers and households', () => {
    expect(data.proposed).toHaveLength(2);
    expect(data.current).toHaveLength(1);
    expect(data.brothers).toHaveLength(9);
    expect(data.households).toHaveLength(8);
  });

  it('says so when the page has no ministering data', () => {
    expect(() => readMinisteringData({ props: {} })).toThrow(MinisteringDataError);
  });
});

describe('computeRows', () => {
  const rows = computeRows(data, []);

  it('marks brothers in a proposed companionship as having an assignment, using the draft not the published list', () => {
    expect(categoryOf(rows.brother, 'Ellis, Ezra')).toBe('has-assignment'); // only in the draft
    expect(categoryOf(rows.brother, 'Grant, Gideon')).toBe('needs-decision');
  });

  it('marks households with ministers in the draft', () => {
    expect(categoryOf(rows.household, 'Moore Family')).toBe('has-ministers');
    expect(categoryOf(rows.household, 'Nash Family')).toBe('needs-decision');
  });

  it('finds companionships missing a companion', () => {
    expect(categoryOf(rows.companionship, 'Abbott, Aaron & Baker, Ben')).toBe('complete');
    expect(categoryOf(rows.companionship, 'Carter, Caleb')).toBe('missing-companion');
  });

  it('applies saved choices', () => {
    const choices: Choice[] = [
      { kind: 'brother', personUuid: 'p-6', category: 'on-hold', since: '' },
      { kind: 'household', personUuid: 'p-104', category: 'getting-to-know', since: '' },
      { kind: 'companionship', personUuid: 'p-2', category: 'missing-companion-ok', since: '' },
    ];
    const chosen = computeRows(data, choices);
    expect(categoryOf(chosen.brother, 'Grant, Gideon')).toBe('on-hold');
    expect(categoryOf(chosen.household, 'Nash Family')).toBe('getting-to-know');
    expect(categoryOf(chosen.companionship, 'Carter, Caleb')).toBe('missing-companion-ok');
  });

  it('lets LCR facts win over a stale choice, but remembers the choice', () => {
    const chosen = computeRows(data, [{ kind: 'brother', personUuid: 'p-0', category: 'on-hold', since: '' }]);
    const row = chosen.brother.find((r) => r.personUuid === 'p-0')!;
    expect(row.category.id).toBe('has-assignment');
    expect(row.choice).toBe('on-hold');
  });

  it('ignores a saved category that is not on the list', () => {
    const chosen = computeRows(data, [{ kind: 'brother', personUuid: 'p-6', category: 'less-active', since: '' }]);
    expect(categoryOf(chosen.brother, 'Grant, Gideon')).toBe('needs-decision');
  });

  it('keeps a brother and his household separate', () => {
    const chosen = computeRows(data, [{ kind: 'household', personUuid: 'p-6', category: 'on-hold', since: '' }]);
    expect(categoryOf(chosen.brother, 'Grant, Gideon')).toBe('needs-decision');
  });
});

describe('groupRows', () => {
  it('puts the groups that need a decision first and leaves out empty groups', () => {
    const groups = groupRows('brother', computeRows(data, [])['brother']);
    expect(groups[0]!.category.id).toBe('needs-decision');
    expect(groups.map((group) => group.category.id)).toEqual(['needs-decision', 'has-assignment']);
  });

  it('puts missing companions first', () => {
    expect(groupRows('companionship', computeRows(data, []).companionship)[0]!.category.id).toBe('missing-companion');
  });
});
