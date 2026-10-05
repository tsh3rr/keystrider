import type { Corpus } from './corpus';
import { getLayout, howToType } from './layouts';
import { trigramModel } from './pseudowords';
import { eligibleSentences } from './sentences';
import { corpusFilter } from './wordfilter';
import type { KeystrokeEvent, PracticeContext } from './types';
import {
  corpusFrequencies, firstAttempts, pickFocusItems,
  type KeyStats, type WeaknessItem, type WeaknessModel, type WeaknessOptions,
} from './weakness';

/**
 * Adaptive drill generator: turns the weakness model into the next drill.
 *
 * Design: "Adaptive Drill Generator: Design" doc. The weakness model
 * measures; this module decides what to practise. Two pure functions do the
 * work: `nextDrill` writes a drill from the model and a small curriculum
 * state, `afterDrill` applies the unlock, stuck, tier, pace and recovery
 * rules once the drill is typed and the model rebuilt.
 *
 * Nothing here assumes English or QWERTY: letters, their unlock order and
 * the words all come from the language's `Corpus`.
 *
 * After the letters, the curriculum unlocks capitals (one step, judged on
 * all capital letters together), then the language's punctuation, then
 * digits. Words stay lowercase; `decorate` adds those characters to the
 * drill's words. Marks the layout cannot type (base or Shift layer) are
 * skipped, and anything typed with Shift on this layout gets a looser
 * speed bar, since the Shift press is part of its latency.
 */

export interface DrillParams {
  /** Letters unlocked at the start. */
  startKeys: number;
  /** Unlock bar: effective evidence n, error rate p̂ and latency (vs the tier target T). */
  unlockMinWeight: number;
  unlockMaxErrorRate: number;
  /** Latency bar multiplier for a key that kept blocking (stuck rule). */
  stuckLatencySlack: number;
  /** Latency bar multiplier for capitals and other characters typed with Shift on the layout. */
  shiftLatencySlack: number;
  /** Core drills in a row with the same single blocking key before the stuck rule applies (~3 sessions). */
  stuckDrills: number;
  /** Need added to the focus key and its bigrams. */
  focusBoost: number;
  /** Targets per drill and the softmax temperature used to pick them and words. */
  targets: number;
  temperature: number;
  /** Share of words that must contain a target, for core and focus drills. */
  coverage: number;
  focusCoverage: number;
  maxSwaps: number;
  /** Word score: length exponent, corpus-frequency pull λ, penalty ρ per recent drill and per repeat in this drill. */
  lengthExponent: number;
  frequencyPull: number;
  recentPenalty: number;
  repeatPenalty: number;
  /** Real-word share: all pseudo-words at or below `mixLow` eligible words, none at `mixHigh` (or the corpus size). */
  mixLow: number;
  mixHigh: number;
  pseudoPool: number;
  /** Seconds of text in a core drill at the learner's pace, and words in a focus burst. */
  coreSeconds: number;
  focusWords: number;
  /** A focus burst follows every this many core drills. */
  focusEvery: number;
  /** Within-drill gaps, in words, between repeats of one target. */
  spacing: readonly number[];
  /** Pace: step, raise at or above, lower below. */
  paceStep: number;
  paceUpAccuracy: number;
  paceDownAccuracy: number;
  minPaceWpm: number;
  /** Recovery: drills under `paceDownAccuracy` to enter, drills at `paceUpAccuracy` to leave. */
  recoveryEnter: number;
  recoveryExit: number;
  /** Tier: core drills averaged, at this accuracy. */
  tierWindow: number;
  tierAccuracy: number;
  /** How many drills `recentWords` remembers. */
  recentDrills: number;
  /** Sentence length in words, once capitals or sentence ends are unlocked. */
  sentenceMin: number;
  sentenceMax: number;
  /** Chance per word of a punctuation mark, and when a mark is the focus or a target. */
  markRate: number;
  focusMarkRate: number;
  /** Chance per word of a number before it, and when a digit is the focus or a target. */
  numberRate: number;
  focusNumberRate: number;
  /** Chance per word of an extra capital when capitals are the focus or a capital is a target. */
  focusCapitalRate: number;
  /** Warm-up: seconds of text, the stronger pull toward common words, and real words needed before pseudo-words are dropped. */
  warmupSeconds: number;
  warmupFrequencyPull: number;
  warmupMinReal: number;
  /** A pause this long between drills starts a new session, which opens with a warm-up. */
  sessionGapMinutes: number;
  /** Sentence drills need this many unlocked letters and this many sentences typeable with them. */
  sentenceMinLetters: number;
  sentenceMinCount: number;
}

export const DEFAULT_DRILL_PARAMS: Readonly<DrillParams> = Object.freeze({
  startKeys: 6,
  unlockMinWeight: 30,
  unlockMaxErrorRate: 0.04,
  stuckLatencySlack: 1.15,
  shiftLatencySlack: 1.3,
  stuckDrills: 20,
  focusBoost: 0.5,
  targets: 5,
  temperature: 0.3,
  coverage: 0.5,
  focusCoverage: 0.7,
  maxSwaps: 20,
  lengthExponent: 0.7,
  frequencyPull: 0.15,
  recentPenalty: 0.5,
  repeatPenalty: 0.5,
  mixLow: 50,
  mixHigh: 1000,
  pseudoPool: 150,
  coreSeconds: 60,
  focusWords: 15,
  focusEvery: 3,
  spacing: Object.freeze([3, 8, 20]),
  paceStep: 0.05,
  paceUpAccuracy: 0.96,
  paceDownAccuracy: 0.92,
  minPaceWpm: 8,
  recoveryEnter: 2,
  recoveryExit: 3,
  tierWindow: 5,
  tierAccuracy: 0.96,
  recentDrills: 3,
  sentenceMin: 4,
  sentenceMax: 9,
  markRate: 0.2,
  focusMarkRate: 0.45,
  numberRate: 0.05,
  focusNumberRate: 0.25,
  focusCapitalRate: 0.3,
  warmupSeconds: 45,
  warmupFrequencyPull: 0.6,
  warmupMinReal: 30,
  sessionGapMinutes: 30,
  sentenceMinLetters: 20,
  sentenceMinCount: 10,
});

/** Speed tiers in WPM. Tier n (1-based) sets the per-key latency target T = 12,000 / WPM ms. */
export const TIERS: readonly number[] = [15, 20, 25, 30, 35, 40, 50, 60, 75, 90, 110];

export function tierWpm(tier: number): number {
  return TIERS[Math.min(Math.max(tier, 1), TIERS.length) - 1];
}

export function tierTargetMs(tier: number): number {
  return 12_000 / tierWpm(tier);
}

/** What the generator remembers between drills, per language and layout. Plain data, so it serializes. */
export interface CurriculumState {
  version: 1;
  language: string;
  layout: string;
  /** Unlocked steps in unlock order: letters, then `CAPITALS`, punctuation marks (`()` for the pair) and digits. See `stepChars`. */
  unlocked: string[];
  /** Newest step, boosted until it first meets the unlock bar; or a stuck step. */
  focusKey: string | null;
  /** Steps the stuck rule gave a looser latency bar. */
  relaxedKeys: string[];
  /** The single step blocking the next unlock, and for how many core drills in a row. */
  blocker: string | null;
  blockedDrills: number;
  tier: number;
  paceWpm: number;
  recovery: boolean;
  /** Consecutive drills under the low accuracy mark, and at or above the high one. */
  lowStreak: number;
  goodStreak: number;
  /** Last core drills, newest last, for tier advancement. */
  coreHistory: { wpm: number; accuracy: number }[];
  coreDrills: number;
  /** Words of the last few drills, newest last. */
  recentWords: string[][];
}

/**
 * - warmup: opens a session; items due for review, in easy common words. Moves nothing.
 * - core: the adaptive drill; the only kind that unlocks keys and changes tier.
 * - focus: a short burst on the focus key, after every few core drills.
 * - sentence: real sentences, after a focus burst once enough letters are unlocked.
 */
export type DrillKind = 'warmup' | 'core' | 'focus' | 'sentence';

export interface Drill {
  text: string;
  /** What is typed, word by word, with capitals, punctuation and numbers. */
  words: string[];
  /** The corpus or pseudo-words behind `words`, lowercase, for repeat penalties. */
  baseWords: string[];
  /** Target items (keys like "e", bigrams like "th" or " t"). */
  targets: string[];
  kind: DrillKind;
  paceWpm: number;
  seed: number;
}

export interface DrillResult {
  /** Correct characters per minute / 5. */
  wpm: number;
  /** Share of positions typed right first time. */
  accuracy: number;
}

/** Something the learner should hear about after a drill. */
export type CurriculumChange =
  | { type: 'unlock'; key: string }
  | { type: 'focus-met'; key: string }
  | { type: 'stuck'; key: string }
  | { type: 'tier'; tier: number }
  | { type: 'recovery'; on: boolean };

// --- Curriculum ---

const isLetter = (c: string) => /^\p{L}$/u.test(c);
const isDigit = (c: string) => /^\p{Nd}$/u.test(c);
/** A letter with a distinct one-character capital, given in lowercase. */
const capitalOf = (c: string) => {
  const up = c.toUpperCase();
  return up !== c && [...up].length === 1 ? up : null;
};

/** The step that unlocks capital letters (typed with Shift). */
export const CAPITALS = 'Shift';

/** Punctuation steps when the corpus names none, roughly by frequency in English text. */
export const DEFAULT_PUNCTUATION: readonly string[] = ['.', ',', "'", '?', '-', '!', ':', ';', '"', '()'];

/** Digits, most frequent in running text first (Benford's law, years, round numbers). */
export const DIGIT_ORDER: readonly string[] = ['1', '2', '0', '3', '5', '4', '9', '6', '8', '7'];

/** Sentence-ending marks; after one, the next word starts with a capital. */
const ENDERS = new Set(['.', '?', '!']);
/** Marks that wrap a word instead of following it, and Spanish ¿…? and ¡…!, which wrap a sentence. */
const WRAPS = new Map([['"', ['"', '"']], ["'", ["'", "'"]], ['()', ['(', ')']], ['¿?', ['¿', '?']], ['¡!', ['¡', '!']]]);
/** Inverted marks that open a sentence ending in the given mark (Spanish). */
const OPENERS = new Map([['?', '¿'], ['!', '¡']]);
const OPENING = new Set(OPENERS.values());

/** Letters of the language in the order beginners unlock them: the corpus' own order, else by frequency. */
export function unlockOrder(corpus: Corpus): string[] {
  const letters = new Set<string>();
  for (const w of corpus.words) for (const c of w.normalize('NFC').toLowerCase()) if (isLetter(c)) letters.add(c);
  const given = (corpus.unlockOrder ?? []).filter((c) => letters.has(c));
  const freq = corpusFrequencies(corpus).keys;
  const rest = [...letters]
    .filter((c) => !given.includes(c))
    .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0) || (a < b ? -1 : 1));
  return [...given, ...rest];
}

/**
 * Every unlock step for the language on the layout: the letters, then
 * capitals, then the corpus' punctuation, then digits. Steps whose
 * characters the layout cannot type are left out, letters
 * included: German on US QWERTY drills words without ä, ö, ü and ß.
 */
export function unlockSteps(corpus: Corpus, layoutId: string): string[] {
  const known = getLayout(layoutId) !== undefined;
  const canType = (c: string) => !known || howToType(layoutId, c) !== null;
  const letters = unlockOrder(corpus).filter(canType);
  const typeable = (step: string) => stepChars(step, letters, layoutId).every(canType);
  // Capitals the layout lacks (À and Ç on AZERTY) are simply left out of the step; see `stepChars`.
  const capitals = stepChars(CAPITALS, letters, layoutId).length > 0 ? [CAPITALS] : [];
  const extra = [...capitals, ...(corpus.punctuation ?? DEFAULT_PUNCTUATION), ...DIGIT_ORDER];
  return [...letters, ...extra.filter(typeable)];
}

/**
 * The characters a step adds; capitals are the capitals of the given letters,
 * those the layout can type if one is given.
 */
export function stepChars(step: string, letters: readonly string[], layoutId?: string): string[] {
  if (step === CAPITALS) {
    const caps = letters.map(capitalOf).filter((c): c is string => c !== null);
    return layoutId !== undefined && getLayout(layoutId) ? caps.filter((c) => howToType(layoutId, c) !== null) : caps;
  }
  return WRAPS.get(step) ?? [...step];
}

/** Every character drills may use: unlocked letters and, once unlocked, their capitals, punctuation and digits. */
export function openChars(state: Pick<CurriculumState, 'unlocked'> & Partial<Pick<CurriculumState, 'layout'>>): Set<string> {
  const letters = state.unlocked.filter(isLetter);
  return new Set(state.unlocked.flatMap((step) => stepChars(step, letters, state.layout)));
}

/** Unlocked letters only: what corpus and pseudo-words are spelled with. */
function letterSet(state: Pick<CurriculumState, 'unlocked'>): Set<string> {
  return new Set(state.unlocked.filter(isLetter));
}

/** What the unlock bar reads from a step's stats. */
export type StepStats = Pick<KeyStats, 'item' | 'weight' | 'errorRate' | 'latencyMs'>;

/**
 * A step's stats: the key's own for one character, else pooled over its
 * characters (all capitals, both brackets), weighted by evidence.
 */
export function stepStats(
  model: WeaknessModel, step: string, state: Pick<CurriculumState, 'unlocked'> & Partial<Pick<CurriculumState, 'layout'>>,
): StepStats | undefined {
  const chars = stepChars(step, state.unlocked.filter(isLetter), state.layout);
  const byItem = new Map(model.keys.map((k) => [k.item, k]));
  if (chars.length === 1 && chars[0] === step) return byItem.get(step);
  const keys = chars.map((c) => byItem.get(c)).filter((k): k is KeyStats => k !== undefined);
  if (keys.length === 0) return undefined;
  const weight = keys.reduce((s, k) => s + k.weight, 0);
  const avg = (f: (k: KeyStats) => number) =>
    weight > 0 ? keys.reduce((s, k) => s + k.weight * f(k), 0) / weight : keys.reduce((s, k) => s + f(k), 0) / keys.length;
  return { item: step, weight, errorRate: avg((k) => k.errorRate), latencyMs: Math.exp(avg((k) => Math.log(k.latencyMs))) };
}

/** Whether typing a step's characters on the layout needs Shift, AltGr or a dead key: a second key that slows it down. */
export function needsShift(step: string, layoutId: string): boolean {
  if (step === CAPITALS) return true;
  return [...(WRAPS.get(step) ?? [step])].some((c) => {
    const how = howToType(layoutId, c);
    return how !== null && (how.shift || how.altGr === true || how.dead !== undefined);
  });
}

/** Where a step falls short of the unlock bar: too few tries, too many errors, too slow. */
export interface BarGap {
  few: boolean;
  errors: boolean;
  slow: boolean;
  /** The step's latency target in ms, with its slack. */
  targetMs: number;
}

/** How a key (or a step's pooled stats) compares with the unlock bar at the given tier. */
export function barGap(
  key: StepStats | undefined,
  state: Pick<CurriculumState, 'tier' | 'relaxedKeys'> & Partial<Pick<CurriculumState, 'layout'>>,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): BarGap {
  let slack = key && state.relaxedKeys.includes(key.item) ? p.stuckLatencySlack : 1;
  if (key && state.layout !== undefined && needsShift(key.item, state.layout)) slack *= p.shiftLatencySlack;
  const targetMs = tierTargetMs(state.tier) * slack;
  if (!key) return { few: true, errors: false, slow: false, targetMs };
  return {
    few: key.weight < p.unlockMinWeight,
    errors: key.errorRate > p.unlockMaxErrorRate,
    slow: key.latencyMs > targetMs,
    targetMs,
  };
}

/** Whether a key (or a step's pooled stats) meets the unlock bar at the given tier. */
export function meetsBar(
  key: StepStats | undefined,
  state: Pick<CurriculumState, 'tier' | 'relaxedKeys'> & Partial<Pick<CurriculumState, 'layout'>>,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): boolean {
  const gap = barGap(key, state, p);
  return !gap.few && !gap.errors && !gap.slow;
}

/** Unlocked steps that do not meet the bar yet, in unlock order. */
export function blockingKeys(model: WeaknessModel, state: CurriculumState, p: DrillParams = DEFAULT_DRILL_PARAMS): string[] {
  return state.unlocked.filter((k) => !meetsBar(stepStats(model, k, state), state, p));
}

/**
 * A fresh curriculum. With a model built from earlier typing, it doubles as
 * the placement test: the tier starts just under the learner's speed, and
 * every key in unlock order that already meets the bar is unlocked.
 */
export function initialCurriculum(
  corpus: Corpus,
  context: PracticeContext,
  model?: WeaknessModel,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): CurriculumState {
  const order = unlockSteps(corpus, context.layout);
  const state: CurriculumState = {
    version: 1,
    language: context.language,
    layout: context.layout,
    unlocked: order.slice(0, p.startKeys),
    focusKey: null,
    relaxedKeys: [],
    blocker: null,
    blockedDrills: 0,
    tier: 1,
    paceWpm: TIERS[0],
    recovery: false,
    lowStreak: 0,
    goodStreak: 0,
    coreHistory: [],
    coreDrills: 0,
    recentWords: [],
  };
  if (!model || model.baseline.attempts < 100) return state;

  // The baseline is the learner's typical speed; place a little under it so most keys can pass.
  const placed = TIERS.filter((w) => w <= model.baseline.wpm * 0.8).length;
  state.tier = Math.max(1, placed);
  state.paceWpm = Math.max(TIERS[0], Math.round(model.baseline.wpm));
  if (state.unlocked.every((k) => meetsBar(stepStats(model, k, state), state, p))) {
    for (const k of order.slice(p.startKeys)) {
      if (!meetsBar(stepStats(model, k, { unlocked: [...state.unlocked, k] }), state, p)) break;
      state.unlocked.push(k);
    }
  }
  return state;
}

/** Options for `buildWeaknessModel` so unlocked keys and their bigrams are scored even before they are typed. */
export function modelOptions(state: CurriculumState, corpus: Corpus): Pick<WeaknessOptions, 'includeKeys' | 'includeBigrams'> {
  const bigrams = new Set<string>();
  for (const w of eligibleWords(corpus, letterSet(state))) {
    const chars = [' ', ...w, ' '];
    for (let i = 1; i < chars.length; i++) bigrams.add(chars[i - 1] + chars[i]);
  }
  return { includeKeys: [' ', ...openChars(state)], includeBigrams: bigrams };
}

const ranks = new WeakMap<Corpus, Map<string, number>>();

/** Each corpus word's frequency rank (0 = most common), computed once per corpus. */
function wordRanks(corpus: Corpus): Map<string, number> {
  const cached = ranks.get(corpus);
  if (cached) return cached;
  const m = new Map<string, number>();
  corpus.words.forEach((raw, i) => {
    const w = raw.normalize('NFC').toLowerCase();
    if (!m.has(w)) m.set(w, i);
  });
  ranks.set(corpus, m);
  return m;
}

/** Corpus words, lowercased, that use only the given letters and aren't offensive. */
export function eligibleWords(corpus: Corpus, allowed: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const blocked = corpusFilter(corpus);
  for (const raw of corpus.words) {
    const w = raw.normalize('NFC').toLowerCase();
    if (!seen.has(w) && [...w].every((c) => allowed.has(c)) && !blocked(w)) out.push(w);
    seen.add(w);
  }
  return out;
}

/** The characters of the focus step, if any. */
function focusChars(state: CurriculumState): Set<string> {
  return new Set(state.focusKey === null ? [] : stepChars(state.focusKey, state.unlocked.filter(isLetter), state.layout));
}

/**
 * The model's items with the generator's two additions: anything with a
 * locked character gets priority 0, and the focus step's keys and their
 * bigrams get `focusBoost` added to their need. Highest priority first.
 */
export function adjustedItems(model: WeaknessModel, state: CurriculumState, p: DrillParams = DEFAULT_DRILL_PARAMS): WeaknessItem[] {
  const open = openChars(state).add(' ');
  const focus = focusChars(state);
  return model.ranked
    .map((it) => {
      if (![...it.item].every((c) => open.has(c))) return { ...it, priority: 0 };
      if (![...it.item].some((c) => focus.has(c))) return it;
      const need = it.need + p.focusBoost;
      return { ...it, need, priority: need * (0.5 + 0.5 * it.frequency) };
    })
    .sort((a, b) => b.priority - a.priority || (a.item < b.item ? -1 : 1));
}

// --- Text generation ---

/** Small seeded PRNG (mulberry32), so a drill is reproducible from its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether a word exercises an item; bigrams include the spaces around the word. */
export function exercises(word: string, item: string): boolean {
  return (' ' + word + ' ').includes(item);
}

interface Candidate {
  word: string;
  pseudo: boolean;
  /** Priority per keystroke plus the frequency pull, before penalties. */
  base: number;
}

/** Share of pseudo-words for a number of eligible real words. */
export function pseudoShare(eligible: number, corpusSize: number, p: DrillParams = DEFAULT_DRILL_PARAMS): number {
  const high = Math.max(p.mixLow + 1, Math.min(p.mixHigh, corpusSize));
  if (eligible <= p.mixLow) return 1;
  if (eligible >= high) return 0;
  return (high - eligible) / (high - p.mixLow);
}

function softmaxPick<T>(items: readonly T[], score: (t: T) => number, temperature: number, rand: () => number): T {
  const scores = items.map(score);
  const top = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - top) / temperature));
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
}

/**
 * Writes the next drill. Pure: the same model, state, corpus, kind and seed
 * always give the same drill.
 */
export function nextDrill(
  model: WeaknessModel,
  state: CurriculumState,
  corpus: Corpus,
  kind: DrillKind,
  seed: number,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): Drill {
  if (kind === 'sentence') {
    const drill = sentenceDrill(model, state, corpus, seed, p);
    if (drill) return drill;
    kind = 'core';
  }
  const rand = seededRandom(seed);
  // A warm-up ranks by review; with nothing due yet it falls back to the usual ranking.
  const review = kind === 'warmup' ? reviewItems(model, state) : [];
  const items = review.some((it) => it.priority > 0 && it.item !== ' ') ? review : adjustedItems(model, state, p);
  const priority = new Map(items.map((it) => [it.item, it.priority]));
  const prio = (item: string) => priority.get(item) ?? 0;
  const allowed = letterSet(state);

  const targets = chooseTargets(items, state, kind, rand, p);
  // Targets made of letters steer word choice; the rest (capitals, marks, digits) steer `decorate`.
  const wordTargets = targets.filter((t) => [...t].every((c) => c === ' ' || allowed.has(c)));

  // Candidates: real words from the corpus, plus pseudo-words leaning into weak transitions.
  // A warm-up keeps to real words as soon as there are enough of them.
  const real = eligibleWords(corpus, allowed);
  const share = kind === 'warmup' && real.length >= p.warmupMinReal ? 0 : pseudoShare(real.length, corpus.words.length, p);
  const pull = kind === 'warmup' ? p.warmupFrequencyPull : p.frequencyPull;
  const rank = wordRanks(corpus);
  const tri = trigramModel(corpus);
  const pseudo = new Set<string>();
  if (share > 0) {
    for (let tries = 0; pseudo.size < p.pseudoPool && tries < p.pseudoPool * 10; tries++) {
      const w = tri.sample({ allowed, boost: prio, rand });
      if (w !== null && tri.acceptable(w)) pseudo.add(w);
    }
  }
  const valueOf = (w: string) => textValue(w, prio) / Math.pow([...w].length, p.lengthExponent);
  const rareLog = -Math.log(corpus.words.length + 1);
  const candidates: Candidate[] = [
    ...real.map((word) => ({ word, pseudo: false, base: valueOf(word) - pull * Math.log((rank.get(word) ?? 0) + 1) })),
    ...[...pseudo].map((word) => ({ word, pseudo: true, base: valueOf(word) + pull * rareLog })),
  ];
  if (candidates.length === 0) throw new Error('No words can be made from the unlocked letters');

  const recent = new Map<string, number>();
  for (const drill of state.recentWords) for (const w of new Set(drill)) recent.set(w, (recent.get(w) ?? 0) + 1);
  const used = new Map<string, number>();
  const score = (c: Candidate) =>
    c.base - p.recentPenalty * (recent.get(c.word) ?? 0) - p.repeatPenalty * (used.get(c.word) ?? 0);
  const realPool = candidates.filter((c) => !c.pseudo);
  const pseudoPool = candidates.filter((c) => c.pseudo);
  const draw = (pool: Candidate[]) => {
    const c = softmaxPick(pool, score, p.temperature, rand);
    used.set(c.word, (used.get(c.word) ?? 0) + 1);
    return c;
  };
  const drawAny = () => {
    const usePseudo = pseudoPool.length > 0 && (realPool.length === 0 || rand() < share);
    return draw(usePseudo ? pseudoPool : realPool);
  };

  // Fill to about `coreSeconds` of typing at the learner's pace (or a fixed count for a focus burst).
  const picked: Candidate[] = [];
  const budget = (state.paceWpm * 5 * (kind === 'warmup' ? p.warmupSeconds : p.coreSeconds)) / 60;
  let length = 0;
  while (kind === 'focus' ? picked.length < p.focusWords : length < budget || picked.length < 5) {
    const c = drawAny();
    picked.push(c);
    length += c.word.length + 1;
  }

  // Coverage: swap the weakest non-target words for target words until enough words hit a target.
  const hits = (w: string) => wordTargets.some((t) => exercises(w, t));
  const withTarget = candidates.filter((c) => hits(c.word));
  const need = Math.ceil((kind === 'focus' ? p.focusCoverage : p.coverage) * picked.length);
  for (let swaps = 0; swaps < p.maxSwaps && withTarget.length > 0; swaps++) {
    if (picked.filter((c) => hits(c.word)).length >= need) break;
    const worst = lowestWithout(picked, hits);
    if (worst < 0) break;
    release(used, picked[worst].word);
    picked[worst] = draw(withTarget);
  }

  // Confusions: for a target key often typed as another unlocked key, add a word with that key too.
  for (const t of wordTargets) {
    const key = model.keys.find((k) => k.item === t);
    const confused = key?.confusions.find((c) => allowed.has(c.typed) && c.weight >= 1)?.typed;
    if (!confused) continue;
    const pool = candidates.filter((c) => c.word.includes(confused));
    const slot = lowestWithout(picked, (w) => hits(w) || w.includes(confused));
    if (pool.length === 0 || slot < 0) continue;
    release(used, picked[slot].word);
    picked[slot] = draw(pool);
  }

  const baseWords = spaceOut(picked.map((c) => c.word), wordTargets, p.spacing, rand);
  const blocked = corpusFilter(corpus);
  const words = decorate(baseWords, { open: openChars(state), focus: focusChars(state), targets, prio, rand, blocked }, p);
  return { text: words.join(' '), words, baseWords, targets, kind, paceWpm: state.paceWpm, seed };
}

export interface DecorateContext {
  /** Characters the drill may use (`openChars`). */
  open: ReadonlySet<string>;
  /** Characters of the focus step: used much more often. */
  focus: ReadonlySet<string>;
  /** The drill's targets: their characters are used more often too. */
  targets: readonly string[];
  /** Priority of a key or bigram; weak marks and digits are picked more. */
  prio: (item: string) => number;
  rand: () => number;
  /** The offensive-word filter: two words are only hyphenated when the pair isn't blocked. */
  blocked?: (word: string) => boolean;
}

/**
 * Adds the unlocked capitals, punctuation and digits to lowercase words:
 * sentences of a few words that start with a capital and end with . ? or !,
 * marks after words (, ; :), hyphenated pairs, words in quotes or brackets,
 * and short numbers. With only letters unlocked the words come back as
 * they are. Pure given `rand`.
 */
export function decorate(words: readonly string[], ctx: DecorateContext, p: DrillParams = DEFAULT_DRILL_PARAMS): string[] {
  const { open, focus, rand } = ctx;
  const hot = (c: string) => focus.has(c) || ctx.targets.some((t) => t.includes(c));
  const weightOf = (c: string) => (1 + ctx.prio(c)) * (hot(c) ? 3 : 1);
  const pick = (options: readonly string[]) => {
    let r = rand() * options.reduce((sum, c) => sum + weightOf(c), 0);
    for (const c of options) if ((r -= weightOf(c)) < 0) return c;
    return options[options.length - 1];
  };

  const chars = [...open];
  const digits = chars.filter(isDigit);
  const marks = chars.filter((c) => !isLetter(c) && !isDigit(c) && c !== ' ' && c !== ')' && !OPENING.has(c));
  const enders = marks.filter((c) => ENDERS.has(c));
  // Brackets go in pairs: "(" stands for the pair.
  const others = marks.filter((c) => !ENDERS.has(c)).map((c) => (c === '(' ? (open.has(')') ? '()' : null) : c))
    .filter((c): c is string => c !== null);
  const capitals = chars.some((c) => c !== c.toLowerCase());
  const capital = (w: string) => {
    const up = capitalOf(w[0] ?? '');
    return up !== null && open.has(up) ? up + w.slice(1) : w;
  };
  const sentences = capitals || enders.length > 0;
  const sentenceLength = () => p.sentenceMin + Math.floor(rand() * (p.sentenceMax - p.sentenceMin + 1));
  const markRate = others.some((m) => [...(WRAPS.get(m) ?? [m])].some(hot)) ? p.focusMarkRate : p.markRate;
  const numberRate = digits.some(hot) ? p.focusNumberRate : p.numberRate;
  const capRate = chars.some((c) => c !== c.toLowerCase() && hot(c)) ? p.focusCapitalRate : 0;
  const number = () => {
    const n = 1 + Math.floor(rand() * 3);
    let out = '';
    for (let i = 0; i < n; i++) out += pick(digits);
    return out;
  };

  // With ¿ or ¡ unlocked the ending is picked when a sentence starts, so the sentence can open with its inverted mark.
  const opens = enders.some((c) => open.has(OPENERS.get(c) ?? ''));
  let ender = '';

  const out: string[] = [];
  let left = sentences ? sentenceLength() : Infinity;
  let start = true;
  for (let i = 0; i < words.length; i++) {
    if (digits.length > 0 && rand() < numberRate) out.push(number());
    let token = words[i];
    if (capitals && (start || rand() < capRate)) token = capital(token);
    if (start && opens) {
      ender = pick(enders);
      const opener = OPENERS.get(ender);
      if (opener && open.has(opener)) token = opener + token;
    }
    start = false;
    left--;
    const last = i === words.length - 1;
    if (sentences && (left <= 0 || last)) {
      if (enders.length > 0) token += opens ? ender : pick(enders);
      start = true;
      left = sentenceLength();
    } else if (others.length > 0 && rand() < markRate) {
      const m = pick(others);
      const wrap = WRAPS.get(m);
      if (wrap) token = wrap[0] + token + wrap[1];
      else if (m === '-') {
        const next = words[i + 1];
        if (!last && !ctx.blocked?.(token.toLowerCase() + next) && !ctx.blocked?.(token.toLowerCase() + '-' + next)) {
          token += '-' + words[++i];
          left--;
        }
      } else token += m;
    }
    out.push(token);
  }
  return out;
}

/** Priority a text carries: its keys and bigrams, counting the spaces around it. */
function textValue(text: string, prio: (item: string) => number): number {
  const chars = [' ', ...text, ' '];
  let sum = prio(' ');
  for (let i = 1; i < chars.length; i++) {
    if (i < chars.length - 1) sum += prio(chars[i]);
    sum += prio(chars[i - 1] + chars[i]);
  }
  return sum;
}

/**
 * Items for a warm-up, ranked by how overdue their review is rather than by
 * overall need, so the warm-up revisits what is fading, not what is hardest.
 * Locked items stay at 0; there is no focus boost.
 */
export function reviewItems(model: WeaknessModel, state: Pick<CurriculumState, 'unlocked'>): WeaknessItem[] {
  const open = openChars(state).add(' ');
  return model.ranked
    .map((it) => ({
      ...it,
      priority: [...it.item].every((c) => open.has(c)) ? it.components.review * (0.5 + 0.5 * it.frequency) : 0,
    }))
    .sort((a, b) => b.priority - a.priority || (a.item < b.item ? -1 : 1));
}

/**
 * Corpus sentences typeable with the unlocked characters, in practice form:
 * with their capitals and punctuation once those are unlocked, simplified before.
 */
export function sentencePool(state: Pick<CurriculumState, 'unlocked'>, corpus: Corpus): string[] {
  return eligibleSentences(corpus, openChars(state), corpusFilter(corpus));
}

/** Whether sentence drills are open: enough letters unlocked and enough sentences to draw from. */
export function sentencesReady(state: Pick<CurriculumState, 'unlocked'>, corpus: Corpus, p: DrillParams = DEFAULT_DRILL_PARAMS): boolean {
  return letterSet(state).size >= p.sentenceMinLetters && sentencePool(state, corpus).length >= p.sentenceMinCount;
}

/** A sentence's words as plain lowercase letters, like a drill's `baseWords`. */
function sentenceBase(sentence: string): string[] {
  return sentence.toLowerCase().split(' ').map((w) => w.replace(/[^\p{L}\p{M}]/gu, '')).filter((w) => w.length > 0);
}

/**
 * A drill of whole sentences, about `coreSeconds` long, drawn by the same
 * priority as core drills (per keystroke, so long sentences don't win on
 * length) and avoiding sentences from recent drills. Null when too few
 * sentences can be typed with the unlocked keys.
 */
function sentenceDrill(model: WeaknessModel, state: CurriculumState, corpus: Corpus, seed: number, p: DrillParams): Drill | null {
  if (letterSet(state).size < p.sentenceMinLetters) return null;
  const pool = sentencePool(state, corpus);
  if (pool.length < p.sentenceMinCount) return null;
  const rand = seededRandom(seed);
  const items = adjustedItems(model, state, p);
  const priority = new Map(items.map((it) => [it.item, it.priority]));
  const prio = (item: string) => priority.get(item) ?? 0;
  const targets = chooseTargets(items, state, 'core', rand, p);

  const recent = state.recentWords.map((words) => ' ' + words.join(' ') + ' ');
  const score = (s: string) => {
    const base = ' ' + sentenceBase(s).join(' ') + ' ';
    return textValue(s, prio) / [...s].length - p.recentPenalty * recent.filter((t) => t.includes(base)).length;
  };
  const budget = (state.paceWpm * 5 * p.coreSeconds) / 60;
  const rest = [...pool];
  const picked: string[] = [];
  let length = 0;
  while (rest.length > 0 && (picked.length === 0 || length < budget)) {
    const s = softmaxPick(rest, score, p.temperature, rand);
    rest.splice(rest.indexOf(s), 1);
    picked.push(s);
    length += [...s].length + 1;
  }
  const text = picked.join(' ');
  return { text, words: text.split(' '), baseWords: picked.flatMap(sentenceBase), targets, kind: 'sentence', paceWpm: state.paceWpm, seed };
}

function release(used: Map<string, number>, word: string): void {
  used.set(word, (used.get(word) ?? 1) - 1);
}

/** Index of the lowest-scoring picked word that fails `keep`, or -1. */
function lowestWithout(picked: readonly Candidate[], keep: (w: string) => boolean): number {
  let worst = -1;
  picked.forEach((c, i) => {
    if (!keep(c.word) && (worst < 0 || c.base < picked[worst].base)) worst = i;
  });
  return worst;
}

function chooseTargets(
  items: readonly WeaknessItem[],
  state: CurriculumState,
  kind: DrillKind,
  rand: () => number,
  p: DrillParams,
): string[] {
  // The space key is in every word gap, so as a target it says nothing; its bigrams still count.
  const pool = items.filter((it) => it.priority > 0 && it.item !== ' ');
  // A warm-up takes the most overdue items as they come; no focus key, no sampling.
  if (kind === 'warmup') return pool.slice(0, p.targets).map((it) => it.item);
  // The focus step's weakest keys (one for a letter, up to two for capitals or brackets).
  const fc = focusChars(state);
  const focusKeys = state.focusKey === null ? [] : [
    ...pool.filter((it) => it.kind === 'key' && fc.has(it.item)).map((it) => it.item),
    ...[...fc].filter((c) => !pool.some((it) => it.item === c)),
  ].slice(0, 2);
  const focus = focusKeys.length ? focusKeys : [pool.find((it) => it.kind === 'key')?.item].filter((k): k is string => k !== undefined);
  if (kind === 'focus' && focus.length > 0) {
    // The focus keys and their weakest bigrams.
    const bigrams = pool
      .filter((it) => it.kind === 'bigram' && focus.some((f) => it.item.includes(f)))
      .slice(0, p.targets - focus.length);
    return [...focus, ...bigrams.map((it) => it.item)];
  }
  const picked = pickFocusItems(
    { ranked: pool } as unknown as WeaknessModel,
    { count: p.targets, temperature: p.temperature, rand },
  ).map((it) => it.item);
  if (focusKeys.length && !picked.includes(focusKeys[0])) {
    picked.pop();
    picked.unshift(focusKeys[0]);
  }
  return picked;
}

/**
 * Orders words so repeats of one target are spread out: the k-th repeat
 * wants a gap of at least `spacing[k]` words. Greedy; when nothing fits it
 * takes the word that breaks the rule least.
 */
export function spaceOut(words: readonly string[], targets: readonly string[], spacing: readonly number[], rand: () => number): string[] {
  const rest = [...words];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out: string[] = [];
  const last = new Map<string, number>();
  const seen = new Map<string, number>();
  while (rest.length) {
    let best = 0;
    let bestCost = Infinity;
    rest.forEach((w, i) => {
      let cost = out.length && out[out.length - 1] === w ? 100 : 0;
      for (const t of targets) {
        if (!exercises(w, t) || !last.has(t)) continue;
        const want = spacing[Math.min((seen.get(t) ?? 1) - 1, spacing.length - 1)];
        cost += Math.max(0, want - (out.length - last.get(t)!));
      }
      if (cost < bestCost) [best, bestCost] = [i, cost];
    });
    const [w] = rest.splice(best, 1);
    for (const t of targets) {
      if (!exercises(w, t)) continue;
      last.set(t, out.length);
      seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    out.push(w);
  }
  return out;
}

// --- After a drill ---

/** Speed and first-attempt accuracy of one typed drill. */
export function drillResult(events: readonly KeystrokeEvent[]): DrillResult {
  const attempts = firstAttempts(events, Infinity);
  const errors = attempts.filter((a) => a.error).length;
  const correct = events.filter((e) => e.correct);
  const span = events.length ? Math.max(...correct.map((e) => e.timestamp)) - Math.min(...events.map((e) => e.timestamp)) : 0;
  return {
    // The first key starts the clock, so it is not counted as typed within the span.
    wpm: span > 0 ? (Math.max(correct.length - 1, 0) / 5) / (span / 60_000) : 0,
    accuracy: attempts.length ? 1 - errors / attempts.length : 1,
  };
}

/**
 * Applies the curriculum rules after a drill. `model` is the weakness model
 * rebuilt with the drill's keystrokes. Returns the new state and what changed.
 */
export function afterDrill(
  model: WeaknessModel,
  state: CurriculumState,
  corpus: Corpus,
  drill: Pick<Drill, 'kind' | 'words'> & Partial<Pick<Drill, 'baseWords'>>,
  result: DrillResult,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): { state: CurriculumState; changes: CurriculumChange[] } {
  const s: CurriculumState = structuredClone(state);
  const changes: CurriculumChange[] = [];
  s.recentWords = [...s.recentWords, drill.baseWords ?? drill.words].slice(-p.recentDrills);
  // A warm-up is typed cold, so it moves neither pace nor recovery.
  if (drill.kind === 'warmup') return { state: s, changes };

  // Pace: up 5% after a clean drill, down after a sloppy one.
  if (result.accuracy >= p.paceUpAccuracy) s.paceWpm *= 1 + p.paceStep;
  else if (result.accuracy < p.paceDownAccuracy) s.paceWpm = Math.max(p.minPaceWpm, s.paceWpm * (1 - p.paceStep));
  s.paceWpm = Math.round(s.paceWpm * 10) / 10;

  // Recovery: enter after two sloppy drills in a row, leave after three clean ones.
  s.lowStreak = result.accuracy < p.paceDownAccuracy ? s.lowStreak + 1 : 0;
  s.goodStreak = result.accuracy >= p.paceUpAccuracy ? s.goodStreak + 1 : 0;
  if (!s.recovery && s.lowStreak >= p.recoveryEnter) {
    s.recovery = true;
    s.goodStreak = 0;
    changes.push({ type: 'recovery', on: true });
  } else if (s.recovery && s.goodStreak >= p.recoveryExit) {
    s.recovery = false;
    changes.push({ type: 'recovery', on: false });
  }

  // Unlocks and tiers only move on core drills.
  if (drill.kind !== 'core') return { state: s, changes };
  s.coreDrills++;
  s.coreHistory = [...s.coreHistory, result].slice(-p.tierWindow);

  if (s.focusKey !== null && meetsBar(stepStats(model, s.focusKey, s), s, p)) {
    changes.push({ type: 'focus-met', key: s.focusKey });
    s.focusKey = null;
  }

  const blocking = blockingKeys(model, s, p);
  const next = unlockSteps(corpus, s.layout).find((k) => !s.unlocked.includes(k));
  if (blocking.length === 0 && next !== undefined) {
    s.unlocked.push(next);
    s.focusKey = next;
    s.blocker = null;
    s.blockedDrills = 0;
    changes.push({ type: 'unlock', key: next });
  } else if (blocking.length === 1) {
    // Stuck rule: one key holding everything up for long gets a looser latency bar and the focus.
    s.blockedDrills = s.blocker === blocking[0] ? s.blockedDrills + 1 : 1;
    s.blocker = blocking[0];
    if (s.blockedDrills >= p.stuckDrills && !s.relaxedKeys.includes(s.blocker)) {
      s.relaxedKeys.push(s.blocker);
      s.focusKey = s.blocker;
      changes.push({ type: 'stuck', key: s.blocker });
    }
  } else {
    s.blocker = null;
    s.blockedDrills = 0;
  }

  // Tier: the last few core drills average the tier's speed, accurately, and no new key is still settling in.
  const h = s.coreHistory;
  const avg = (f: (r: DrillResult) => number) => h.reduce((sum, r) => sum + f(r), 0) / h.length;
  if (
    s.focusKey === null &&
    s.tier < TIERS.length &&
    h.length >= p.tierWindow &&
    avg((r) => r.wpm) >= tierWpm(s.tier) &&
    avg((r) => r.accuracy) >= p.tierAccuracy
  ) {
    s.tier++;
    s.coreHistory = [];
    changes.push({ type: 'tier', tier: s.tier });
  }
  return { state: s, changes };
}

export interface KindOptions {
  /** This drill opens a practice session (see `isNewSession`). */
  newSession?: boolean;
  /** Sentence drills are open (see `sentencesReady`). */
  sentences?: boolean;
}

/**
 * What kind of drill comes next: a warm-up to open a session (once there is
 * history to review), a focus burst after every `focusEvery` core drills, and
 * a sentence drill after each focus burst once sentences are open. That makes
 * about one full-length drill in four a sentence drill, as the design asks.
 */
export function nextKind(
  state: CurriculumState,
  last: DrillKind | null,
  opts: KindOptions = {},
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): DrillKind {
  if (opts.newSession && state.coreDrills > 0) return 'warmup';
  if (last === 'focus' && opts.sentences) return 'sentence';
  return last === 'core' && state.coreDrills > 0 && state.coreDrills % p.focusEvery === 0 ? 'focus' : 'core';
}

/** Whether a drill starting at `now` opens a new session: the first drill, or the first after a long pause. */
export function isNewSession(lastDrillAt: number | null, now: number, p: DrillParams = DEFAULT_DRILL_PARAMS): boolean {
  return lastDrillAt === null || now - lastDrillAt >= p.sessionGapMinutes * 60_000;
}

export interface ItemChange {
  item: string;
  kind: 'key' | 'bigram';
  /** Priority after minus before: negative means it improved. */
  delta: number;
}

/** The items in a drill whose priority fell (improved) or rose (slipped) most. */
export function drillFeedback(
  before: WeaknessModel,
  after: WeaknessModel,
  drill: Pick<Drill, 'words'>,
  count = 3,
): { improved: ItemChange[]; slipped: ItemChange[] } {
  const old = new Map(before.ranked.map((it) => [it.item, it.priority]));
  const changes: ItemChange[] = [];
  for (const it of after.ranked) {
    if (it.item === ' ' || !drill.words.some((w) => exercises(w, it.item))) continue;
    const prev = old.get(it.item);
    if (prev !== undefined && it.priority !== prev) changes.push({ item: it.item, kind: it.kind, delta: it.priority - prev });
  }
  changes.sort((a, b) => a.delta - b.delta);
  return {
    improved: changes.filter((c) => c.delta < 0).slice(0, count),
    slipped: changes.filter((c) => c.delta > 0).reverse().slice(0, count),
  };
}
