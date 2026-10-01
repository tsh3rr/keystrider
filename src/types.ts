/** One logged keypress. All fields are plain data so they serialize cleanly. */
export interface KeystrokeEvent {
  id?: number;
  sessionId: string;
  /** Wall-clock time in ms since epoch. */
  timestamp: number;
  /** Index into the target text where the key was pressed. */
  position: number;
  /** Character the user should have typed. */
  expected: string;
  /** Character (or key name) the user actually typed. */
  actual: string;
  /** Expected character at the previous position (bigram context), or null at the start. */
  prevExpected: string | null;
  /** The key actually typed on the previous keypress, or null for the first one. */
  prevActual: string | null;
  /** Milliseconds since the previous keypress in this session, or null for the first one. */
  latencyMs: number | null;
  correct: boolean;
}
