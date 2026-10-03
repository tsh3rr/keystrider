import { describe, expect, it } from 'vitest';
import { TypingSession } from './session';
import type { KeystrokeEvent, PracticeContext } from './types';
import { buildWeaknessModel } from './weakness';
import {
  dailyModels, errorRateTrend, keyHeat, periodTotals, sessionSummaries, startOfWeek, streak, weakest, weeklyTotals, weeklyTrend, smoothedTrend,
  type SessionSummary,
} from './progress';

const EN: PracticeContext = { language: 'en', layout: 'qwerty-us' };
const DE: PracticeContext = { language: 'en', layout: 'qwertz-de' };
const DAY = 86_400_000;
const NOW = new Date(2026, 9, 1, 18).getTime();

function typed(
  text: string,
  { presses = text, start = NOW - DAY, iki = 200, ctx = EN, id = `s${Math.random()}` }: {
    presses?: string; start?: number; iki?: number; ctx?: PracticeContext; id?: string;
  } = {},
): KeystrokeEvent[] {
  const s = new TypingSession(text, ctx, id);
  let t = start;
  return [...presses].map((c) => s.press(c, (t += iki), null)!);
}

describe('sessionSummaries', () => {
  it('computes net WPM from active time and first-try accuracy', () => {
    // 20 correct chars, 200 ms apart: 19 intervals = 3.8 s for 19 chars after the first.
    const events = typed('abcdefghij klmnopqrs', { id: 'a' });
    const [s] = sessionSummaries(events);
    expect(s.chars).toBe(20);
    expect(s.accuracy).toBe(1);
    expect(s.wpm).toBeCloseTo(19 / 5 / (3.8 / 60), 5);
  });

  it('counts a wrong key against accuracy once, and caps pauses', () => {
    // "x" is wrong at position 2, then corrected with "c".
    const events = typed('abcdefghijkl', { presses: 'abxcdefghijkl', id: 'b' });
    events[5].latencyMs = 60_000; // went for coffee
    const [s] = sessionSummaries(events);
    expect(s.chars).toBe(12);
    expect(s.accuracy).toBeCloseTo(11 / 12, 5);
    expect(s.activeMs).toBe(11 * 200 + 2000);
  });

  it('drops very short sessions and sorts by start', () => {
    const events = [
      ...typed('later session text', { start: NOW - 1000 * 60, id: 'late' }),
      ...typed('abc', { id: 'tiny' }),
      ...typed('earlier session text', { start: NOW - 2 * DAY, id: 'early' }),
    ];
    expect(sessionSummaries(events).map((s) => s.sessionId)).toEqual(['early', 'late']);
  });
});

describe('periodTotals', () => {
  it('weights averages by characters and filters by start time', () => {
    const sessions = [
      { sessionId: 'a', start: 10, chars: 100, wpm: 20, accuracy: 0.9, activeMs: 1000 },
      { sessionId: 'b', start: 20, chars: 300, wpm: 40, accuracy: 1, activeMs: 3000 },
      { sessionId: 'c', start: 30, chars: 50, wpm: 99, accuracy: 0.5, activeMs: 500 },
    ];
    const t = periodTotals(sessions, 0, 30);
    expect(t).toMatchObject({ sessions: 2, chars: 400, activeMs: 4000 });
    expect(t.wpm).toBeCloseTo(35, 5);
    expect(t.accuracy).toBeCloseTo(0.975, 5);
    expect(periodTotals(sessions, 100, 200)).toMatchObject({ sessions: 0, wpm: null, accuracy: null });
  });
});

describe('weakest', () => {
  it('ranks by error and slowness, ignoring keys with few tries', () => {
    const text = 'the quick brown fox jumps over the lazy dog '.repeat(4);
    // Always hit "r" first instead of "e".
    const presses = [...text].map((c) => (c === 'e' ? 're' : c)).join('');
    const model = buildWeaknessModel(typed(text, { presses }), EN, { now: NOW });
    const top = weakest(model.keys, 10, 3);
    expect(top[0].item).toBe('e');
    expect(top.every((k) => k.attempts >= 10)).toBe(true);
  });
});

describe('dailyModels and errorRateTrend', () => {
  it('rebuilds the model at the end of each day, ending now', () => {
    const events = [
      ...typed('eeee eeee eeee', { presses: 'reeee reeee reeee', start: NOW - 3 * DAY }),
      ...typed('eeee eeee eeee', { start: NOW - DAY / 4 }),
    ];
    const models = dailyModels(events, EN, { days: 5, now: NOW });
    expect(models).toHaveLength(5);
    expect(models[4].asOf).toBe(NOW);
    const trend = errorRateTrend(models, 'key', 'e');
    expect(trend[0]).toBeNull(); // before any practice
    expect(trend[1]).not.toBeNull();
    expect(trend[4]!).toBeLessThan(trend[1]!);
    // 12 tries on day 1: below a 20-try threshold the item has no trend point yet.
    expect(errorRateTrend(models, 'key', 'e', 20).slice(0, 4)).toEqual([null, null, null, null]);
  });
});

describe('keyHeat', () => {
  it('merges upper and lower case onto one physical key, layout-aware', () => {
    const model = buildWeaknessModel(typed('Yes yes yes yes', { ctx: DE }), DE, { now: NOW });
    const heat = keyHeat(model);
    // On QWERTZ, "y" is the key US code calls KeyZ.
    expect(heat.get('KeyZ')?.chars.sort()).toEqual(['Y', 'y']);
    expect(heat.get('KeyZ')?.attempts).toBe(4);
    expect(heat.has('KeyY')).toBe(false);
  });
});

describe('week by week', () => {
  // NOW is Thursday 1 Oct 2026, 18:00.
  const at = (month: number, day: number, hour = 10): SessionSummary =>
    ({ sessionId: `${month}-${day}-${hour}`, start: new Date(2026, month, day, hour).getTime(), chars: 100, wpm: 30, accuracy: 0.95, activeMs: 60_000 });

  it('starts weeks on Monday at midnight', () => {
    expect(startOfWeek(NOW)).toBe(new Date(2026, 8, 28).getTime());
    expect(startOfWeek(new Date(2026, 8, 27, 23).getTime())).toBe(new Date(2026, 8, 21).getTime());
  });

  it('counts the current streak through yesterday until today is practised', () => {
    const days = [at(8, 26), at(8, 28), at(8, 29), at(8, 30), at(8, 30, 20)];
    expect(streak(days, NOW)).toEqual({ current: 3, best: 3, today: false });
    expect(streak([...days, at(9, 1)], NOW)).toEqual({ current: 4, best: 4, today: true });
    expect(streak([at(8, 20), at(8, 21), at(8, 22), at(8, 29)], NOW)).toEqual({ current: 0, best: 3, today: false });
    expect(streak([], NOW)).toEqual({ current: 0, best: 0, today: false });
  });

  it('totals calendar weeks, oldest first, with practice days marked', () => {
    const sessions = [at(8, 22), { ...at(8, 28), wpm: 40, chars: 300 }, at(8, 30), at(8, 30, 21)];
    const weeks = weeklyTotals(sessions, { weeks: 3, now: NOW });
    expect(weeks.map((w) => w.start)).toEqual([new Date(2026, 8, 14), new Date(2026, 8, 21), new Date(2026, 8, 28)].map((d) => d.getTime()));
    expect(weeks[0].sessions).toBe(0);
    expect(weeks[0].wpm).toBeNull();
    expect(weeks[1].activeDays).toEqual([false, true, false, false, false, false, false]);
    expect(weeks[2].sessions).toBe(3);
    expect(weeks[2].activeDays).toEqual([true, false, true, false, false, false, false]);
    expect(weeks[2].wpm).toBeCloseTo((40 * 300 + 30 * 200) / 500, 5);
  });
});

describe('weeklyTrend', () => {
  it('fits a line through practised weeks only', () => {
    const tr = weeklyTrend([{ wpm: 20 }, { wpm: null }, { wpm: 24 }, { wpm: 26 }]);
    expect(tr!.slope).toBeCloseTo(2, 5);
    expect(tr!.intercept).toBeCloseTo(20, 5);
  });

  it('needs three practised weeks', () => {
    expect(weeklyTrend([{ wpm: 20 }, { wpm: null }, { wpm: 24 }])).toBeNull();
  });
});

describe('smoothedTrend', () => {
  it('bends at a lasting jump and skips weeks without practice', () => {
    const line = smoothedTrend([{ wpm: 20 }, { wpm: 20 }, { wpm: null }, { wpm: 40 }, { wpm: 40 }]);
    expect(line.map(([i]) => i)).toEqual([0, 1, 3, 4]);
    expect(line.map(([, v]) => v)).toEqual([20, 25, 35, 40]);
  });

  it('needs three practised weeks', () => {
    expect(smoothedTrend([{ wpm: 20 }, { wpm: 24 }])).toEqual([]);
  });
});
