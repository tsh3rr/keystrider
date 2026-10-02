import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TypingSession } from './session';
import { KeystrokeStore } from './store';
import type { KeystrokeEvent, PracticeContext } from './types';
import {
  buildWeaknessModel, codeFor, corpusFrequencies, firstAttempts, loadWeaknessModel, pickFocusItems,
  type WeaknessOptions,
} from './weakness';

const EN: PracticeContext = { language: 'en', layout: 'qwerty-us' };
const DE: PracticeContext = { language: 'en', layout: 'qwertz-de' };
const DAY = 86_400_000;
const NOW = 100 * DAY;
const NEUTRAL: WeaknessOptions = { now: NOW, frequencies: { keys: new Map(), bigrams: new Map() } };

/**
 * Types `text` through a TypingSession. `presses` is what was actually
 * pressed (defaults to the text, i.e. no errors); `iki` gives the interval
 * before each press.
 */
function typed(
  text: string,
  { presses = text, start = NOW - DAY, iki = () => 200, ctx = EN, id = `s${Math.random()}` }: {
    presses?: string;
    start?: number;
    iki?: (expected: string, i: number) => number;
    ctx?: PracticeContext;
    id?: string;
  } = {},
): KeystrokeEvent[] {
  const s = new TypingSession(text, ctx, id);
  const out: KeystrokeEvent[] = [];
  let t = start;
  [...presses].forEach((c, i) => {
    t += iki([...text][s.position], i);
    out.push(s.press(c, t, null)!);
  });
  return out;
}

describe('firstAttempts', () => {
  it('counts only the first press per position and drops recovery latency', () => {
    // "abc": 'x' instead of b, then b, then c
    const a = firstAttempts(typed('abc', { presses: 'axbc' }));
    expect(a.map((x) => [x.expected, x.error])).toEqual([['a', false], ['b', true], ['c', false]]);
    // First key of a drill has no latency; b was an error; c follows a recovered key.
    expect(a.map((x) => x.logLatency)).toEqual([null, null, null]);
  });

  it('drops pauses longer than 2 s', () => {
    const a = firstAttempts(typed('abcd', { iki: (_, i) => (i === 2 ? 2500 : 150) }));
    expect(a.map((x) => x.logLatency === null)).toEqual([true, false, true, false]);
    expect(a[1].logLatency).toBeCloseTo(Math.log(150));
  });
});

describe('buildWeaknessModel', () => {
  it('shrinks sparse error rates toward the user baseline (design doc example)', () => {
    // 96 clean "a"s set the baseline; "q" is seen 4 times with one error.
    const events = [
      ...typed('a'.repeat(96)),
      ...typed('qqqq', { presses: 'wqqqq' }),
    ];
    const m = buildWeaknessModel(events, EN, NEUTRAL);
    const q = m.keys.find((k) => k.item === 'q')!;
    expect(q.attempts).toBe(4);
    expect(q.errors).toBe(1);
    // Baseline = 1/100; p̂ = (1 + 20 · 0.01) / (4 + 20) = 5%, not 25%.
    expect(m.baseline.errorRate).toBeCloseTo(0.01, 2);
    expect(q.errorRate).toBeCloseTo(1.2 / 24, 2);
    expect(q.confusions).toEqual([{ typed: 'w', weight: expect.any(Number), count: 1 }]);
    expect(m.keys[0].item).toBe('q');
  });

  it('down-weights old evidence with a 14-day half-life', () => {
    const old = typed('ee', { presses: 'xexe', start: NOW - 14 * DAY });
    const m = buildWeaknessModel(old, EN, NEUTRAL);
    expect(m.keys.find((k) => k.item === 'e')!.weight).toBeCloseTo(1, 2); // 2 attempts × ½
  });

  it('scores slowness only once a key is accurate', () => {
    const iki = (c: string) => (c === 'k' ? 400 : 200);
    const events = [...typed('ajajajakakakak'.repeat(10), { iki })];
    const m = buildWeaknessModel(events, EN, NEUTRAL);
    const k = m.keys.find((x) => x.item === 'k')!;
    const j = m.keys.find((x) => x.item === 'j')!;
    expect(k.latencyMs).toBeGreaterThan(j.latencyMs * 1.5);
    expect(k.components.slowness).toBeGreaterThan(0.3);
    expect(j.components.slowness).toBe(0);

    // Same slow k, but now error-prone: the gate turns slowness off.
    const sloppy = typed('akakakakak', { presses: 'axkakxkakakxk', iki });
    const m2 = buildWeaknessModel(sloppy, EN, NEUTRAL);
    const k2 = m2.keys.find((x) => x.item === 'k')!;
    expect(k2.errorRate).toBeGreaterThan(0.04);
    expect(k2.components.slowness).toBe(0);
    expect(k2.components.errors).toBeGreaterThan(0);
  });

  it('builds bigrams that back off to the second key', () => {
    const events = typed('thth the', { presses: 'thtgh the' });
    const m = buildWeaknessModel(events, EN, NEUTRAL);
    const th = m.bigrams.find((b) => b.item === 'th')!;
    expect(th).toMatchObject({ kind: 'bigram', first: 't', second: 'h', attempts: 3, errors: 1 });
    const h = m.keys.find((k) => k.item === 'h')!;
    // With prior strength 10 and n = 3, the bigram sits between its raw rate and h's.
    expect(th.errorRate).toBeLessThan(1 / 3);
    expect(th.errorRate).toBeGreaterThan(h.errorRate * 0.99);
    expect(m.bigrams.some((b) => b.item === ' t')).toBe(true);
  });

  it('doubles the review half-life after good sessions and halves after a miss', () => {
    const good = (d: number) => typed('a'.repeat(40), { start: NOW - d * DAY });
    const m = buildWeaknessModel([...good(5), ...good(4), ...good(3)], EN, NEUTRAL);
    const a = m.keys.find((k) => k.item === 'a')!;
    expect(a.halfLifeDays).toBe(8);
    // Last seen ~3 days ago with h = 8: R = 1 − 2^(−3/8).
    expect(a.components.review).toBeCloseTo(1 - Math.pow(2, -3 / 8), 2);

    const miss = typed('aaaa', { presses: 'xaaaa', start: NOW - 2 * DAY });
    const m2 = buildWeaknessModel([...good(5), ...good(4), ...good(3), ...miss], EN, NEUTRAL);
    expect(m2.keys.find((k) => k.item === 'a')!.halfLifeDays).toBe(4);
  });

  it('gives unseen included keys an exploration bonus and no review need', () => {
    const m = buildWeaknessModel(typed('asdf'), EN, { ...NEUTRAL, includeKeys: ['z'], includeBigrams: ['az'] });
    const z = m.keys.find((k) => k.item === 'z')!;
    expect(z).toMatchObject({ attempts: 0, lastSeen: null });
    expect(z.components.exploration).toBe(1);
    expect(z.components.review).toBe(0);
    expect(m.bigrams.find((b) => b.item === 'az')).toBeDefined();
  });

  it('filters by language and layout and ignores events after asOf', () => {
    const events = [
      ...typed('aaaa', { presses: 'xaxaxaxa' }),
      ...typed('bbbb', { ctx: DE }),
      ...typed('cccc', { ctx: { language: 'pl', layout: 'qwerty-us' } }),
      ...typed('dddd', { start: NOW + DAY }),
    ];
    const m = buildWeaknessModel(events, EN, NEUTRAL);
    expect(m.keys.map((k) => k.item)).toEqual(['a']);
    expect(m.context).toEqual(EN);
    expect(m.asOf).toBe(NOW);
  });

  it('names keys by the layout, not US positions', () => {
    const m = buildWeaknessModel(typed('zy ', { ctx: DE }), DE, NEUTRAL);
    expect(m.keys.find((k) => k.item === 'y')).toMatchObject({ code: 'KeyZ', label: 'Y' });
    expect(m.keys.find((k) => k.item === 'z')).toMatchObject({ code: 'KeyY', label: 'Z' });
    expect(m.keys.find((k) => k.item === ' ')).toMatchObject({ code: 'Space', label: 'Space' });
    expect(codeFor('qwerty-us', 'Y')).toBe('KeyY');
    expect(codeFor('qwerty-us', 'ü')).toBeNull();
  });

  it('weights priority by language frequency', () => {
    // e and q equally weak; e is far more common in English.
    const events = typed('eqeqeqeq', { presses: 'xexqxexqxexqxexq' });
    const m = buildWeaknessModel(events, EN, { now: NOW });
    const e = m.keys.find((k) => k.item === 'e')!;
    const q = m.keys.find((k) => k.item === 'q')!;
    expect(e.need).toBeCloseTo(q.need, 6);
    expect(e.frequency).toBeGreaterThan(q.frequency);
    expect(e.priority).toBeGreaterThan(q.priority);
  });

  it('handles an empty log', () => {
    const m = buildWeaknessModel([], EN, NEUTRAL);
    expect(m.keys).toEqual([]);
    expect(m.baseline.attempts).toBe(0);
    expect(m.baseline.wpm).toBeCloseTo(40);
  });
});

describe('corpusFrequencies', () => {
  it('counts characters and word-boundary bigrams', () => {
    const f = corpusFrequencies({ language: 'xx', name: 'X', words: ['ab', 'b'] });
    expect(f.keys.get('b')).toBeCloseTo(1 + 1 / 2);
    expect(f.bigrams.get(' a')).toBeCloseTo(1);
    expect(f.bigrams.get('b ')).toBeCloseTo(1.5);
  });
});

describe('pickFocusItems', () => {
  it('returns distinct items, favouring high priority', () => {
    const events = typed('abcdefgh', { presses: 'axbxcdefgh' });
    const m = buildWeaknessModel(events, EN, NEUTRAL);
    const picks = pickFocusItems(m, { count: 3, rand: () => 0 });
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.item)).size).toBe(3);
    expect(picks[0]).toBe(m.ranked[0]);
    expect(pickFocusItems(m, { count: 1000 })).toHaveLength(m.ranked.length);
  });
});

describe('loadWeaknessModel', () => {
  it('reads one language and layout from the store', async () => {
    const store = await KeystrokeStore.open(new IDBFactory());
    for (const e of [...typed('aa', { presses: 'xaa' }), ...typed('bb', { ctx: DE })]) await store.add(e);
    const m = await loadWeaknessModel(store, EN, NEUTRAL);
    expect(m.keys.map((k) => k.item)).toEqual(['a']);
    store.close();
  });
});
