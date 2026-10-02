import { describe, expect, it } from 'vitest';
import type { Corpus } from './corpus';
import { en } from './corpora/en';
import {
  DEFAULT_DRILL_PARAMS, afterDrill, drillFeedback, drillResult, eligibleWords, initialCurriculum, modelOptions,
  nextDrill, nextKind, pseudoShare, seededRandom, spaceOut, tierTargetMs, unlockOrder, type CurriculumState,
} from './drill';
import { TrigramModel } from './pseudowords';
import { TypingSession } from './session';
import type { KeystrokeEvent, PracticeContext } from './types';
import { buildWeaknessModel, type KeyStats, type WeaknessModel } from './weakness';

const CTX: PracticeContext = { language: 'en', layout: 'qwerty-us' };
const DAY = 86_400_000;
const NOW = 100 * DAY;

/** A key that meets (or misses) the unlock bar at tier 1. */
function key(item: string, over: Partial<KeyStats> = {}): KeyStats {
  return {
    kind: 'key', item, attempts: 50, errors: 0, weight: 50, errorRate: 0.01, latencyMs: 300, latencyWeight: 50,
    lastSeen: NOW, halfLifeDays: 1, frequency: 0.5, need: 0.1, priority: 0.075, code: null, label: item.toUpperCase(),
    confusions: [], components: { errors: 0, slowness: 0, review: 0, exploration: 0.1 }, ...over,
  };
}

function fakeModel(keys: KeyStats[]): WeaknessModel {
  return {
    context: CTX, asOf: NOW, keys, bigrams: [], ranked: [...keys],
    baseline: { attempts: 0, errorRate: 0.02, logLatency: Math.log(300), latencyMs: 300, wpm: 40 },
  };
}

/** Types `text` with `wrong` pressed first wherever the text has `weak`. */
function typeText(text: string, weak = '', wrong = '', start = NOW - DAY, iki = 200): KeystrokeEvent[] {
  const s = new TypingSession(text, CTX, `s${start}`);
  const out: KeystrokeEvent[] = [];
  let t = start;
  for (const c of text) {
    if (c === weak) out.push(s.press(wrong, (t += iki), null)!);
    out.push(s.press(c, (t += iki), null)!);
  }
  return out;
}

const letters = (s: string) => [...s].filter((c) => c !== ' ');

describe('unlockOrder', () => {
  it('uses the corpus order for English, starting with e n i a r l', () => {
    const order = unlockOrder(en);
    expect(order.slice(0, 6)).toEqual(['e', 'n', 'i', 'a', 'r', 'l']);
    expect(new Set(order).size).toBe(order.length);
    expect(order).toHaveLength(26);
    for (const w of en.words) for (const c of w) expect(order).toContain(c);
  });

  it('falls back to letter frequency for a corpus without one', () => {
    const corpus: Corpus = { language: 'xx', name: 'Test', words: ['ab', 'ab', 'ac', 'a'] };
    expect(unlockOrder(corpus)).toEqual(['a', 'b', 'c']);
  });
});

describe('initialCurriculum', () => {
  it('starts a beginner with six letters at tier 1', () => {
    const s = initialCurriculum(en, CTX);
    expect(s.unlocked).toEqual(['e', 'n', 'i', 'a', 'r', 'l']);
    expect(s.tier).toBe(1);
    expect(s.focusKey).toBeNull();
  });

  it('places an experienced typist past the keys they already type at target', () => {
    const order = unlockOrder(en);
    const keys = order.slice(0, 9).map((c) => key(c));
    const model = { ...fakeModel(keys), baseline: { ...fakeModel([]).baseline, attempts: 1000, wpm: 40 } };
    const s = initialCurriculum(en, CTX, model);
    expect(s.unlocked).toEqual(order.slice(0, 9));
    expect(s.tier).toBeGreaterThan(1);
    expect(tierTargetMs(s.tier)).toBeGreaterThanOrEqual(300);
  });
});

describe('nextDrill', () => {
  const state = initialCurriculum(en, CTX);
  const model = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(state, en) });

  it('only uses unlocked letters', () => {
    for (const seed of [1, 2, 3]) {
      const d = nextDrill(model, state, en, 'core', seed);
      for (const c of letters(d.text)) expect(state.unlocked).toContain(c);
      expect(d.words.join(' ')).toBe(d.text);
    }
  });

  it('is reproducible from its seed', () => {
    expect(nextDrill(model, state, en, 'core', 7)).toEqual(nextDrill(model, state, en, 'core', 7));
    expect(nextDrill(model, state, en, 'core', 7).text).not.toBe(nextDrill(model, state, en, 'core', 8).text);
  });

  it('fills about a minute of text at the learner pace', () => {
    const slow = nextDrill(model, { ...state, paceWpm: 15 }, en, 'core', 1);
    const fast = nextDrill(model, { ...state, paceWpm: 60 }, en, 'core', 1);
    // 15 WPM for a minute is 75 characters; coverage swaps can trade words for shorter ones.
    expect(slow.text.length).toBeGreaterThanOrEqual(0.9 * 75);
    expect(fast.text.length).toBeGreaterThan(slow.text.length * 3);
    expect(nextDrill(model, state, en, 'focus', 1).words).toHaveLength(DEFAULT_DRILL_PARAMS.focusWords);
  });

  it('puts a target in about half the words', () => {
    const d = nextDrill(model, state, en, 'core', 3);
    const hit = d.words.filter((w) => d.targets.some((t) => (' ' + w + ' ').includes(t))).length;
    expect(hit / d.words.length).toBeGreaterThanOrEqual(0.45);
  });

  it('always targets the focus key while there is one', () => {
    const s: CurriculumState = { ...state, unlocked: [...state.unlocked, 't'], focusKey: 't' };
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
    for (const kind of ['core', 'focus'] as const) {
      const d = nextDrill(m, s, en, kind, 5);
      expect(d.targets).toContain('t');
    }
  });

  it('gives a weak key at least twice its natural share of keystrokes', () => {
    const all: CurriculumState = { ...state, unlocked: unlockOrder(en), paceWpm: 40 };
    const practice = en.words.slice(0, 120).join(' ');
    const events = [
      ...typeText(practice, 'r', 'e', NOW - 2 * DAY),
      ...typeText(practice, 'r', 'e', NOW - DAY),
    ];
    const m = buildWeaknessModel(events, CTX, { now: NOW, ...modelOptions(all, en) });
    const share = (text: string) => letters(text).filter((c) => c === 'r').length / letters(text).length;
    // Natural share in running text, which is mostly common words, not the flat word list.
    const natural = share(practice);
    let drilled = '';
    for (let seed = 1; seed <= 5; seed++) drilled += nextDrill(m, all, en, 'core', seed).text + ' ';
    expect(share(drilled)).toBeGreaterThanOrEqual(2 * natural);
  });
});

describe('pseudo-words', () => {
  const tri = new TrigramModel(en.words);

  it('use only allowed letters and pass their own filter', () => {
    const allowed = new Set(['e', 'n', 'i', 'a', 'r', 'l']);
    const rand = seededRandom(11);
    let made = 0;
    for (let i = 0; i < 200; i++) {
      const w = tri.sample({ allowed, rand });
      if (w === null || !tri.acceptable(w)) continue;
      made++;
      for (const c of w) expect(allowed.has(c)).toBe(true);
      expect(en.words).not.toContain(w);
      expect(w.length).toBeGreaterThanOrEqual(3);
      expect(w.length).toBeLessThanOrEqual(8);
    }
    expect(made).toBeGreaterThan(20);
  });

  it('reject blocked substrings', () => {
    const blocking = new TrigramModel(en.words, ['e']);
    const rand = seededRandom(3);
    for (let i = 0; i < 100; i++) {
      const w = blocking.sample({ allowed: new Set(['e', 'n', 'a', 'l']), rand });
      if (w !== null && blocking.acceptable(w)) expect(w.includes('e')).toBe(false);
    }
  });

  it('make up most of the text early and none once real words abound', () => {
    expect(pseudoShare(10, 5000)).toBe(1);
    expect(pseudoShare(1000, 5000)).toBe(0);
    expect(pseudoShare(200, 200)).toBe(0);
    expect(pseudoShare(500, 5000)).toBeCloseTo(500 / 950);
  });
});

describe('afterDrill', () => {
  const base = initialCurriculum(en, CTX);
  const drill = { kind: 'core' as const, words: ['line'] };
  const good = { wpm: 20, accuracy: 0.98 };
  const ready = fakeModel(base.unlocked.map((c) => key(c)));

  it('unlocks the next key in order once every unlocked key meets the bar', () => {
    const { state, changes } = afterDrill(ready, base, en, drill, good);
    expect(state.unlocked).toEqual([...base.unlocked, 't']);
    expect(state.focusKey).toBe('t');
    expect(changes).toContainEqual({ type: 'unlock', key: 't' });
  });

  it('waits while a key is inaccurate, slow or under-practised', () => {
    for (const over of [{ errorRate: 0.06 }, { latencyMs: 900 }, { weight: 10 }]) {
      const m = fakeModel(base.unlocked.map((c) => key(c, c === 'r' ? over : {})));
      expect(afterDrill(m, base, en, drill, good).state.unlocked).toEqual(base.unlocked);
    }
  });

  it('loosens the latency bar for a key stuck for many drills', () => {
    const m = fakeModel(base.unlocked.map((c) => key(c, c === 'l' ? { latencyMs: 850 } : {})));
    // Slow enough drills that the tier (and with it the bar) stays put.
    const slow = { wpm: 10, accuracy: 0.98 };
    let s = base;
    for (let i = 0; i < DEFAULT_DRILL_PARAMS.stuckDrills; i++) s = afterDrill(m, s, en, drill, slow).state;
    expect(s.relaxedKeys).toEqual(['l']);
    expect(s.focusKey).toBe('l');
    // 850 ms is within 1.15 × 800 ms, so the next drill unlocks.
    expect(afterDrill(m, s, en, drill, slow).state.unlocked).toContain('t');
  });

  it('only unlocks on core drills', () => {
    expect(afterDrill(ready, base, en, { ...drill, kind: 'focus' }, good).state.unlocked).toEqual(base.unlocked);
  });

  it('raises pace after clean drills and lowers it after sloppy ones', () => {
    const s = { ...base, paceWpm: 20 };
    expect(afterDrill(ready, s, en, drill, good).state.paceWpm).toBe(21);
    expect(afterDrill(ready, s, en, drill, { wpm: 20, accuracy: 0.94 }).state.paceWpm).toBe(20);
    expect(afterDrill(ready, s, en, drill, { wpm: 20, accuracy: 0.85 }).state.paceWpm).toBe(19);
  });

  it('enters recovery after two sloppy drills and leaves after three clean ones', () => {
    const sloppy = { wpm: 20, accuracy: 0.85 };
    let s = afterDrill(ready, base, en, drill, sloppy).state;
    expect(s.recovery).toBe(false);
    s = afterDrill(ready, s, en, drill, sloppy).state;
    expect(s.recovery).toBe(true);
    for (let i = 0; i < 3; i++) s = afterDrill(ready, s, en, drill, good).state;
    expect(s.recovery).toBe(false);
  });

  it('moves up a tier after five fast, accurate core drills with no new key settling in', () => {
    const slowKeys = fakeModel(base.unlocked.map((c) => key(c, { latencyMs: 900 })));
    let s = base;
    for (let i = 0; i < 5; i++) s = afterDrill(slowKeys, s, en, drill, good).state;
    expect(s.tier).toBe(2);
    const settling: CurriculumState = { ...base, focusKey: 'r' };
    let t = settling;
    for (let i = 0; i < 5; i++) t = afterDrill(slowKeys, t, en, drill, good).state;
    expect(t.tier).toBe(1);
  });

  it('schedules a focus burst after every third core drill', () => {
    expect(nextKind({ ...base, coreDrills: 3 }, 'core')).toBe('focus');
    expect(nextKind({ ...base, coreDrills: 3 }, 'focus')).toBe('core');
    expect(nextKind({ ...base, coreDrills: 2 }, 'core')).toBe('core');
  });
});

describe('drillResult and drillFeedback', () => {
  it('counts first-attempt accuracy and speed', () => {
    const events = typeText('aaaa aaaa', ' ', 'x', NOW, 120);
    const r = drillResult(events);
    expect(r.accuracy).toBeCloseTo(8 / 9);
    expect(r.wpm).toBeGreaterThan(30);
  });

  it('names items that improved', () => {
    const state = initialCurriculum(en, CTX);
    const opts = { now: NOW, ...modelOptions(state, en) };
    const sloppy = typeText('lane line rain', 'r', 'e', NOW - 2 * DAY);
    const before = buildWeaknessModel(sloppy, CTX, opts);
    const after = buildWeaknessModel([...sloppy, ...typeText('rare rear rain', '', '', NOW - DAY)], CTX, opts);
    const { improved } = drillFeedback(before, after, { words: ['rare', 'rear', 'rain'] });
    expect(improved.map((c) => c.item)).toContain('r');
  });
});

describe('helpers', () => {
  it('spaceOut keeps every word', () => {
    const words = ['ab', 'cd', 'ab', 'ef', 'ab', 'cd'];
    expect(spaceOut(words, ['a'], [3], seededRandom(1)).sort()).toEqual([...words].sort());
  });

  it('eligibleWords keeps only words made of allowed letters', () => {
    for (const w of eligibleWords(en, new Set('eniarl'))) for (const c of w) expect('eniarl').toContain(c);
  });
});
