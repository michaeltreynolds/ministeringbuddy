import type { LeakFindings } from './leakScan';

/** A blocked result has counts only, never the text that was caught. */
export type SanitizeResult = { ok: true; output: string } | { ok: false; findings: LeakFindings };
