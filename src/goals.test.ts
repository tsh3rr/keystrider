import { describe, expect, it } from 'vitest';
import {
  dailyActiveMs, freshStart, goalNews, goalStreak, loadGoal, newBest, newlyMastered, saveGoal, weekDays,
} from './goals';
import { startOfWeek, type SessionSummary } from './progress';

// Thursday 1 October 2026, 18:00 local time.
const NOW = new Date(2026, 9, 1, 18).getTime();
const MIN = 60_000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

let n = 0;
function session(start: number, minutes: number, extra: Partial<SessionSummary> = {}): SessionSummary {
  return { sessionId: `s${n++}`, start, chars: 200, wpm: 40, accuracy: 0.97, activeMs: minutes * MIN, ...extra };
}

const GOAL = { days: 3, minutes: 5 };

describe('weekDays', () => {
  it('marks days that met the minutes, days with some practice, and empty days', () => {
    const daily = dailyActiveMs([
      session(at(2026, 8, 28, 9), 3), session(at(2026, 8, 28, 20), 3), // Monday: 6 min over two drills
      session(at(2026, 8, 29), 2), // Tuesday: short
    ]);
    expect(weekDays(daily, GOAL, startOfWeek(NOW))).toEqual(['met', 'part', 'none', 'none', 'none', 'none', 'none']);
  });
});

describe('goalStreak', () => {
  const week = (monday: number, days: number) =>
    Array.from({ length: days }, (_, i) => session(new Date(2026, 8, monday + i, 12).getTime(), 6));

  it('counts weeks with the goal met; a missed day inside a week does not break it', () => {
    // Weeks of 14, 21 and 28 September; the current week (28 Sep) already has 3 days.
    const daily = dailyActiveMs([...week(14, 3), ...week(21, 4), session(at(2026, 8, 28), 6), session(at(2026, 8, 30), 6), session(at(2026, 9, 1), 6)]);
    const s = goalStreak(daily, GOAL, NOW);
    expect(s).toMatchObject({ current: 3, best: 3, daysThisWeek: 3, metThisWeek: true, daysLeft: 4 });
  });

  it('keeps last week\'s streak while this week is still open', () => {
    const daily = dailyActiveMs([...week(14, 3), ...week(21, 3), session(at(2026, 8, 29), 6)]);
    expect(goalStreak(daily, GOAL, NOW)).toMatchObject({ current: 2, metThisWeek: false, daysThisWeek: 1 });
  });

  it('restarts after a missed week but remembers the best run', () => {
    const daily = dailyActiveMs([...week(7, 3), ...week(14, 3), ...week(21, 1)]);
    expect(goalStreak(daily, GOAL, NOW)).toMatchObject({ current: 0, best: 2 });
  });

  it('is empty without practice', () => {
    expect(goalStreak(new Map(), GOAL, NOW)).toMatchObject({ current: 0, best: 0, daysThisWeek: 0 });
  });
});

describe('goalNews', () => {
  it('reports the day and the week being reached by the last drill', () => {
    const earlier = [session(at(2026, 8, 28), 6), session(at(2026, 8, 29), 6), session(at(2026, 9, 1, 10), 3)];
    const before = dailyActiveMs(earlier);
    const after = dailyActiveMs([...earlier, session(at(2026, 9, 1, 17), 3)]);
    expect(goalNews(before, after, GOAL, NOW)).toEqual({ dayMet: true, weekMet: true, streak: 1 });
    expect(goalNews(after, after, GOAL, NOW)).toEqual({ dayMet: false, weekMet: false, streak: 1 });
  });
});

describe('newBest', () => {
  const history = Array.from({ length: 5 }, (_, i) => session(NOW - (10 - i) * MIN * 60, 2, { wpm: 30 + i }));

  it('celebrates a faster drill once there is history to beat', () => {
    const fast = session(NOW, 2, { wpm: 40 });
    expect(newBest([...history, fast], fast.sessionId)).toEqual({ wpm: 40, previous: 34 });
  });

  it('ignores sloppy or short drills, and records that only tie when rounded', () => {
    const sloppy = session(NOW, 2, { wpm: 50, accuracy: 0.8 });
    const short = session(NOW, 1, { wpm: 50, chars: 12 });
    const tie = session(NOW, 2, { wpm: 34.3 });
    for (const s of [sloppy, short, tie]) expect(newBest([...history, s], s.sessionId)).toBeNull();
  });

  it('waits for enough history', () => {
    const fast = session(NOW, 2, { wpm: 60 });
    expect(newBest([...history.slice(0, 4), fast], fast.sessionId)).toBeNull();
  });
});

describe('freshStart', () => {
  it('welcomes back after a week away, once', () => {
    const fs = freshStart(NOW - 9 * 86_400_000, NOW, null);
    expect(fs?.reason).toBe('back');
    expect(freshStart(NOW - 9 * 86_400_000, NOW, fs!.id)).toBeNull();
  });

  it('marks a new month, then a new week', () => {
    // Last practice on 29 September; 1 October is in the same week but a new month.
    expect(freshStart(at(2026, 8, 29), NOW, null)?.reason).toBe('month');
    // Monday 12 October, last practice the Friday before.
    expect(freshStart(at(2026, 9, 9), at(2026, 9, 12, 8), null)?.reason).toBe('week');
  });

  it('says nothing while the week already has practice, or with no history', () => {
    expect(freshStart(at(2026, 9, 1, 9), NOW, null)).toBeNull();
    expect(freshStart(null, NOW, null)).toBeNull();
  });
});

describe('newlyMastered', () => {
  it('records silently on the first check, then reports new keys', () => {
    const first = newlyMastered(['e', 't'], null);
    expect(first.added).toEqual([]);
    const next = newlyMastered(['e', 't', 'a'], first.all);
    expect(next.added).toEqual(['a']);
    expect([...next.all]).toEqual(['e', 't', 'a']);
  });
});

describe('goal storage', () => {
  it('falls back to the default for unknown values', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as Storage;
    expect(loadGoal(storage)).toEqual({ days: 4, minutes: 5 });
    saveGoal({ days: 5, minutes: 10 }, storage);
    expect(loadGoal(storage)).toEqual({ days: 5, minutes: 10 });
    map.set('typing-trainer.goal', '{"days":9,"minutes":"x"}');
    expect(loadGoal(storage)).toEqual({ days: 4, minutes: 5 });
  });
});
