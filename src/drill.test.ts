import { describe, expect, it } from 'vitest';
import type { Corpus } from './corpus';
import { de } from './corpora/de';
import { en } from './corpora/en';
import { es } from './corpora/es';
import {
  CAPITALS, DEFAULT_DRILL_PARAMS, DEFAULT_PUNCTUATION, DIGIT_ORDER, afterDrill, decorate, drillFeedback, drillResult,
  eligibleWords, initialCurriculum, isNewSession, modelOptions, needsShift, nextDrill, nextKind, openChars, pseudoShare,
  reviewItems, seededRandom, sentencePool, sentencesReady, spaceOut, stepChars, stepStats, tierTargetMs, unlockOrder, unlockSteps,
  type CurriculumState,
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

describe('German', () => {
  const DE_CTX: PracticeContext = { language: 'de', layout: 'qwertz-de' };

  it('unlocks umlauts and ß on German QWERTZ, and capitals include Ä Ö Ü', () => {
    const steps = unlockSteps(de, 'qwertz-de');
    for (const c of 'äöüß') expect(steps).toContain(c);
    const letters = steps.filter((s) => /^\p{L}$/u.test(s));
    const open = openChars({ unlocked: [...letters, CAPITALS] });
    for (const c of 'ÄÖÜ') expect(open.has(c)).toBe(true);
    expect(open.has('ß')).toBe(true);
  });

  it('leaves out letters a layout cannot type, so US QWERTY drills words without them', () => {
    const steps = unlockSteps(de, 'qwerty-us');
    for (const c of 'äöüß') expect(steps).not.toContain(c);
    const letters = steps.filter((s) => /^\p{L}$/u.test(s));
    const words = eligibleWords(de, new Set(letters));
    expect(words.length).toBeGreaterThan(1000);
    expect(words.every((w) => !/[äöüß]/.test(w))).toBe(true);
  });

  it('builds drills from the first six German letters', () => {
    const state = initialCurriculum(de, DE_CTX);
    expect(state.unlocked).toEqual([...'enirsa']);
    const drill = nextDrill(fakeModel([]), state, de, 'core', 7);
    const allowed = new Set([...state.unlocked, ' ']);
    expect([...drill.text].every((c) => allowed.has(c))).toBe(true);
    expect(drill.text.length).toBeGreaterThan(50);
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

  it('opens a session with a warm-up once there is history, and follows a focus burst with sentences when open', () => {
    expect(nextKind(base, null, { newSession: true })).toBe('core');
    expect(nextKind({ ...base, coreDrills: 4 }, null, { newSession: true })).toBe('warmup');
    expect(nextKind({ ...base, coreDrills: 4 }, 'warmup')).toBe('core');
    expect(nextKind({ ...base, coreDrills: 3 }, 'focus', { sentences: true })).toBe('sentence');
    expect(nextKind({ ...base, coreDrills: 3 }, 'sentence', { sentences: true })).toBe('core');
  });

  it('lets a warm-up move nothing but the recent words', () => {
    const { state, changes } = afterDrill(ready, base, en, { ...drill, kind: 'warmup' }, { wpm: 5, accuracy: 0.5 });
    expect(changes).toEqual([]);
    expect({ ...state, recentWords: [] }).toEqual({ ...base, recentWords: [] });
    expect(state.recentWords).toHaveLength(1);
  });

  it('counts sentence drills for pace but not for unlocks', () => {
    const { state } = afterDrill(ready, base, en, { ...drill, kind: 'sentence' }, good);
    expect(state.unlocked).toEqual(base.unlocked);
    expect(state.coreDrills).toBe(0);
    expect(state.paceWpm).toBeGreaterThan(base.paceWpm);
  });
});

describe('sessions', () => {
  it('starts a new session on the first drill and after a long pause', () => {
    const gap = DEFAULT_DRILL_PARAMS.sessionGapMinutes * 60_000;
    expect(isNewSession(null, NOW)).toBe(true);
    expect(isNewSession(NOW - gap + 1, NOW)).toBe(false);
    expect(isNewSession(NOW - gap, NOW)).toBe(true);
  });
});

describe('warm-up drills', () => {
  const all: CurriculumState = { ...initialCurriculum(en, CTX), unlocked: unlockOrder(en), coreDrills: 10, paceWpm: 30 };
  // Practised two weeks ago (due for review) versus just now (not due).
  const practice = en.words.slice(0, 120).join(' ');
  const events = [...typeText(practice, '', '', NOW - 14 * DAY)];
  const fresh = 'gh'.repeat(40);
  events.push(...typeText(fresh, '', '', NOW - 60_000, 150));

  it('ranks items by how overdue their review is', () => {
    const m = buildWeaknessModel(events, CTX, { now: NOW, ...modelOptions(all, en) });
    const ranked = reviewItems(m, all).filter((it) => it.priority > 0);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].priority).toBeGreaterThanOrEqual(ranked[i].priority);
    expect(ranked[0].components.review).toBeGreaterThan(0);
  });

  it('uses real words only once enough exist, and runs shorter than a core drill', () => {
    const m = buildWeaknessModel(events, CTX, { now: NOW, ...modelOptions(all, en) });
    const d = nextDrill(m, all, en, 'warmup', 4);
    const core = nextDrill(m, all, en, 'core', 4);
    expect(d.kind).toBe('warmup');
    const real = new Set(en.words.map((w) => w.toLowerCase()));
    expect(d.words.every((w) => real.has(w))).toBe(true);
    expect(d.text.length).toBeLessThan(core.text.length);
    expect(d.targets.length).toBeGreaterThan(0);
  });

  it('falls back to the usual ranking when nothing is due', () => {
    const state = initialCurriculum(en, CTX);
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(state, en) });
    const d = nextDrill(m, { ...state, coreDrills: 1 }, en, 'warmup', 2);
    expect(d.kind).toBe('warmup');
    expect(d.words.length).toBeGreaterThan(0);
    for (const c of letters(d.text)) expect(state.unlocked).toContain(c);
  });
});

describe('sentence drills', () => {
  const order = unlockOrder(en);
  const at = (n: number): CurriculumState => ({ ...initialCurriculum(en, CTX), unlocked: order.slice(0, n), paceWpm: 30 });

  it('open only with enough letters and sentences', () => {
    expect(sentencesReady(at(DEFAULT_DRILL_PARAMS.sentenceMinLetters - 1), en)).toBe(false);
    expect(sentencesReady(at(DEFAULT_DRILL_PARAMS.sentenceMinLetters), en)).toBe(true);
    const noSentences: Corpus = { ...en, sentences: undefined };
    expect(sentencesReady(at(26), noSentences)).toBe(false);
  });

  it('use whole sentences typeable with the unlocked letters, about a minute long', () => {
    const s = at(DEFAULT_DRILL_PARAMS.sentenceMinLetters);
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
    const pool = sentencePool(s, en);
    const d = nextDrill(m, s, en, 'sentence', 9);
    expect(d.kind).toBe('sentence');
    expect(d.words.join(' ')).toBe(d.text);
    for (const c of letters(d.text)) expect(s.unlocked).toContain(c);
    // Every part of the text is one of the pool's sentences, none twice.
    let rest = d.text;
    let used = 0;
    while (rest.length > 0) {
      const hit = pool.find((p) => rest === p || rest.startsWith(p + ' '));
      expect(hit).toBeDefined();
      rest = rest.slice(hit!.length + 1);
      used++;
    }
    expect(used).toBeGreaterThan(1);
    expect(d.text.length).toBeGreaterThanOrEqual((s.paceWpm * 5 * DEFAULT_DRILL_PARAMS.coreSeconds) / 60);
    expect(nextDrill(m, s, en, 'sentence', 9)).toEqual(d);
  });

  it('avoid sentences from recent drills', () => {
    const s = at(26);
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
    const first = nextDrill(m, s, en, 'sentence', 3);
    const after = afterDrill(m, s, en, first, { wpm: 30, accuracy: 0.95 }).state;
    const second = nextDrill(m, after, en, 'sentence', 3);
    const overlap = second.words.filter((_, i) => first.text.includes(second.words.slice(i, i + 4).join(' '))).length;
    expect(overlap / second.words.length).toBeLessThan(0.5);
  });

  it('keep capitals and punctuation once those are unlocked', () => {
    const s: CurriculumState = { ...at(26), unlocked: [...order, CAPITALS, '.', ','] };
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
    const d = nextDrill(m, s, en, 'sentence', 2);
    expect(d.kind).toBe('sentence');
    expect(d.text).toMatch(/^\p{Lu}/u);
    expect(d.text).toMatch(/[.]$/);
    expect(d.baseWords.every((w) => w === w.toLowerCase() && /^\p{L}+$/u.test(w))).toBe(true);
    for (const c of d.text) expect(c === ' ' || openChars(s).has(c)).toBe(true);
  });

  it('drop sentences with a word the offensive-word filter blocks', () => {
    const s = at(26);
    const all = sentencePool(s, en).length;
    // A neutral stand-in term, added the way a corpus adds its own.
    const filtered: Corpus = { ...en, blockedSubstrings: ['the'] };
    const kept = sentencePool(s, filtered);
    expect(kept.length).toBeLessThan(all);
    expect(kept.every((x) => !x.split(' ').includes('the'))).toBe(true);
  });

  it('fall back to a core drill when too few sentences fit', () => {
    const s = at(DEFAULT_DRILL_PARAMS.sentenceMinLetters - 1);
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
    expect(nextDrill(m, s, en, 'sentence', 1).kind).toBe('core');
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

describe('capitals, punctuation and digits', () => {
  const allLetters = unlockOrder(en);
  const lettersDone: CurriculumState = { ...initialCurriculum(en, CTX), unlocked: [...allLetters], paceWpm: 30 };
  const drill = { kind: 'core' as const, words: ['line'] };
  const good = { wpm: 20, accuracy: 0.98 };

  it('unlocks capitals, then punctuation, then digits after the letters', () => {
    const steps = unlockSteps(en, 'qwerty-us');
    expect(steps.slice(0, 26)).toEqual(allLetters);
    expect(steps[26]).toBe(CAPITALS);
    expect(steps.slice(27, 27 + DEFAULT_PUNCTUATION.length)).toEqual(DEFAULT_PUNCTUATION);
    expect(steps.slice(-DIGIT_ORDER.length)).toEqual(DIGIT_ORDER);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it('skips marks the layout cannot type without AltGr', () => {
    const corpus: Corpus = { ...en, punctuation: ['.', '§'] };
    expect(unlockSteps(corpus, 'qwerty-us')).not.toContain('§');
    expect(unlockSteps(corpus, 'qwertz-de')).toContain('§');
  });

  it('knows which steps need Shift on which layout', () => {
    expect(needsShift(CAPITALS, 'qwerty-us')).toBe(true);
    expect(needsShift('?', 'qwerty-us')).toBe(true);
    expect(needsShift('-', 'qwertz-de')).toBe(false);
    expect(needsShift(';', 'qwerty-us')).toBe(false);
    expect(needsShift(';', 'qwertz-de')).toBe(true);
    expect(needsShift('1', 'qwerty-us')).toBe(false);
    expect(needsShift('1', 'azerty-fr')).toBe(true);
    expect(needsShift('()', 'qwerty-us')).toBe(true);
  });

  it('opens capitals only for unlocked letters, and brackets as a pair', () => {
    const open = openChars({ unlocked: ['e', 'n', CAPITALS, '()', '7'] });
    expect([...open].sort()).toEqual(['(', ')', '7', 'E', 'N', 'e', 'n'].sort());
  });

  it('unlocks capitals once every letter meets the bar, and judges them together', () => {
    const ready = fakeModel(allLetters.map((c) => key(c)));
    const { state, changes } = afterDrill(ready, lettersDone, en, drill, good);
    expect(state.unlocked.at(-1)).toBe(CAPITALS);
    expect(state.focusKey).toBe(CAPITALS);
    expect(changes).toContainEqual({ type: 'unlock', key: CAPITALS });

    // Ten practised capitals at 4 each: 40 together clears the evidence bar no single one does.
    const caps = allLetters.slice(0, 10).map((c) => key(c.toUpperCase(), { weight: 4 }));
    const m = fakeModel([...allLetters.map((c) => key(c)), ...caps]);
    expect(stepStats(m, CAPITALS, state)?.weight).toBe(40);
    const next = afterDrill(m, state, en, drill, good);
    expect(next.changes).toContainEqual({ type: 'focus-met', key: CAPITALS });
    expect(next.state.unlocked.at(-1)).toBe(DEFAULT_PUNCTUATION[0]);

    const sloppy = fakeModel([...allLetters.map((c) => key(c)), ...caps.map((k) => ({ ...k, errorRate: 0.1 }))]);
    expect(afterDrill(sloppy, state, en, drill, good).state.unlocked).toEqual(state.unlocked);
  });

  it('gives keys typed with Shift a looser speed bar', () => {
    // Tier 7 (50 WPM) wants 240 ms per key; 280 ms passes only with the Shift allowance.
    const s: CurriculumState = { ...lettersDone, tier: 7, unlocked: [...allLetters, CAPITALS, '.', '?'] };
    const slow = (c: string) => key(c, { latencyMs: 280 });
    const base = [...allLetters.map((c) => key(c, { latencyMs: 200 })), ...allLetters.map((c) => key(c.toUpperCase(), { latencyMs: 200 }))];
    const qSlow = fakeModel([...base, key('.', { latencyMs: 200 }), slow('?')]);
    expect(afterDrill(qSlow, s, en, drill, good).changes).toContainEqual({ type: 'unlock', key: ',' });
    const dotSlow = fakeModel([...base, slow('.'), key('?', { latencyMs: 200 })]);
    expect(afterDrill(dotSlow, s, en, drill, good).state.unlocked).toEqual(s.unlocked);
  });

  it('writes sentences with capitals and only unlocked marks', () => {
    const s: CurriculumState = { ...lettersDone, unlocked: [...allLetters, CAPITALS, '.', ','] };
    const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
    const open = openChars(s).add(' ');
    for (const seed of [1, 2, 3]) {
      const d = nextDrill(m, s, en, 'core', seed);
      expect(d.words.join(' ')).toBe(d.text);
      for (const c of d.text) expect(open.has(c)).toBe(true);
      expect(d.text).toMatch(/^\p{Lu}/u);
      expect(d.text.endsWith('.')).toBe(true);
      // Every sentence after a full stop starts with a capital.
      for (const m2 of d.text.matchAll(/\. (.)/gu)) expect(m2[1]).toMatch(/\p{Lu}/u);
      expect(d.baseWords.join(' ')).toMatch(/^[a-z ]+$/);
    }
  });

  it('leans on the focus step: brackets and digits show up often', () => {
    for (const step of ['()', '7']) {
      const s: CurriculumState = { ...lettersDone, unlocked: [...allLetters, CAPITALS, '.', step], focusKey: step };
      const m = buildWeaknessModel([], CTX, { now: NOW, ...modelOptions(s, en) });
      const d = nextDrill(m, s, en, 'core', 4);
      const ch = step === '()' ? '(' : '7';
      expect([...d.text].filter((c) => c === ch).length).toBeGreaterThanOrEqual(3);
      if (step === '()') expect([...d.text].filter((c) => c === ')').length).toBe([...d.text].filter((c) => c === '(').length);
    }
  });

  it('leaves words alone while only letters are unlocked', () => {
    const words = ['alpha', 'beta', 'gamma'];
    const out = decorate(words, { open: new Set('abglmpht'), focus: new Set(), targets: [], prio: () => 0, rand: seededRandom(1) });
    expect(out).toEqual(words);
  });

  it('opens Spanish questions and exclamations with ¿ and ¡', () => {
    const words = ['hola', 'mesa', 'casa', 'sol', 'mar', 'pan', 'luna', 'gato', 'perro', 'agua', 'cielo', 'leche'];
    const ctx = { open: new Set([...'abcdeghilmnoprstu', 'H', '.', '¿', '?', '¡', '!']), focus: new Set<string>(), targets: [], prio: () => 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const text = decorate(words, { ...ctx, rand: seededRandom(seed) }).join(' ');
      for (const sentence of text.match(/[^.?!]+[.?!]/g) ?? []) {
        const s = sentence.trim();
        expect(s.startsWith('¿'), s).toBe(s.endsWith('?'));
        expect(s.startsWith('¡'), s).toBe(s.endsWith('!'));
      }
    }
  });

  it('unlocks ¿ with ? and ¡ with ! for Spanish', () => {
    const steps = unlockSteps(es, 'qwerty-es');
    expect(steps).toContain('¿?');
    expect(stepChars('¿?', [])).toEqual(['¿', '?']);
    expect(steps).toContain('á');
  });

  it('leaves out capitals the layout cannot type, keeping the rest', () => {
    const caps = stepChars(CAPITALS, [...'aàeé'], 'azerty-fr');
    expect(caps).toEqual(['A', 'E']);
    expect(stepChars(CAPITALS, [...'aàeé'])).toEqual(['A', 'À', 'E', 'É']);
  });

  it('only hyphenates pairs the word filter allows', () => {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'theta'];
    const p = { ...DEFAULT_DRILL_PARAMS, focusMarkRate: 1 };
    const ctx = { open: new Set([...'abdeghlmopt', '-']), focus: new Set(['-']), targets: [], prio: () => 0 };
    expect(decorate(words, { ...ctx, rand: seededRandom(1) }, p).join(' ')).toContain('-');
    const out = decorate(words, { ...ctx, rand: seededRandom(1), blocked: (w) => w.length > 6 }, p);
    expect(out).toEqual(words);
  });

  it('keeps repeat penalties on the undecorated words', () => {
    const s: CurriculumState = { ...lettersDone, unlocked: [...allLetters, CAPITALS, '.'] };
    const d = nextDrill(fakeModel(allLetters.map((c) => key(c))), s, en, 'core', 2);
    const next = afterDrill(fakeModel([]), s, en, d, good).state;
    expect(next.recentWords.at(-1)).toEqual(d.baseWords);
  });
});
