import type { KeystrokeEvent, PracticeContext } from './types';
import {
  DEFAULT_WEAKNESS_PARAMS, buildWeaknessModel, firstAttempts,
  type BigramStats, type KeyStats, type WeaknessModel, type WeaknessOptions,
} from './weakness';

/**
 * Progress over time: per-session speed and accuracy, and how the weakest
 * keys and bigrams have changed. Pure functions over `KeystrokeEvent[]`;
 * the progress tab in main.ts renders them.
 */

const DAY_MS = 86_400_000;

export interface SessionSummary {
  sessionId: string;
  /** Timestamp of the session's first keystroke. */
  start: number;
  /** Characters typed correctly (text positions completed). */
  chars: number;
  /** Net words per minute: completed characters / 5 per minute of active typing. */
  wpm: number;
  /** Share of text positions typed right on the first try, 0–1. */
  accuracy: number;
  /** Active typing time in ms; pauses longer than `maxPauseMs` count as `maxPauseMs`. */
  activeMs: number;
}

/**
 * One summary per practice session, oldest first. Sessions shorter than
 * `minChars` are dropped: a handful of keys says nothing about speed.
 */
export function sessionSummaries(
  events: readonly KeystrokeEvent[],
  { minChars = 10, maxPauseMs = DEFAULT_WEAKNESS_PARAMS.maxLatencyMs }: { minChars?: number; maxPauseMs?: number } = {},
): SessionSummary[] {
  const bySession = new Map<string, KeystrokeEvent[]>();
  for (const e of events) {
    let list = bySession.get(e.sessionId);
    if (!list) bySession.set(e.sessionId, (list = []));
    list.push(e);
  }
  const out: SessionSummary[] = [];
  for (const [sessionId, list] of bySession) {
    const completed = new Set<number>();
    let activeMs = 0;
    let start = Infinity;
    for (const e of list) {
      start = Math.min(start, e.timestamp);
      if (e.correct) completed.add(e.position);
      if (e.latencyMs !== null && e.latencyMs > 0) activeMs += Math.min(e.latencyMs, maxPauseMs);
    }
    const attempts = firstAttempts(list, maxPauseMs);
    const chars = completed.size;
    if (chars < minChars || activeMs <= 0) continue;
    out.push({
      sessionId,
      start,
      chars,
      // The first key has no interval before it, so it is not counted as typed time.
      wpm: (chars - 1) / 5 / (activeMs / 60_000),
      accuracy: attempts.filter((a) => !a.error).length / attempts.length,
      activeMs,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface PeriodTotals {
  sessions: number;
  chars: number;
  activeMs: number;
  /** Character-weighted mean WPM, or null with no sessions. */
  wpm: number | null;
  /** Character-weighted mean first-try accuracy, or null with no sessions. */
  accuracy: number | null;
}

/** Totals for sessions that started in [from, to). */
export function periodTotals(sessions: readonly SessionSummary[], from: number, to: number): PeriodTotals {
  const inRange = sessions.filter((s) => s.start >= from && s.start < to);
  const chars = inRange.reduce((n, s) => n + s.chars, 0);
  const mean = (f: (s: SessionSummary) => number) =>
    chars === 0 ? null : inRange.reduce((n, s) => n + f(s) * s.chars, 0) / chars;
  return {
    sessions: inRange.length,
    chars,
    activeMs: inRange.reduce((n, s) => n + s.activeMs, 0),
    wpm: mean((s) => s.wpm),
    accuracy: mean((s) => s.accuracy),
  };
}

/**
 * How weak an item is in skill terms: the error and slowness parts of the
 * model's need score. Review and exploration are left out on purpose: they
 * say when to practise an item, not how well it is known.
 */
export function weakness(item: KeyStats | BigramStats): number {
  const w = DEFAULT_WEAKNESS_PARAMS.weights;
  return w.errors * item.components.errors + w.slowness * item.components.slowness;
}

/** Items typed at least `minAttempts` times, weakest first. */
export function weakest<T extends KeyStats | BigramStats>(items: readonly T[], minAttempts: number, count: number): T[] {
  return items
    .filter((i) => i.attempts >= minAttempts)
    .sort((a, b) => weakness(b) - weakness(a) || b.errorRate - a.errorRate || b.latencyMs - a.latencyMs)
    .slice(0, count);
}

/** Model snapshots at the end of each of the last `days` days (local time), oldest first. */
export function dailyModels(
  events: readonly KeystrokeEvent[],
  context: PracticeContext,
  { days = 14, now = Date.now(), ...options }: WeaknessOptions & { days?: number } = {},
): WeaknessModel[] {
  const endOfToday = startOfDay(now) + DAY_MS - 1;
  const out: WeaknessModel[] = [];
  for (let d = days - 1; d >= 0; d--) {
    // The last snapshot is "now", not the end of today, so it matches the current model.
    const asOf = d === 0 ? now : endOfToday - d * DAY_MS;
    out.push(buildWeaknessModel(events, context, { ...options, now: asOf }));
  }
  return out;
}

/**
 * One item's error rate in each snapshot, or null while it had fewer than
 * `minAttempts` tries (until then the rate is mostly the model's prior, and a
 * trend from there would mislead). Feeds the trend sparklines.
 */
export function errorRateTrend(
  models: readonly WeaknessModel[],
  kind: 'key' | 'bigram',
  item: string,
  minAttempts = 1,
): (number | null)[] {
  return models.map((m) => {
    const list: (KeyStats | BigramStats)[] = kind === 'key' ? m.keys : m.bigrams;
    const s = list.find((i) => i.item === item);
    return s && s.attempts >= Math.max(1, minAttempts) ? s.errorRate : null;
  });
}

export interface KeyHeat {
  /** Recency-weighted first-try error rate over every character this key types, shrunk like the model's. */
  errorRate: number;
  attempts: number;
  /** Characters that contributed, e.g. ["t", "T"]. */
  chars: string[];
}

/**
 * Per physical key (`KeyboardEvent.code`): merges the model's per-character
 * stats, so "t" and "T" both colour the T key.
 */
export function keyHeat(model: WeaknessModel): Map<string, KeyHeat> {
  const acc = new Map<string, { e: number; w: number; attempts: number; chars: string[] }>();
  for (const k of model.keys) {
    if (k.code === null || k.attempts === 0) continue;
    const a = acc.get(k.code) ?? { e: 0, w: 0, attempts: 0, chars: [] };
    a.e += k.errorRate * k.weight;
    a.w += k.weight;
    a.attempts += k.attempts;
    a.chars.push(k.item);
    acc.set(k.code, a);
  }
  const out = new Map<string, KeyHeat>();
  for (const [code, a] of acc) {
    out.set(code, { errorRate: a.w > 0 ? a.e / a.w : 0, attempts: a.attempts, chars: a.chars });
  }
  return out;
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Midnight (local time) of the Monday that starts the week containing `t`. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** `t` moved by `days` calendar days, so a DST switch does not shift it off midnight. */
function addDays(t: number, days: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export interface Streak {
  /** Days in a row with practice, ending today, or yesterday while today is still open. */
  current: number;
  /** Longest run of practice days ever. */
  best: number;
  /** Whether today already counts. */
  today: boolean;
}

/** Day streaks over the days any session started on (local time). */
export function streak(sessions: readonly SessionSummary[], now = Date.now()): Streak {
  const days = new Set(sessions.map((s) => startOfDay(s.start)));
  const sorted = [...days].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const d of sorted) {
    run = addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const today = startOfDay(now);
  const hasToday = days.has(today);
  let current = 0;
  for (let d = hasToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current++;
  return { current, best, today: hasToday };
}

export interface WeekTotals extends PeriodTotals {
  /** Monday 00:00 local time. */
  start: number;
  /** Days of the week with at least one session, Monday first. */
  activeDays: boolean[];
}

/** Totals for each of the last `weeks` calendar weeks (Monday to Sunday), oldest first; the last one is the current week. */
export function weeklyTotals(sessions: readonly SessionSummary[], { weeks = 8, now = Date.now() } = {}): WeekTotals[] {
  const out: WeekTotals[] = [];
  const thisWeek = startOfWeek(now);
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(thisWeek, -7 * w);
    const end = addDays(start, 7);
    const dayStarts = Array.from({ length: 8 }, (_, i) => addDays(start, i));
    const activeDays = dayStarts.slice(0, 7).map((from, i) => sessions.some((s) => s.start >= from && s.start < dayStarts[i + 1]));
    out.push({ start, activeDays, ...periodTotals(sessions, start, end) });
  }
  return out;
}

/**
 * Least-squares line through the weekly speeds, as WPM at week index `i`
 * = `intercept + slope * i`. Null with fewer than three weeks of practice:
 * two points always make a "trend".
 */
export function weeklyTrend(weeks: readonly { wpm: number | null }[]): { slope: number; intercept: number } | null {
  const pts = weeks.flatMap((w, i) => (w.wpm === null ? [] : [[i, w.wpm] as const]));
  if (pts.length < 3) return null;
  const mx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
  const my = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
  const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const slope = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}
