/**
 * The small live pictures on the feature cards: built from the app's own
 * pieces (keycaps, tabs, the coach bar's chip, the week circles), not from
 * illustrations. render.ts draws each one at its last frame, which is what
 * search engines, reduced motion and a page without scripts see; main.ts
 * steps each card through its frames once when it scrolls into view.
 *
 * Shared by both, so the frames are the same: pure data, no DOM.
 */

/** Frames per card, in order: layouts, finger guide, placement, progress, week, sync. */
export const STEPS = [4, 3, 3, 2, 5, 2] as const;

/** Letters the placement picture has unlocked after each frame: the first six, then the skipped ones. */
export const PLACED = [6, 10, 15, 19] as const;
export const PLACE_CELLS = 26;

/** Days ticked off in the week picture, Monday first, in the order they fill. */
export const WEEK_DONE = [0, 1, 3, 4, 5] as const;
export const WEEK_GOAL = 5;

/** Heat level of the progress picture's keys before practice; one level lower after. */
export const HEAT_LEVELS = [1, 0, 2, 0, 4, 1] as const;

export type FingerTint = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';

/** What the pictures need from the page's language and layout (render.ts builds it). */
export interface VignetteData {
  /** QWERTZ, AZERTY, QWERTY, Dvorak: their first six letter keys and a caption. */
  tabs: { name: string; keys: string[]; caption: string }[];
  /** The tab of the page's own layout, which the picture ends on. */
  start: number;
  /** One row of the layout: key, finger tint, and whether it reads as already learnt. */
  row: { ch: string; tint: FingerTint; known: boolean }[];
  word: string;
  /** Finger name for each letter of `word`. */
  wordFingers: string[];
  placing: string;
  skipped: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
  lang: string;
}

/** Index of the active layout tab at a step. */
export const tabAt = (d: VignetteData, step: number): number => (d.start + step) % d.tabs.length;

/** The letters of QWERTY's top row, which the layout picture compares against. */
export const QWERTY_TOP = 'qwerty';

/** "13 Tasten übersprungen", in the page's plural form. */
export function skippedText(d: VignetteData, n: number): string {
  const form = new Intl.PluralRules(d.lang).select(n);
  return (d.skipped[form] ?? d.skipped.other).replace('{n}', String(n));
}
