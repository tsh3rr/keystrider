import type { KeystrokeEvent } from './types';

/**
 * Tracks progress through one target text and turns each keypress into a
 * KeystrokeEvent. Pure logic, no DOM or storage, so it is easy to test.
 *
 * Errors do not advance the cursor: the user must type the correct key
 * before moving on.
 */
export class TypingSession {
  readonly id: string;
  readonly text: string;
  position = 0;
  errors = 0;
  startedAt: number | null = null;
  private lastTime: number | null = null;
  private lastActual: string | null = null;

  constructor(text: string, id: string = newSessionId()) {
    this.text = text;
    this.id = id;
  }

  get done(): boolean {
    return this.position >= this.text.length;
  }

  /** Registers a typed character. Returns the event, or null if the text is finished. */
  press(actual: string, now: number = Date.now()): KeystrokeEvent | null {
    if (this.done) return null;
    if (this.startedAt === null) this.startedAt = now;

    const expected = this.text[this.position];
    const correct = actual === expected;
    const event: KeystrokeEvent = {
      sessionId: this.id,
      timestamp: now,
      position: this.position,
      expected,
      actual,
      prevExpected: this.position > 0 ? this.text[this.position - 1] : null,
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
