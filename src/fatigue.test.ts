import { describe, expect, it } from 'vitest';
import { FatigueTracker, scoreDrill, type DrillRecord } from './fatigue';
import { TypingSession } from './session';
import type { KeystrokeEvent } from './types';
import type { WeaknessModel } from './weakness';

const MIN = 60_000;

/** A one-minute drill of 200 first attempts: `errors` wrong where the model expected 8, keystrokes `slower` times the usual time. */
function drill(startMin: number, errors: number, slower = 1, kind = 'core'): DrillRecord {
  return {
    kind,
    startedAt: startMin * MIN,
    endedAt: (startMin + 1) * MIN,
    attempts: 200,
    errors,
    expectedErrors: 8,
    timedKeys: 180,
    logSlowness: 180 * Math.log(slower),
  };
}

function track(...drills: DrillRecord[]): FatigueTracker {
  const t = new FatigueTracker();
  for (const d of drills) t.add(d);
  return t;
}

describe('FatigueTracker', () => {
  it('stays quiet while typing holds steady', () => {
    expect(track(drill(0, 8), drill(2, 9), drill(4, 7), drill(6, 8)).check()).toBeNull();
  });

  it('suggests a break when the last drills make clearly more errors than earlier ones', () => {
    const signal = track(drill(0, 6), drill(2, 7), drill(4, 14), drill(6, 15)).check();
    expect(signal).toMatchObject({ type: 'accuracy' });
    if (signal?.type !== 'accuracy') return;
    expect(signal.accuracyBefore).toBeCloseTo(1 - 13 / 400);
    expect(signal.accuracyNow).toBeCloseTo(1 - 29 / 400);
  });

  it('ignores one bad drill', () => {
    expect(track(drill(0, 6), drill(2, 7), drill(4, 7), drill(6, 20)).check()).toBeNull();
  });

  it('ignores one bad drill after clean ones', () => {
    expect(track(drill(0, 0), drill(2, 0), drill(4, 0), drill(6, 30)).check()).toBeNull();
  });

  it('needs enough earlier drills to compare against', () => {
    expect(track(drill(0, 6), drill(2, 14), drill(4, 15)).check()).toBeNull();
  });

  it('does not use warm-ups as the reference', () => {
    expect(track(drill(0, 2, 1, 'warmup'), drill(2, 7), drill(4, 14), drill(6, 15)).check()).toBeNull();
  });

  it('notices slowing down', () => {
    const signal = track(drill(0, 8), drill(2, 8), drill(4, 8, 1.25), drill(6, 8, 1.3)).check();
    expect(signal).toMatchObject({ type: 'speed' });
  });

  it('does not count slowing down to type more accurately', () => {
    expect(track(drill(0, 10), drill(2, 10), drill(4, 3, 1.3), drill(6, 3, 1.3)).check()).toBeNull();
  });

  it('suggests a break after a long stretch even without a drop', () => {
    const drills = Array.from({ length: 30 }, (_, i) => drill(i * 1.2, 8));
    const t = track(...drills);
    expect(t.check()).toEqual({ type: 'long', minutes: 30 });
  });

  it('starts a fresh stretch after a rest', () => {
    const t = track(drill(0, 6), drill(2, 7), drill(4, 14));
    t.add(drill(20, 15));
    expect(t.check()).toBeNull();
    expect(t.practiceMinutes()).toBe(1);
  });

  it('stays quiet for a few drills after "Keep going"', () => {
    const t = track(drill(0, 6), drill(2, 7), drill(4, 14), drill(6, 15));
    t.snooze();
    t.add(drill(8, 15));
    t.add(drill(10, 15));
    expect(t.check()).toBeNull();
    t.add(drill(12, 15));
    expect(t.check()).toMatchObject({ type: 'accuracy' });
  });

  it('pushes the long-stretch reminder back after "Keep going"', () => {
    const t = track(...Array.from({ length: 30 }, (_, i) => drill(i * 1.2, 8)));
    t.snooze();
    for (let i = 30; i < 44; i++) t.add(drill(i * 1.2, 8));
    expect(t.check()).toBeNull();
    t.add(drill(44 * 1.2, 8));
    expect(t.check()).toEqual({ type: 'long', minutes: 45 });
  });
});

describe('scoreDrill', () => {
  const model = {
    baseline: { errorRate: 0.05, latencyMs: 200 },
    keys: [
      { item: 'a', attempts: 50, errorRate: 0.1, latencyMs: 100 },
      { item: 'b', attempts: 50, errorRate: 0.02, latencyMs: 400 },
    ],
  } as unknown as WeaknessModel;

  function type(text: string, presses: [string, number][]): KeystrokeEvent[] {
    const s = new TypingSession(text, { language: 'en', layout: 'qwerty-us' }, 'x');
    return presses.map(([ch, t]) => s.press(ch, t)!);
  }

  it('compares errors and speed with what the model expects for each key', () => {
    // a, b right; c (unseen) wrong then right.
    const events = type('abc', [['a', 0], ['b', 800], ['x', 1000], ['c', 1100]]);
    const r = scoreDrill(events, model, 'core');
    expect(r).toMatchObject({ kind: 'core', attempts: 3, errors: 1, startedAt: 0, endedAt: 1100 });
    expect(r.expectedErrors).toBeCloseTo(0.1 + 0.02 + 0.05);
    // Only "b" has a clean latency: 800 ms where 400 ms is usual, twice as slow.
    expect(r.timedKeys).toBe(1);
    expect(Math.exp(r.logSlowness)).toBeCloseTo(2);
  });

  it('scores a whole stretch against the model it started with', () => {
    const t = new FatigueTracker();
    t.addDrill(type('ab', [['a', 0], ['b', 400]]), model, 'core');
    const faster = { ...model, keys: [{ item: 'b', attempts: 50, errorRate: 0.02, latencyMs: 100 }] } as unknown as WeaknessModel;
    const r = t.addDrill(type('ab', [['a', 1000], ['b', 1400]]), faster, 'core');
    expect(Math.exp(r.logSlowness)).toBeCloseTo(1);
  });

  it('leaves speed out when slowing down was asked for', () => {
    const events = type('ab', [['a', 0], ['b', 800]]);
    expect(scoreDrill(events, model, 'core', true)).toMatchObject({ timedKeys: 0, logSlowness: 0 });
  });
});
