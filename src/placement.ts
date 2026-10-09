import type { Corpus } from './corpus';
import {
  DEFAULT_DRILL_PARAMS, TIERS, drillResult, eligibleWords, initialCurriculum, tierTargetMs, unlockSteps,
  type CurriculumState, type DrillParams,
} from './drill';
import { PLACEMENT_MIN_ACCURACY, PLACEMENT_MIN_WPM, PLACEMENT_WORDS } from './handoff';
import { firstAttempts } from './weakness';
import type { KeystrokeEvent, PracticeContext } from './types';

/**
 * First-run placement test: one short text of common words that uses every
 * letter a few times, typed once. From it the learner either starts at the
 * beginning (six letters, level 1) or skips ahead: the level sits a little
 * under their speed, as in `initialCurriculum`, and every letter in unlock
 * order they already type cleanly is unlocked, stopping at the first one
 * they miss or hunt for.
 *
 * A one-minute test gives each letter only a few tries, far below the
 * evidence the regular unlock bar asks for, so the bar here is looser and
 * the regular drills sort out whatever it lets through.
 */

export interface PlacementParams {
  /** Words in the test text. */
  words: number;
  /** Each letter should appear at least this often, where common words allow. */
  minPerLetter: number;
  /** Only the language's most common words are used. */
  commonWords: number;
  /** Below this speed or accuracy the learner starts at the beginning. */
  minWpm: number;
  minAccuracy: number;
  /** A letter passes with at most this many first-try errors and at most this error rate. */
  maxLetterErrors: number;
  maxLetterErrorRate: number;
  /** ... and a typical time under this multiple of the placed level's per-key target. */
  latencySlack: number;
}

export const DEFAULT_PLACEMENT_PARAMS: Readonly<PlacementParams> = Object.freeze({
  words: PLACEMENT_WORDS,
  minPerLetter: 2,
  commonWords: 3000,
  minWpm: PLACEMENT_MIN_WPM,
  minAccuracy: PLACEMENT_MIN_ACCURACY,
  maxLetterErrors: 1,
  maxLetterErrorRate: 0.34,
  latencySlack: 2,
});

/** The letters of the language that the layout can type, in unlock order. */
function letterSteps(corpus: Corpus, layout: string): string[] {
  return unlockSteps(corpus, layout).filter((s) => /^\p{L}$/u.test(s));
}

/**
 * The placement text: common lowercase words, chosen so every letter shows
 * up at least `minPerLetter` times (rare letters come from the most common
 * word that has them), then shuffled. `before` is what was typed in an
 * earlier line of the same placement, whose letters already count.
 */
export function placementText(
  corpus: Corpus,
  layout: string,
  rand: () => number = Math.random,
  p: PlacementParams = DEFAULT_PLACEMENT_PARAMS,
  before = '',
): string {
  const letters = letterSteps(corpus, layout);
  const pool = eligibleWords(corpus, new Set(letters)).slice(0, p.commonWords);
  // Letters already typed in an earlier line of the same placement count towards the minimum.
  const counts = new Map<string, number>();
  for (const c of before) counts.set(c, (counts.get(c) ?? 0) + 1);
  const picked: string[] = [];
  const take = (w: string) => {
    picked.push(w);
    for (const c of w) counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  // Rarest letters first, so their words also cover common letters.
  for (const letter of [...letters].reverse()) {
    while ((counts.get(letter) ?? 0) < p.minPerLetter && picked.length < p.words) {
      const w = pool.find((x) => x.includes(letter) && x.length > 1 && !picked.includes(x)) ??
        pool.find((x) => x.includes(letter) && !picked.includes(x));
      if (!w) break;
      take(w);
    }
  }
  // Fill up with words picked at random from the most common ones.
  const common = pool.slice(0, 300).filter((w) => w.length > 1);
  for (let tries = 0; picked.length < p.words && tries < 1000 && common.length > 0; tries++) {
    const w = common[Math.floor(rand() * common.length)];
    if (!picked.includes(w)) take(w);
  }
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.join(' ');
}

/**
 * The opening line of a placement on a first visit: only very common words,
 * so a beginner meets nothing strange. Whoever turns out fast enough to skip
 * ahead types `placementText` with the remaining words next, which brings in
 * the rarer letters.
 */
export function quickText(corpus: Corpus, layout: string, words: number, rand: () => number = Math.random): string {
  const common = eligibleWords(corpus, new Set(letterSteps(corpus, layout))).slice(0, 200).filter((w) => w.length > 1);
  const picked: string[] = [];
  for (let tries = 0; picked.length < words && tries < 1000 && common.length > 0; tries++) {
    const w = common[Math.floor(rand() * common.length)];
    if (!picked.includes(w)) picked.push(w);
  }
  return picked.join(' ');
}

export interface Placement {
  state: CurriculumState;
  wpm: number;
  accuracy: number;
  /** Whether the learner skipped ahead, i.e. more than the start keys or a higher level. */
  skipped: boolean;
  /** The first letter that held the placement back, if any. */
  stoppedAt: string | null;
}

/**
 * Speed and accuracy over the placement's lines. A placement can be typed in
 * two lines with a pause between (the landing page's, then the rest in the
 * trainer), so speed counts the time spent typing each line, not the pause.
 */
export function placementResult(events: readonly KeystrokeEvent[]): { wpm: number; accuracy: number } {
  const lines = new Map<string, KeystrokeEvent[]>();
  for (const e of events) lines.set(e.sessionId, [...(lines.get(e.sessionId) ?? []), e]);
  let minutes = 0;
  let words = 0;
  for (const line of lines.values()) {
    const { wpm } = drillResult(line);
    const typed = Math.max(line.filter((e) => e.correct).length - 1, 0) / 5;
    if (wpm > 0) {
      words += typed;
      minutes += typed / wpm;
    }
  }
  return { wpm: minutes > 0 ? words / minutes : 0, accuracy: drillResult(events).accuracy };
}

/** Places the learner from the keystrokes of a typed placement text (one line or several). */
export function placeFromTest(
  events: readonly KeystrokeEvent[],
  corpus: Corpus,
  context: PracticeContext,
  p: PlacementParams = DEFAULT_PLACEMENT_PARAMS,
  dp: DrillParams = DEFAULT_DRILL_PARAMS,
): Placement {
  const state = initialCurriculum(corpus, context, undefined, dp);
  const { wpm, accuracy } = placementResult(events);
  if (events.length === 0 || wpm < p.minWpm || accuracy < p.minAccuracy) {
    return { state, wpm, accuracy, skipped: false, stoppedAt: null };
  }

  state.tier = Math.max(1, TIERS.filter((w) => w <= wpm * 0.8).length);
  state.paceWpm = Math.max(TIERS[0], Math.round(wpm));
  const maxMs = tierTargetMs(state.tier) * p.latencySlack;

  const stats = new Map<string, { n: number; errors: number; logs: number[] }>();
  for (const a of firstAttempts(events)) {
    const s = stats.get(a.expected) ?? { n: 0, errors: 0, logs: [] };
    s.n++;
    if (a.error) s.errors++;
    if (a.logLatency !== null) s.logs.push(a.logLatency);
    stats.set(a.expected, s);
  }
  const passes = (letter: string) => {
    const s = stats.get(letter);
    if (!s || s.n === 0) return false;
    if (s.errors > p.maxLetterErrors || s.errors / s.n > p.maxLetterErrorRate) return false;
    if (s.logs.length === 0) return true;
    const sorted = [...s.logs].sort((a, b) => a - b);
    return Math.exp(sorted[Math.floor(sorted.length / 2)]) <= maxMs;
  };

  let stoppedAt: string | null = null;
  for (const letter of letterSteps(corpus, context.layout).slice(dp.startKeys)) {
    if (!passes(letter)) {
      stoppedAt = letter;
      break;
    }
    state.unlocked.push(letter);
  }
  return { state, wpm, accuracy, skipped: state.unlocked.length > dp.startKeys || state.tier > 1, stoppedAt };
}
