// Reads the ministering data that LCR embeds in the Proposed Assignments page (its __NEXT_DATA__ script).
// Field names are documented in docs/reference/lcr-ministering-data.md.

export interface Person {
  personUuid: string;
  name: string;
}

export interface Companionship {
  id: string;
  ministers: Person[];
  assignments: Person[];
}

export interface District {
  districtUuid: string;
  districtName: string;
  companionships: Companionship[];
}

export interface MinisteringData {
  /** The draft in the Proposed Assignments sandbox. The extension works from this. */
  proposed: District[];
  /** What is published now. */
  current: District[];
  /** Every brother who can minister. */
  brothers: Person[];
  /** Every household that can be assigned ministers. */
  households: Person[];
}

type Json = Record<string, unknown>;

function people(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Json => !!item && typeof item === 'object' && typeof (item as Json).personUuid === 'string')
    .map((item) => ({ personUuid: item.personUuid as string, name: typeof item.name === 'string' ? item.name : '' }));
}

function districts(value: unknown): District[] {
  if (!Array.isArray(value)) return [];
  return value.map((district: Json) => ({
    districtUuid: String(district.districtUuid ?? ''),
    districtName: String(district.districtName ?? ''),
    companionships: (Array.isArray(district.companionships) ? district.companionships : []).map((companionship: Json) => ({
      id: String(companionship.id ?? ''),
      ministers: people(companionship.ministers),
      assignments: people(companionship.assignments),
    })),
  }));
}

export class MinisteringDataError extends Error {}

export function readMinisteringData(nextData: unknown): MinisteringData {
  const ministering = (nextData as { props?: { pageProps?: { initialState?: { ministeringData?: Json } } } })?.props?.pageProps
    ?.initialState?.ministeringData;
  if (!ministering) throw new MinisteringDataError('This page has no ministering data.');
  const eligible = (ministering.eligibleMinistersAndAssignments ?? {}) as Json;
  return {
    proposed: districts(ministering.elders),
    current: districts(ministering.currentElders),
    brothers: people(eligible.eligibleMinisters),
    households: people(eligible.eligibleAssignments),
  };
}

/** Fetches the Proposed Assignments page fresh, so edits made since the tab loaded are included. */
export async function fetchMinisteringData(): Promise<MinisteringData> {
  const response = await fetch('/ministering-proposed-assignments?lang=eng&type=EQ', { credentials: 'include' });
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const script = page.getElementById('__NEXT_DATA__');
  if (!script) throw new MinisteringDataError(`Couldn't read the Proposed Assignments page (status ${response.status}).`);
  return readMinisteringData(JSON.parse(script.textContent ?? 'null'));
}
