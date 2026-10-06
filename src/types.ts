/**
 * What the user is practising: the language of the text and the keyboard
 * layout they type it on. Every keystroke carries both so stats from
 * different languages or layouts never get mixed.
 */
export interface PracticeContext {
  /** BCP 47 language tag of the practice text, e.g. "en" or "pl". */
  language: string;
  /** Keyboard layout id, e.g. "qwerty-us". */
  layout: string;
}

/** One logged keypress. All fields are plain data so they serialize cleanly. */
export interface KeystrokeEvent extends PracticeContext {
  id?: number;
  sessionId: string;
  /** Wall-clock time in ms since epoch. */
  timestamp: number;
  /** Index into the target text where the key was pressed. */
  position: number;
  /** Character the user should have typed. */
  expected: string;
  /** Character the user actually typed (NFC-normalized, so "é" from a dead key equals a precomposed "é"). */
  actual: string;
  /**
   * Physical key that produced `actual` (`KeyboardEvent.code`, e.g. "KeyA"),
   * independent of layout. Null when the browser did not report one.
   */
  code: string | null;
  /** Expected character at the previous position (bigram context), or null at the start. */
  prevExpected: string | null;
  /** The key actually typed on the previous keypress, or null for the first one. */
  prevActual: string | null;
  /** Milliseconds since the previous keypress in this session, or null for the first one. */
  latencyMs: number | null;
  correct: boolean;
  /** Keyboard profile it was typed on (see keyboards.ts); absent means the main keyboard. */
  keyboard?: string;
}
