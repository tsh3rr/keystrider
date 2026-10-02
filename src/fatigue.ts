import type { KeystrokeEvent } from './types';
import { firstAttempts, type WeaknessModel } from './weakness';

/**
 * Fatigue detection: notices when typing gets worse over a practice stretch
 * and suggests a short break.
 *
 * Drills differ in difficulty (a focus burst on a new key is harder than a
 * warm-up of common words), so a raw accuracy drop says little. Each drill is
 * instead scored against what the weakness model, as it stood when the
 * stretch began, predicts for that exact text: expected first-try errors from each
 * key's error rate, expected keystroke time from each key's typical latency.
 * A ratio of 1 means "typing like you usually do". The model is held fixed
 * for the stretch, because it keeps learning from every drill and would
 * otherwise drift under the comparison. Fatigue is when the latest
 * drills' ratios are clearly worse than the same stretch's earlier drills.
 * Everything works per character, so it is the same for every language.
 *
 * Why breaks: spaced practice beats massed practice for motor skills, and
 * typing is the classic case (Baddeley & Longman 1978: postal trainees who
 * practised in short sessions learned to type faster than those in long
 * ones). Practice while tired also trains in the sloppy movements.
 */

export interface FatigueParams {
  /** A pause this long between drills ends the stretch: the learner rested. */
  restMinutes: number;
  /** Drills compared against the earlier part of the stretch. */
  recentDrills: number;
  /** Earlier drills needed before a comparison is trusted. */
  minReferenceDrills: number;
  /** Drills shorter than this (first attempts) are too noisy to score. */
  minAttempts: number;
  /** Recent error ratio must be this many times the reference ratio... */
  errorFactor: number;
  /** ...and at least this many errors more than the reference rate predicts. */
  minExtraErrors: number;
  /** Each recent drill on its own must be at least this much worse, so one bad drill is not enough. */
  eachFactor: number;
  /** Recent keystrokes this much slower than the reference (0.15 = 15%) count as slowing down... */
  slowdown: number;
  /** ...as long as accuracy did not improve by more than this factor at the same time. */
  slowdownAccuracySlack: number;
  /** Practice time in one stretch after which a break is suggested anyway. */
  longStretchMinutes: number;
  /** After "Keep going", stay quiet for this many drills. */
  snoozeDrills: number;
  /** After "Keep going" on a long stretch, the next long-stretch reminder waits this much longer. */
  snoozeMinutes: number;
  /** Suggested break length. */
  breakMinutes: number;
}

export const DEFAULT_FATIGUE_PARAMS: Readonly<FatigueParams> = Object.freeze({
  restMinutes: 3,
  recentDrills: 2,
  minReferenceDrills: 2,
  minAttempts: 20,
  errorFactor: 1.6,
  minExtraErrors: 4,
  eachFactor: 1.25,
  slowdown: 0.15,
  slowdownAccuracySlack: 1.25,
  longStretchMinutes: 30,
  snoozeDrills: 3,
  snoozeMinutes: 15,
  breakMinutes: 5,
});

/** One finished drill, scored against the model's prediction. */
export interface DrillRecord {
  kind: string;
  startedAt: number;
  endedAt: number;
  /** First attempts and how many were wrong. */
  attempts: number;
  errors: number;
  /** Errors the model expected for these characters. */
  expectedErrors: number;
  /** Clean keystrokes with a usable latency, and the sum of log(observed / expected latency) over them. */
  timedKeys: number;
  logSlowness: number;
}

/**
 * Scores a finished drill's keystrokes against `model`, the weakness model
 * built before the drill started. Keys the model has never seen count at the
 * user's overall error rate and typing speed. `slowOnPurpose` (the trainer
 * asked for slower, cleaner typing) leaves the drill's speed out.
 */
export function scoreDrill(
  events: readonly KeystrokeEvent[], model: WeaknessModel, kind: string, slowOnPurpose = false,
): DrillRecord {
  const keys = new Map(model.keys.map((k) => [k.item, k]));
  const attempts = firstAttempts(events);
  let errors = 0;
  let expectedErrors = 0;
  let timedKeys = 0;
  let logSlowness = 0;
  for (const a of attempts) {
    const k = keys.get(a.expected);
    if (a.error) errors++;
    expectedErrors += k && k.attempts > 0 ? k.errorRate : model.baseline.errorRate;
    if (a.logLatency !== null && !slowOnPurpose) {
      const expectedMs = k && k.attempts > 0 ? k.latencyMs : model.baseline.latencyMs;
      timedKeys++;
      logSlowness += a.logLatency - Math.log(expectedMs);
    }
  }
  const times = events.map((e) => e.timestamp);
  return {
    kind,
    startedAt: times.length ? Math.min(...times) : 0,
    endedAt: times.length ? Math.max(...times) : 0,
    attempts: attempts.length,
    errors,
    expectedErrors,
    timedKeys,
    logSlowness,
  };
}

export type FatigueSignal =
  | { type: 'accuracy'; accuracyBefore: number; accuracyNow: number }
  | { type: 'speed'; slowerBy: number }
  | { type: 'long'; minutes: number };

/**
 * Tracks the drills of the current practice stretch and decides when to
 * suggest a break. Pure logic over timestamps passed in, so it is easy to test.
 */
export class FatigueTracker {
  private drills: DrillRecord[] = [];
  /** The weakness model every drill of this stretch is scored against. */
  private model: WeaknessModel | null = null;
  /** Index into `drills` before which no accuracy or speed suggestion is made (after "Keep going"). */
  private quietUntil = 0;
  /** After "Keep going" on a drop, the drills before it stay the reference, so the drop is still measured from there. */
  private referenceEnd: number | null = null;
  /** Practice minutes the long-stretch reminder waits for. */
  private longAt: number;

  constructor(private readonly p: FatigueParams = DEFAULT_FATIGUE_PARAMS) {
    this.longAt = p.longStretchMinutes;
  }

  /**
   * Scores a finished drill's keystrokes and adds it. `model` is the current
   * weakness model; it becomes the yardstick if this drill starts a stretch.
   */
  addDrill(events: readonly KeystrokeEvent[], model: WeaknessModel, kind: string, slowOnPurpose = false): DrillRecord {
    if (events.length > 0) this.restCheck(Math.min(...events.map((e) => e.timestamp)));
    this.model ??= model;
    const record = scoreDrill(events, this.model, kind, slowOnPurpose);
    this.add(record);
    return record;
  }

  /** Adds an already scored drill. A long enough pause since the previous one starts a fresh stretch. */
  add(record: DrillRecord): void {
    this.restCheck(record.startedAt);
    this.drills.push(record);
  }

  private restCheck(startedAt: number): void {
    const last = this.drills.at(-1);
    if (last && startedAt - last.endedAt >= this.p.restMinutes * 60_000) this.reset();
  }

  /** Starts a fresh stretch, e.g. after the learner took the suggested break. */
  reset(): void {
    this.drills = [];
    this.model = null;
    this.quietUntil = 0;
    this.referenceEnd = null;
    this.longAt = this.p.longStretchMinutes;
  }

  /** The learner chose to keep going: hold off for a few drills, and the long-stretch reminder for a while. */
  snooze(): void {
    const signal = this.check();
    if (signal && signal.type !== 'long' && this.referenceEnd === null) {
      this.referenceEnd = this.drills.length - this.p.recentDrills;
    }
    this.quietUntil = this.drills.length + this.p.snoozeDrills;
    this.longAt = Math.max(this.longAt, this.practiceMinutes()) + this.p.snoozeMinutes;
  }

  /** Minutes of typing in this stretch (time inside drills, not between them). */
  practiceMinutes(): number {
    return this.drills.reduce((sum, d) => sum + (d.endedAt - d.startedAt), 0) / 60_000;
  }

  /** Whether to suggest a break now, and why; null if not. */
  check(): FatigueSignal | null {
    const p = this.p;
    if (this.drills.length >= this.quietUntil) {
      // Warm-ups open a session before the hands are warm, so they make a poor reference.
      const scorable = (d: DrillRecord) => d.attempts >= p.minAttempts && d.kind !== 'warmup';
      const scored = this.drills.filter(scorable);
      const recent = scored.slice(-p.recentDrills);
      const reference = this.referenceEnd === null
        ? scored.slice(0, -p.recentDrills)
        : this.drills.slice(0, this.referenceEnd).filter(scorable);
      // The newest drill must be one of the recent ones, so an old dip is not reported again.
      if (recent.length === p.recentDrills && reference.length >= p.minReferenceDrills &&
          recent.at(-1) === this.drills.at(-1)) {
        const signal = compare(sum(reference), recent, p);
        if (signal) return signal;
      }
    }
    const minutes = this.practiceMinutes();
    if (minutes >= this.longAt) return { type: 'long', minutes: Math.round(minutes) };
    return null;
  }
}

interface Totals { attempts: number; errors: number; expectedErrors: number; timedKeys: number; logSlowness: number }

function sum(drills: readonly DrillRecord[]): Totals {
  const t: Totals = { attempts: 0, errors: 0, expectedErrors: 0, timedKeys: 0, logSlowness: 0 };
  for (const d of drills) {
    t.attempts += d.attempts;
    t.errors += d.errors;
    t.expectedErrors += d.expectedErrors;
    t.timedKeys += d.timedKeys;
    t.logSlowness += d.logSlowness;
  }
  return t;
}

/** Errors per expected error, with half an error added to each side so a perfect drill is not a zero. */
const errorRatio = (t: Totals) => (t.errors + 0.5) / (t.expectedErrors + 0.5);
/** Geometric mean of observed / expected keystroke time. */
const slowness = (t: Totals) => Math.exp(t.logSlowness / t.timedKeys);

/** Whether a drill made clearly more errors than `refRatio` predicts for it: by `factor`, and by at least one error. */
function worseThan(d: DrillRecord, refRatio: number, factor: number): boolean {
  const predicted = refRatio * d.expectedErrors;
  return d.errors + 0.5 >= (predicted + 0.5) * factor && d.errors - predicted >= 1;
}

function compare(ref: Totals, recent: readonly DrillRecord[], p: FatigueParams): FatigueSignal | null {
  const now = sum(recent);
  const refRatio = errorRatio(ref);
  const nowRatio = errorRatio(now);
  const predicted = refRatio * now.expectedErrors;
  if (nowRatio >= refRatio * p.errorFactor && now.errors - predicted >= p.minExtraErrors &&
      recent.every((d) => worseThan(d, refRatio, p.eachFactor))) {
    return {
      type: 'accuracy',
      accuracyBefore: 1 - ref.errors / ref.attempts,
      accuracyNow: 1 - now.errors / now.attempts,
    };
  }
  if (ref.timedKeys > 0 && recent.every((d) => d.timedKeys > 0)) {
    const slower = slowness(now) / slowness(ref) - 1;
    // Slowing down on purpose to fix accuracy is good practice, not fatigue.
    const moreAccurate = refRatio / nowRatio > p.slowdownAccuracySlack;
    const eachSlower = recent.every((d) => slowness(d) / slowness(ref) - 1 >= p.slowdown / 2);
    if (slower >= p.slowdown && eachSlower && !moreAccurate) return { type: 'speed', slowerBy: slower };
  }
  return null;
}
