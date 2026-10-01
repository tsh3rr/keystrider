import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { TypingSession } from './session';
import { KeystrokeStore, toCsv } from './store';

describe('TypingSession', () => {
  it('logs expected, actual, previous keys and latency', () => {
    const s = new TypingSession('ab', 'x');
    const e1 = s.press('a', 1000)!;
    expect(e1).toMatchObject({
      sessionId: 'x', position: 0, expected: 'a', actual: 'a',
      prevExpected: null, prevActual: null, latencyMs: null, correct: true,
    });

    const e2 = s.press('v', 1150)!;
    expect(e2).toMatchObject({
      position: 1, expected: 'b', actual: 'v',
      prevExpected: 'a', prevActual: 'a', latencyMs: 150, correct: false,
    });

    const e3 = s.press('b', 1400)!;
    expect(e3).toMatchObject({ position: 1, prevActual: 'v', latencyMs: 250, correct: true });
    expect(s.done).toBe(true);
    expect(s.press('c', 1500)).toBeNull();
  });

  it('computes WPM and accuracy', () => {
    const s = new TypingSession('hello', 'x');
    for (const [i, c] of [...'hellx'].entries()) s.press(c, i * 100);
    s.press('o', 600);
    expect(s.accuracy()).toBeCloseTo(5 / 6);
    // 5 chars = 1 word in 600 ms = 100 WPM
    expect(s.wpm(600)).toBeCloseTo(100);
  });
});

describe('KeystrokeStore', () => {
  it('persists and clears events', async () => {
    const store = await KeystrokeStore.open();
    const s = new TypingSession('hi', 'y');
    await store.add(s.press('h', 1)!);
    await store.add(s.press('u', 2)!);
    const all = await store.all();
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ expected: 'i', actual: 'u', correct: false });
    await store.clear();
    expect(await store.count()).toBe(0);
    store.close();
  });
});

describe('toCsv', () => {
  it('quotes whitespace and leaves nulls empty', () => {
    const s = new TypingSession('a b', 'z');
    s.press('a', 0);
    const csv = toCsv([s.press(',', 10)!]);
    const [, row] = csv.split('\n');
    expect(row).toBe(',z,10,1," ",",",a,a,10,false');
  });
});
