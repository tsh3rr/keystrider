import { startOfDay, startOfWeek, type SessionSummary } from './progress';

/**
 * Motivation that is about the learner's own progress, not points: a weekly
 * goal with a streak that counts weeks (a missed day does not break it),
 * personal bests, keys mastered for the first time, and a fresh-start line
 * at the start of a week or month or after a break. Pure functions plus
 * the small localStorage records they need.
 */

const DAY_MS = 86_400_000;

export interface WeeklyGoal {
  /** Practice days a week, 1–7. */
  days: number;
  /** Minutes of typing that make a day count. */
  minutes: number;
}

export const DEFAULT_GOAL: WeeklyGoal = { days: 4, minutes: 5 };
export const GOAL_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7] as const;
export const GOAL_MINUTE_CHOICES = [2, 5, 10, 15, 20, 30] as const;

/** `t` moved by `days` calendar days, so a DST switch does not shift it off midnight. */
function addDays(t: number, days: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Typing time per local day, keyed by midnight. */
export function dailyActiveMs(sessions: readonly SessionSummary[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of sessions) {
    const d = startOfDay(s.start);
    out.set(d, (out.get(d) ?? 0) + s.activeMs);
  }
  return out;
}

export type DayState = 'met' | 'part' | 'none';

/** Each day of the week starting `weekStart`, Monday first: goal minutes met, some practice, or none. */
export function weekDays(daily: ReadonlyMap<number, number>, goal: WeeklyGoal, weekStart: number): DayState[] {
  return Array.from({ length: 7 }, (_, i) => {
    const ms = daily.get(addDays(weekStart, i)) ?? 0;
    return ms >= goal.minutes * 60_000 ? 'met' : ms > 0 ? 'part' : 'none';
  });
}

export interface GoalStreak {
  /** Weeks in a row the goal was met, up to this week, or last week while this one is still open. */
  current: number;
  /** Longest run of weeks with the goal met. */
  best: number;
  /** Days this week that count towards the goal. */
  daysThisWeek: number;
  /** Whether this week's goal is already met. */
  metThisWeek: boolean;
  /** Days left in this week, today included. */
  daysLeft: number;
}

/** Week streak for the goal, over the days with practice (any language). */
export function goalStreak(daily: ReadonlyMap<number, number>, goal: WeeklyGoal, now = Date.now()): GoalStreak {
  const thisWeek = startOfWeek(now);
  const metDays = (week: number) => weekDays(daily, goal, week).filter((d) => d === 'met').length;
  const firstDay = Math.min(...daily.keys());
  let best = 0;
  let run = 0;
  if (Number.isFinite(firstDay)) {
    for (let w = startOfWeek(firstDay); w <= thisWeek; w = addDays(w, 7)) {
      run = metDays(w) >= goal.days ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  const daysThisWeek = metDays(thisWeek);
  const metThisWeek = daysThisWeek >= goal.days;
  let current = 0;
  for (let w = metThisWeek ? thisWeek : addDays(thisWeek, -7); metDays(w) >= goal.days; w = addDays(w, -7)) current++;
  const daysLeft = 7 - Math.round((startOfDay(now) - thisWeek) / DAY_MS);
  return { current, best, daysThisWeek, metThisWeek, daysLeft };
}

/** What finishing a drill did for the goal: today's minutes reached, and the week's goal reached. */
export function goalNews(
  before: ReadonlyMap<number, number>,
  after: ReadonlyMap<number, number>,
  goal: WeeklyGoal,
  now = Date.now(),
): { dayMet: boolean; weekMet: boolean; streak: number } {
  const today = startOfDay(now);
  const need = goal.minutes * 60_000;
  const dayMet = (before.get(today) ?? 0) < need && (after.get(today) ?? 0) >= need;
  const was = goalStreak(before, goal, now);
  const is = goalStreak(after, goal, now);
  return { dayMet, weekMet: !was.metThisWeek && is.metThisWeek, streak: is.current };
}

// --- Personal bests ---

/** Drills shorter or sloppier than this do not count for personal bests. */
export const BEST_MIN_CHARS = 30;
export const BEST_MIN_ACCURACY = 0.9;
/** A best is only celebrated once there is something to beat. */
export const BEST_MIN_HISTORY = 5;

const counts = (s: SessionSummary) => s.chars >= BEST_MIN_CHARS && s.accuracy >= BEST_MIN_ACCURACY;

/** Fastest qualifying drill, or null. */
export function bestDrill(sessions: readonly SessionSummary[]): SessionSummary | null {
  let best: SessionSummary | null = null;
  for (const s of sessions) if (counts(s) && (!best || s.wpm > best.wpm)) best = s;
  return best;
}

/** The new speed record set by `sessionId`, with the record it beat; null if it set none. */
export function newBest(sessions: readonly SessionSummary[], sessionId: string): { wpm: number; previous: number } | null {
  const drill = sessions.find((s) => s.sessionId === sessionId);
  if (!drill || !counts(drill)) return null;
  const earlier = sessions.filter((s) => s.sessionId !== sessionId && s.start < drill.start && counts(s));
  if (earlier.length < BEST_MIN_HISTORY) return null;
  const previous = Math.max(...earlier.map((s) => s.wpm));
  // Rounded as shown, so "42 (was 42)" never appears.
  return Math.round(drill.wpm) > Math.round(previous) ? { wpm: drill.wpm, previous } : null;
}

// --- Fresh starts ---

export type FreshStart = 'back' | 'month' | 'week';

/** A break this long makes the next visit a welcome back. */
export const BACK_AFTER_DAYS = 7;

/**
 * Why this visit is a good moment for a fresh start, or null: back after a
 * break, a new month, or a new week with no practice in it yet. `seen` is
 * the id of the last one shown, so each shows once.
 */
export function freshStart(lastPractice: number | null, now: number, seen: string | null): { reason: FreshStart; id: string } | null {
  if (lastPractice === null) return null;
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const d = new Date(now);
  const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  let pick: { reason: FreshStart; id: string } | null = null;
  if (today - startOfDay(lastPractice) >= BACK_AFTER_DAYS * DAY_MS) pick = { reason: 'back', id: `back-${today}` };
  else if (lastPractice < month && today - month < 7 * DAY_MS) pick = { reason: 'month', id: `month-${month}` };
  else if (lastPractice < week) pick = { reason: 'week', id: `week-${week}` };
  if (!pick || pick.id === seen) return null;
  // A welcome back shown this week is enough for the week.
  if (seen?.startsWith('back-') && Number(seen.slice(5)) >= week) return null;
  return pick;
}

// --- Stored records ---

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function read<T>(key: string, storage: Storage | undefined): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, storage: Storage | undefined): void {
  try {
    storage?.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // Private mode or storage disabled: it just won't persist.
  }
}

const GOAL_KEY = 'typing-trainer.goal';

export function loadGoal(storage = safeStorage()): WeeklyGoal {
  const g = read<Partial<WeeklyGoal>>(GOAL_KEY, storage);
  const days = GOAL_DAY_CHOICES.find((d) => d === g?.days) ?? DEFAULT_GOAL.days;
  const minutes = GOAL_MINUTE_CHOICES.find((m) => m === g?.minutes) ?? DEFAULT_GOAL.minutes;
  return { days, minutes };
}

export function saveGoal(goal: WeeklyGoal, storage = safeStorage()): void {
  write(GOAL_KEY, goal, storage);
}

const FRESH_KEY = 'typing-trainer.fresh-start';

export function loadFreshSeen(storage = safeStorage()): string | null {
  try {
    return storage?.getItem(FRESH_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveFreshSeen(id: string, storage = safeStorage()): void {
  write(FRESH_KEY, id, storage);
}

const masteredKey = (language: string, layout: string) => `typing-trainer.mastered.${language}.${layout}`;

/** Steps that met the bar at least once in this language and layout; null before the first check. */
export function loadMastered(language: string, layout: string, storage = safeStorage()): Set<string> | null {
  const list = read<string[]>(masteredKey(language, layout), storage);
  return Array.isArray(list) ? new Set(list.filter((s) => typeof s === 'string')) : null;
}

export function saveMastered(language: string, layout: string, steps: ReadonlySet<string>, storage = safeStorage()): void {
  write(masteredKey(language, layout), [...steps], storage);
}

/**
 * Steps meeting the bar now that never did before. The first check only
 * records what is already known (e.g. after the placement test), so it
 * does not celebrate a dozen keys at once.
 */
export function newlyMastered(known: readonly string[], stored: ReadonlySet<string> | null): { added: string[]; all: Set<string> } {
  const all = new Set(stored ?? []);
  const added: string[] = [];
  for (const k of known) {
    if (all.has(k)) continue;
    all.add(k);
    if (stored) added.push(k);
  }
  return { added, all };
}

// --- Practice plan ---
//
// When and where the learner means to practise ("Mon, Wed, Fri at 08:00,
// after coffee"). Deciding that in advance is one of the best-supported
// ways to build a habit (implementation intentions). The reminder is a
// calendar entry the learner downloads; nothing is sent anywhere.

export interface PracticePlan {
  /** Weekdays, 0 = Monday … 6 = Sunday, ascending. */
  days: number[];
  /** Local time, "HH:MM". */
  time: string;
  /** Optional cue, e.g. "after coffee". */
  cue: string;
}

export const PLAN_CUE_MAX = 40;
const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
/** "Now" for a plan: from half an hour before the planned time to an hour and a half after. */
const PLAN_EARLY_MS = 30 * 60_000;
const PLAN_LATE_MS = 90 * 60_000;

/** A plan with its fields checked, or null if it cannot be used. */
export function cleanPlan(p: Partial<PracticePlan> | null | undefined): PracticePlan | null {
  if (!p || !Array.isArray(p.days) || typeof p.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) return null;
  const days = [...new Set(p.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (days.length === 0) return null;
  return { days, time: p.time, cue: typeof p.cue === 'string' ? p.cue.trim().slice(0, PLAN_CUE_MAX) : '' };
}

/** Today's planned time (ms) if today is a plan day. */
function plannedToday(plan: PracticePlan, now: number): number | null {
  const d = new Date(now);
  if (!plan.days.includes((d.getDay() + 6) % 7)) return null;
  const [h, m] = plan.time.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

/** Whether now is around a planned practice time; returns that day's midnight as an id. */
export function planDue(plan: PracticePlan | null, now: number): number | null {
  if (!plan) return null;
  const at = plannedToday(plan, now);
  return at !== null && now >= at - PLAN_EARLY_MS && now <= at + PLAN_LATE_MS ? startOfDay(now) : null;
}

/** A calendar file (iCalendar) with a weekly repeating event and a reminder at its start. */
export function planIcs(
  plan: PracticePlan,
  { minutes, now = Date.now(), title, description, url, uid }: {
    minutes: number; now?: number; title: string; description: string; url: string; uid: string;
  },
): string {
  // The first planned day from today on, at the planned time, in floating local time.
  const [h, m] = plan.time.split(':').map(Number);
  let start = new Date(startOfDay(now));
  while (!plan.days.includes((start.getDay() + 6) % 7)) start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m);
  const end = new Date(start.getTime() + Math.max(5, minutes) * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  // Text values escape backslash, semicolon, comma and newlines (RFC 5545, 3.3.11).
  const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keystrider//Practice plan//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${plan.days.map((d) => ICS_DAYS[d]).join(',')}`,
    // The link goes in the description too: many calendars do not show the URL field.
    `SUMMARY:${text(title)}`, `DESCRIPTION:${text(`${description}\n${url}`)}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

const PLAN_KEY = 'typing-trainer.plan';
const PLAN_SEEN_KEY = 'typing-trainer.plan-seen';
const PLAN_UID_KEY = 'typing-trainer.plan-uid';

/** A stable id for this device's calendar entry, so downloading it again updates it in calendars that support that. */
export function planUid(storage = safeStorage()): string {
  let uid = read<string>(PLAN_UID_KEY, storage);
  if (typeof uid !== 'string' || !uid) {
    uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@keystrider`;
    write(PLAN_UID_KEY, JSON.stringify(uid), storage);
  }
  return uid;
}

export function loadPlan(storage = safeStorage()): PracticePlan | null {
  return cleanPlan(read<PracticePlan>(PLAN_KEY, storage));
}

export function savePlan(plan: PracticePlan | null, storage = safeStorage()): void {
  try {
    if (plan) storage?.setItem(PLAN_KEY, JSON.stringify(plan));
    else storage?.removeItem(PLAN_KEY);
  } catch {
    // not kept
  }
}

/** The day (midnight) the "you planned now" line was last shown. */
export function loadPlanSeen(storage = safeStorage()): number | null {
  const v = Number(read<number>(PLAN_SEEN_KEY, storage));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function savePlanSeen(day: number, storage = safeStorage()): void {
  write(PLAN_SEEN_KEY, day, storage);
}
