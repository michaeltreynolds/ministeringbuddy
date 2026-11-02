// Stable fake names for one browser session. The mapping stays in this object and is never serialized.

export type PseudonymKind = 'Person' | 'Household' | 'Id' | 'string' | 'text' | 'key';

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export class Pseudonymizer {
  #assigned = new Map<string, number>();
  #counts = new Map<PseudonymKind, number>();

  number(kind: PseudonymKind, raw: string): number {
    const key = `${kind}:${normalize(raw)}`;
    const existing = this.#assigned.get(key);
    if (existing !== undefined) return existing;
    const next = (this.#counts.get(kind) ?? 0) + 1;
    this.#counts.set(kind, next);
    this.#assigned.set(key, next);
    return next;
  }

  name(kind: 'Person' | 'Household' | 'Id', raw: string): string {
    return `${kind}_${this.number(kind, raw)}`;
  }

  toJSON(): string {
    return '[Pseudonymizer]';
  }
}
