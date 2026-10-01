import type { KeystrokeEvent, PracticeContext } from './types';

/**
 * Tracks progress through one target text and turns each keypress into a
 * KeystrokeEvent. Pure logic, no DOM or storage, so it is easy to test.
 *
 * Errors do not advance the cursor: the user must type the correct key
 * before moving on.
 *
 * Positions index Unicode code points, not UTF-16 units, and text and input
 * are NFC-normalized so accented letters compare equal however they were
 * composed.
 */
export class TypingSession {
  readonly id: string;
  readonly text: string;
  readonly context: PracticeContext;
  position = 0;
  errors = 0;
  startedAt: number | null = null;
  private lastTime: number | null = null;
  private lastActual: string | null = null;
  private readonly chars: string[];

  constructor(text: string, context: PracticeContext, id: string = newSessionId()) {
    this.text = text.normalize('NFC');
    this.chars = [...this.text];
    this.context = { language: context.language, layout: context.layout };
    this.id = id;
  }

  /** Retags keystrokes from here on, e.g. when the keyboard layout is corrected mid-text. */
  setLayout(layout: string): void {
    this.context.layout = layout;
  }

  get done(): boolean {
    return this.position >= this.chars.length;
  }

  /**
   * Registers a typed character and the physical key (`KeyboardEvent.code`)
   * that produced it. Returns the event, or null if the text is finished.
   */
  press(actual: string, now: number = Date.now(), code: string | null = null): KeystrokeEvent | null {
    if (this.done) return null;
    if (this.startedAt === null) this.startedAt = now;

    actual = actual.normalize('NFC');
    const expected = this.chars[this.position];
    const correct = actual === expected;
    const event: KeystrokeEvent = {
      sessionId: this.id,
      language: this.context.language,
      layout: this.context.layout,
      timestamp: now,
      position: this.position,
      expected,
      actual,
      code,
      prevExpected: this.position > 0 ? this.chars[this.position - 1] : null,
      prevActual: this.lastActual,
      latencyMs: this.lastTime === null ? null : now - this.lastTime,
      correct,
    };

    this.lastTime = now;
    this.lastActual = actual;
    if (correct) this.position++;
    else this.errors++;
    return event;
  }

  /** Words per minute using the standard 5-characters-per-word convention. */
  wpm(now: number = Date.now()): number {
    if (this.startedAt === null || now <= this.startedAt) return 0;
    const minutes = (now - this.startedAt) / 60000;
    return this.position / 5 / minutes;
  }

  accuracy(): number {
    const total = this.position + this.errors;
    return total === 0 ? 1 : this.position / total;
  }
}

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
