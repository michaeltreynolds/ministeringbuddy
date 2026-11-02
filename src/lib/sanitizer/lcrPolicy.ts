import type { SanitizerPolicy } from './policy';

// Strings seen on LCR's unassigned ministering page. Field rules get added once real shapes are captured.
export const LCR_POLICY: SanitizerPolicy = {
  fields: {},
  labels: ['Unassigned Ministering Brothers', 'Unassigned Households', 'Sort By', 'Age'],
  labelPatterns: [/^Count: \d{1,4}$/],
  personSelectors: ['td a'],
};
