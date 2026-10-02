import { describe, expect, it } from 'vitest';
import { TypingSession } from './session';
import type { KeystrokeEvent, PracticeContext } from './types';
import { buildWeaknessModel } from './weakness';
import { dailyModels, errorRateTrend, keyHeat, periodTotals, sessionSummaries, weakest } from './progress';

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
