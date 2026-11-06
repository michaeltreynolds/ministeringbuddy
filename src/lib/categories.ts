// The fixed category list. A category says what the situation is, or records a person's own request.
// It never records their circumstances. Facts LCR already knows are computed, not stored.
import type { MinisteringData, Person } from './lcr/ministeringData';

export type Kind = 'brother' | 'household' | 'companionship';

export interface CategoryDef {
  id: string;
  label: string;
  icon: string;
  /** Computed from LCR, or chosen by the presidency. */
  source: 'lcr' | 'manual';
  /** Shown first, because someone needs to decide. */
  needsDecision?: boolean;
}

export const NEEDS_DECISION: CategoryDef = { id: 'needs-decision', label: 'Needs a decision', icon: '❓', source: 'lcr', needsDecision: true };

export const CATEGORIES: Record<Kind, CategoryDef[]> = {
  brother: [
    NEEDS_DECISION,
    { id: 'has-assignment', label: 'Has an assignment', icon: '✅', source: 'lcr' },
    // Manual until LCR's callings can be read; then it will be computed.
    { id: 'bishop', label: 'Bishop', icon: '⛪', source: 'manual' },
    { id: 'getting-to-know', label: 'Getting to know them', icon: '👋', source: 'manual' },
    { id: 'on-hold', label: 'On hold', icon: '⏸️', source: 'manual' },
    { id: 'asked-not-to-serve', label: 'Asked not to have an assignment', icon: '🙅', source: 'manual' },
  ],
  household: [
    NEEDS_DECISION,
    { id: 'has-ministers', label: 'Has ministers', icon: '✅', source: 'lcr' },
    { id: 'getting-to-know', label: 'Getting to know them', icon: '👋', source: 'manual' },
    { id: 'on-hold', label: 'On hold', icon: '⏸️', source: 'manual' },
  ],
  companionship: [
    { id: 'missing-companion', label: 'Missing companion', icon: '❓', source: 'lcr', needsDecision: true },
    { id: 'complete', label: 'Complete', icon: '✅', source: 'lcr' },
    { id: 'missing-companion-ok', label: 'Missing companion, OK', icon: '👍', source: 'manual' },
  ],
};

export function manualCategories(kind: Kind): CategoryDef[] {
  return CATEGORIES[kind].filter((category) => category.source === 'manual');
}

/** A saved choice. Companionship choices are stored on the minister who is alone. */
export interface Choice {
  kind: Kind;
  personUuid: string;
  category: string;
  since: string;
}

export function choiceId(kind: Kind, personUuid: string): string {
  return `${kind}-${personUuid}`;
}

export interface Row {
  kind: Kind;
  /** The person a choice is saved against. */
  personUuid: string;
  label: string;
  category: CategoryDef;
  /** The saved manual choice, if any. A computed fact can override it, such as having an assignment. */
  choice?: string;
}

export interface Group {
  category: CategoryDef;
  rows: Row[];
}

function categoryFor(kind: Kind, id: string): CategoryDef {
  return CATEGORIES[kind].find((category) => category.id === id) ?? NEEDS_DECISION;
}

function choose(kind: Kind, person: Person, computed: string | null, choices: Map<string, Choice>): Row {
  const choice = choices.get(choiceId(kind, person.personUuid))?.category;
  const id = computed ?? (choice && manualCategories(kind).some((c) => c.id === choice) ? choice : NEEDS_DECISION.id);
  return { kind, personUuid: person.personUuid, label: person.name, category: categoryFor(kind, id), choice };
}

export function computeRows(data: MinisteringData, choiceList: Choice[]): Record<Kind, Row[]> {
  const choices = new Map(choiceList.map((choice) => [choiceId(choice.kind, choice.personUuid), choice]));
  const companionships = data.proposed.flatMap((district) => district.companionships);
  const ministering = new Set(companionships.flatMap((c) => c.ministers.map((m) => m.personUuid)));
  const ministered = new Set(companionships.flatMap((c) => c.assignments.map((a) => a.personUuid)));

  const brothers = data.brothers.map((brother) =>
    choose('brother', brother, ministering.has(brother.personUuid) ? 'has-assignment' : null, choices),
  );
  const households = data.households.map((household) =>
    choose('household', household, ministered.has(household.personUuid) ? 'has-ministers' : null, choices),
  );
  const pairs = companionships
    .filter((companionship) => companionship.ministers.length > 0)
    .map((companionship) => {
      const anchor = companionship.ministers[0]!;
      const label = companionship.ministers.map((minister) => minister.name).join(' & ');
      const computed = companionship.ministers.length >= 2 ? 'complete' : null;
      const row = choose('companionship', { personUuid: anchor.personUuid, name: label }, computed, choices);
      return row.category.id === NEEDS_DECISION.id ? { ...row, category: categoryFor('companionship', 'missing-companion') } : row;
    });
  return { brother: brothers, household: households, companionship: pairs };
}

/** Rows grouped by category, in list order, with the groups that need a decision first. Empty groups are left out. */
export function groupRows(kind: Kind, rows: Row[]): Group[] {
  const order = [...CATEGORIES[kind]].sort((a, b) => Number(!!b.needsDecision) - Number(!!a.needsDecision));
  return order
    .map((category) => ({
      category,
      rows: rows.filter((row) => row.category.id === category.id).sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter((group) => group.rows.length > 0);
}
