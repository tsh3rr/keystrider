import type { KeystrokeEvent } from './types';

/**
 * The first line typed on a landing page is the start of the placement test.
 * The landing page leaves its keystrokes here and the trainer picks them up
 * on the first visit (see Onboarding.openQuick), so nobody types it twice.
 *
 * Small on purpose: the landing page imports it, and should not pull in the
 * trainer's drill code.
 */

/** Below this speed or accuracy the placement starts at the beginning (placement.ts uses the same bar). */
export const PLACEMENT_MIN_WPM = 20;
export const PLACEMENT_MIN_ACCURACY = 0.9;

/** Whether a first result is enough to skip ahead, so the placement test is worth finishing. */
export const canSkipAhead = (wpm: number, accuracy: number): boolean =>
  wpm >= PLACEMENT_MIN_WPM && accuracy >= PLACEMENT_MIN_ACCURACY;

/** Words in the whole placement test; a landing line counts towards it. */
export const PLACEMENT_WORDS = 36;

export interface LandingTest {
  language: string;
  layout: string;
  /** "detected" when the keys pressed showed the layout, else a guess from the browser language. */
  layoutSource: 'detected' | 'guessed';
  events: KeystrokeEvent[];
  savedAt: number;
}

const KEY = 'typing-trainer.landing-test';
/** An old line says little about today, and should not surprise someone weeks later. */
const MAX_AGE_MS = 24 * 60 * 60_000;

export function saveLandingTest(test: LandingTest): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(test));
  } catch {
    // Storage blocked: the trainer starts its own placement instead.
  }
}

/** The landing page's line, once: it is removed as it is read. */
export function takeLandingTest(now = Date.now()): LandingTest | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    const test = raw ? (JSON.parse(raw) as LandingTest) : null;
    if (!test || !Array.isArray(test.events) || test.events.length === 0 || now - test.savedAt > MAX_AGE_MS) return null;
    return test;
  } catch {
    return null;
  }
}

/** Words typed so far in a placement made of these keystrokes (whole words only). */
export function wordsTyped(events: readonly KeystrokeEvent[]): number {
  const sessions = new Map<string, number>();
  for (const e of events) {
    if (e.correct && e.expected === ' ') sessions.set(e.sessionId, (sessions.get(e.sessionId) ?? 0) + 1);
    else if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, 0);
  }
  // Each finished line ends on a word without a trailing space.
  return [...sessions.values()].reduce((sum, spaces) => sum + spaces + 1, 0);
}
