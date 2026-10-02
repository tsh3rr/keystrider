import type { Corpus } from './corpus';
import { trigramModel } from './pseudowords';
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
 */

export interface DrillParams {
  /** Letters unlocked at the start. */
  startKeys: number;
  /** Unlock bar: effective evidence n, error rate p̂ and latency (vs the tier target T). */
  unlockMinWeight: number;
  unlockMaxErrorRate: number;
  /** Latency bar multiplier for a key that kept blocking (stuck rule). */
  stuckLatencySlack: number;
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
}

export const DEFAULT_DRILL_PARAMS: Readonly<DrillParams> = Object.freeze({
  startKeys: 6,
  unlockMinWeight: 30,
  unlockMaxErrorRate: 0.04,
  stuckLatencySlack: 1.15,
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
  /** Unlocked letters, in unlock order. */
  unlocked: string[];
  /** Newest key, boosted until it first meets the unlock bar; or a stuck key. */
  focusKey: string | null;
  /** Keys the stuck rule gave a looser latency bar. */
  relaxedKeys: string[];
  /** The single key blocking the next unlock, and for how many core drills in a row. */
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

export type DrillKind = 'core' | 'focus';

export interface Drill {
  text: string;
  words: string[];
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

/** Whether a key meets the unlock bar at the given tier. */
export function meetsBar(
  key: KeyStats | undefined,
  state: Pick<CurriculumState, 'tier' | 'relaxedKeys'>,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): boolean {
  if (!key) return false;
  const slack = state.relaxedKeys.includes(key.item) ? p.stuckLatencySlack : 1;
  return (
    key.weight >= p.unlockMinWeight &&
    key.errorRate <= p.unlockMaxErrorRate &&
    key.latencyMs <= tierTargetMs(state.tier) * slack
  );
}

/** Unlocked keys that do not meet the bar yet, in unlock order. */
export function blockingKeys(model: WeaknessModel, state: CurriculumState, p: DrillParams = DEFAULT_DRILL_PARAMS): string[] {
  const byItem = new Map(model.keys.map((k) => [k.item, k]));
  return state.unlocked.filter((k) => !meetsBar(byItem.get(k), state, p));
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
  const order = unlockOrder(corpus);
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
  const byItem = new Map(model.keys.map((k) => [k.item, k]));
  if (state.unlocked.every((k) => meetsBar(byItem.get(k), state, p))) {
    for (const k of order.slice(p.startKeys)) {
      if (!meetsBar(byItem.get(k), state, p)) break;
      state.unlocked.push(k);
    }
  }
  return state;
}

/** Options for `buildWeaknessModel` so unlocked keys and their bigrams are scored even before they are typed. */
export function modelOptions(state: CurriculumState, corpus: Corpus): Pick<WeaknessOptions, 'includeKeys' | 'includeBigrams'> {
  const bigrams = new Set<string>();
  for (const w of eligibleWords(corpus, new Set(state.unlocked))) {
    const chars = [' ', ...w, ' '];
    for (let i = 1; i < chars.length; i++) bigrams.add(chars[i - 1] + chars[i]);
  }
  return { includeKeys: [' ', ...state.unlocked], includeBigrams: bigrams };
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

/**
 * The model's items with the generator's two additions: anything with a
 * locked letter gets priority 0, and the focus key and its bigrams get
 * `focusBoost` added to their need. Highest priority first.
 */
export function adjustedItems(model: WeaknessModel, state: CurriculumState, p: DrillParams = DEFAULT_DRILL_PARAMS): WeaknessItem[] {
  const open = new Set([' ', ...state.unlocked]);
  return model.ranked
    .map((it) => {
      if (![...it.item].every((c) => open.has(c))) return { ...it, priority: 0 };
      if (state.focusKey === null || !it.item.includes(state.focusKey)) return it;
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
  const rand = seededRandom(seed);
  const items = adjustedItems(model, state, p);
  const priority = new Map(items.map((it) => [it.item, it.priority]));
  const prio = (item: string) => priority.get(item) ?? 0;
  const allowed = new Set(state.unlocked);

  const targets = chooseTargets(items, state, kind, rand, p);

  // Candidates: real words from the corpus, plus pseudo-words leaning into weak transitions.
  const real = eligibleWords(corpus, allowed);
  const share = pseudoShare(real.length, corpus.words.length, p);
  const rank = new Map(real.map((w) => [w, corpus.words.indexOf(w)]));
  const tri = trigramModel(corpus);
  const pseudo = new Set<string>();
  if (share > 0) {
    for (let tries = 0; pseudo.size < p.pseudoPool && tries < p.pseudoPool * 10; tries++) {
      const w = tri.sample({ allowed, boost: prio, rand });
      if (w !== null && tri.acceptable(w)) pseudo.add(w);
    }
  }
  const valueOf = (w: string) => {
    const chars = [' ', ...w, ' '];
    let sum = prio(' ');
    for (let i = 1; i < chars.length; i++) {
      if (i < chars.length - 1) sum += prio(chars[i]);
      sum += prio(chars[i - 1] + chars[i]);
    }
    return sum / Math.pow(chars.length - 2, p.lengthExponent);
  };
  const rareLog = -Math.log(corpus.words.length + 1);
  const candidates: Candidate[] = [
    ...real.map((word) => ({ word, pseudo: false, base: valueOf(word) - p.frequencyPull * Math.log((rank.get(word) ?? 0) + 1) })),
    ...[...pseudo].map((word) => ({ word, pseudo: true, base: valueOf(word) + p.frequencyPull * rareLog })),
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
  const budget = (state.paceWpm * 5 * p.coreSeconds) / 60;
  let length = 0;
  while (kind === 'focus' ? picked.length < p.focusWords : length < budget || picked.length < 5) {
    const c = drawAny();
    picked.push(c);
    length += c.word.length + 1;
  }

  // Coverage: swap the weakest non-target words for target words until enough words hit a target.
  const hits = (w: string) => targets.some((t) => exercises(w, t));
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
  for (const t of targets) {
    const key = model.keys.find((k) => k.item === t);
    const confused = key?.confusions.find((c) => allowed.has(c.typed) && c.weight >= 1)?.typed;
    if (!confused) continue;
    const pool = candidates.filter((c) => c.word.includes(confused));
    const slot = lowestWithout(picked, (w) => hits(w) || w.includes(confused));
    if (pool.length === 0 || slot < 0) continue;
    release(used, picked[slot].word);
    picked[slot] = draw(pool);
  }

  const words = spaceOut(picked.map((c) => c.word), targets, p.spacing, rand);
  return { text: words.join(' '), words, targets, kind, paceWpm: state.paceWpm, seed };
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
  const focus = state.focusKey ?? pool.find((it) => it.kind === 'key')?.item ?? null;
  if (kind === 'focus' && focus !== null) {
    // The focus key and its weakest bigrams.
    const bigrams = pool.filter((it) => it.kind === 'bigram' && it.item.includes(focus)).slice(0, p.targets - 1);
    return [focus, ...bigrams.map((it) => it.item)];
  }
  const picked = pickFocusItems(
    { ranked: pool } as unknown as WeaknessModel,
    { count: p.targets, temperature: p.temperature, rand },
  ).map((it) => it.item);
  if (state.focusKey !== null && !picked.includes(state.focusKey)) {
    picked.pop();
    picked.unshift(state.focusKey);
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
  drill: Pick<Drill, 'kind' | 'words'>,
  result: DrillResult,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): { state: CurriculumState; changes: CurriculumChange[] } {
  const s: CurriculumState = structuredClone(state);
  const changes: CurriculumChange[] = [];
  s.recentWords = [...s.recentWords, drill.words].slice(-p.recentDrills);

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

  const byItem = new Map(model.keys.map((k) => [k.item, k]));
  if (s.focusKey !== null && meetsBar(byItem.get(s.focusKey), s, p)) {
    changes.push({ type: 'focus-met', key: s.focusKey });
    s.focusKey = null;
  }

  const blocking = blockingKeys(model, s, p);
  const next = unlockOrder(corpus).find((k) => !s.unlocked.includes(k));
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

/** What kind of drill comes next: a focus burst after every `focusEvery` core drills. */
export function nextKind(state: CurriculumState, last: DrillKind | null, p: DrillParams = DEFAULT_DRILL_PARAMS): DrillKind {
  return last === 'core' && state.coreDrills > 0 && state.coreDrills % p.focusEvery === 0 ? 'focus' : 'core';
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
