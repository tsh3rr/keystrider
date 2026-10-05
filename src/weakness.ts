import { loadedCorpus, type Corpus } from './corpus';
import { charLabel, howToType } from './layouts';
import type { KeystrokeEvent, PracticeContext } from './types';

/**
 * Weakness model: turns the keystroke log into a ranked list of keys and
 * bigrams the user should practise next.
 *
 * Pure functions over `KeystrokeEvent[]`, no DOM or storage. Pass events of
 * one language and one layout (`KeystrokeStore.forLanguage(language, layout)`)
 * or use `loadWeaknessModel`, which does that for you.
 *
 * Design: "Weakness Model Design" doc. In short, per item:
 * - error rate p̂: recency-weighted first-attempt errors (by age and by newer
 *   tries of the same item), shrunk toward a prior
 *   (user's overall rate for keys, the second key's p̂ for bigrams);
 * - latency μ̂: recency-weighted mean log inter-key interval, shrunk the same way;
 * - review half-life h: doubles after a session that met criterion, halves after a miss;
 * - need = 0.5·E + 0.3·g·S + 0.2·R + 0.1·U, priority = need · (0.5 + 0.5·f).
 */

/** Tunable parameters. Defaults follow the design doc; all are starting points to tune on logged data. */
export interface WeaknessParams {
  /** Half-life in days of the recency weight on old evidence. */
  evidenceHalfLifeDays: number;
  /**
   * Half-life in attempts of the same key or bigram: each item's evidence also
   * fades with newer tries of it, so a key typed thousands of times recovers
   * after a few clean drills, not only after weeks.
   */
  evidenceHalfLifeAttempts: number;
  /** Beta prior strength α, in attempts, for key and bigram error rates. */
  keyPriorAttempts: number;
  bigramPriorAttempts: number;
  /** Prior weight κ, in samples, for the shrunk log-latency mean. */
  latencyPriorSamples: number;
  /** Inter-key intervals above this are pauses and are dropped from latency. */
  maxLatencyMs: number;
  /** Target error rate p*: at or below it the error component is 0. */
  targetErrorRate: number;
  /** Error rate at which the error component reaches 1. */
  maxErrorRate: number;
  /** Speed only counts once p̂ is at or below this (accuracy-first gate). */
  speedGateErrorRate: number;
  /** Review criterion for one session: accuracy at least this... */
  criterionAccuracy: number;
  /** ...and typical latency within this multiple of the user's own. */
  criterionLatencyRatio: number;
  /** Review half-life of a new item, and its floor, in days. */
  minReviewHalfLifeDays: number;
  /** Evidence n at which the exploration bonus has dropped to 1/√2. */
  explorationScale: number;
  weights: { errors: number; slowness: number; review: number; exploration: number };
}

export const DEFAULT_WEAKNESS_PARAMS: Readonly<WeaknessParams> = Object.freeze({
  evidenceHalfLifeDays: 14,
  evidenceHalfLifeAttempts: 200,
  keyPriorAttempts: 20,
  bigramPriorAttempts: 10,
  latencyPriorSamples: 10,
  maxLatencyMs: 2000,
  targetErrorRate: 0.02,
  maxErrorRate: 0.15,
  speedGateErrorRate: 0.04,
  criterionAccuracy: 0.97,
  criterionLatencyRatio: 1.2,
  minReviewHalfLifeDays: 1,
  explorationScale: 10,
  weights: Object.freeze({ errors: 0.5, slowness: 0.3, review: 0.2, exploration: 0.1 }),
});

/** The four need components, each scaled to 0–1. */
export interface NeedComponents {
  /** E: how far the error rate is above target. */
  errors: number;
  /** S: how much slower than the user's own typical latency. Already 0 when the item is not yet accurate. */
  slowness: number;
  /** R: how overdue a review is, relative to the item's half-life. 0 for items never practised. */
  review: number;
  /** U: exploration bonus for items with little evidence. */
  exploration: number;
}

/** Fields shared by key and bigram stats. */
export interface ItemStats {
  /** The key's character, or the bigram's two characters, e.g. "e" or "th". */
  item: string;
  /** First attempts at this item (raw count, no recency weighting). */
  attempts: number;
  /** First attempts that were wrong (raw count). */
  errors: number;
  /** Effective, recency-weighted number of attempts (n in the design doc). */
  weight: number;
  /** Shrunk error rate p̂, 0–1. */
  errorRate: number;
  /** Typical latency e^μ̂ in ms, shrunk toward the prior. */
  latencyMs: number;
  /** Effective number of clean latency samples. */
  latencyWeight: number;
  /** Timestamp of the latest attempt, or null if never typed. */
  lastSeen: number | null;
  /** Review half-life h in days. */
  halfLifeDays: number;
  /** Normalised log frequency of the item in the language's corpus, 0–1. */
  frequency: number;
  components: NeedComponents;
  /** Need score, 0–1 with default weights. */
  need: number;
  /** need · (0.5 + 0.5 · frequency): the ranking key. */
  priority: number;
}

export interface Confusion {
  /** What was typed instead of the expected character. */
  typed: string;
  /** Recency-weighted count. */
  weight: number;
  count: number;
}

export interface KeyStats extends ItemStats {
  kind: 'key';
  /** Physical key (`KeyboardEvent.code`) for this character on the model's layout, or null if the base layer lacks it. */
  code: string | null;
  /** Key cap label on the model's layout, e.g. "Y" for "y" on QWERTZ, "Space" for " ". */
  label: string;
  /** What the user types instead of this key on first-attempt errors, most frequent first. */
  confusions: Confusion[];
}

export interface BigramStats extends ItemStats {
  kind: 'bigram';
  /** The previous character (may be " "). */
  first: string;
  /** The character typed into; its key's stats are this bigram's prior. */
  second: string;
}

export type WeaknessItem = KeyStats | BigramStats;

export interface Baseline {
  /** Raw first attempts across all keys. */
  attempts: number;
  /** Recency-weighted overall error rate (key prior p₀). */
  errorRate: number;
  /** Recency-weighted mean log latency μ_user. */
  logLatency: number;
  /** e^μ_user in ms: the user's typical inter-key interval. */
  latencyMs: number;
  /** Words per minute implied by `latencyMs` (5 characters per word). */
  wpm: number;
}

export interface WeaknessModel {
  context: PracticeContext;
  /** The model's clock: events after it are ignored, ages are measured from it. */
  asOf: number;
  baseline: Baseline;
  /** Per-key stats, highest priority first. */
  keys: KeyStats[];
  /** Per-bigram stats, highest priority first. */
  bigrams: BigramStats[];
  /** Keys and bigrams together, highest priority first. */
  ranked: WeaknessItem[];
}

/** How often keys and bigrams occur in the target language, as raw counts. */
export interface ItemFrequencies {
  keys: ReadonlyMap<string, number>;
  bigrams: ReadonlyMap<string, number>;
}

export interface WeaknessOptions {
  /** Clock for recency and review; defaults to now. Use a past time to rebuild history. */
  now?: number;
  /**
   * Item frequencies for f. Defaults to `corpusFrequencies` of the language's
   * corpus, or neutral (f = 1 for every item) when the language has none.
   */
  frequencies?: ItemFrequencies;
  /** Score these keys too even if never typed (e.g. just-unlocked letters); they rank on priors and exploration. */
  includeKeys?: Iterable<string>;
  /** Same for bigrams, as two-character strings. */
  includeBigrams?: Iterable<string>;
  params?: Partial<WeaknessParams>;
}

const DAY_MS = 86_400_000;
const LN2 = Math.log(2);

/** One cleaned first attempt at a text position. */
export interface Attempt {
  sessionId: string;
  timestamp: number;
  expected: string;
  prev: string | null;
  typed: string;
  error: boolean;
  /** ln(IKI) when this keystroke is a clean latency sample, else null. */
  logLatency: number | null;
}

/**
 * Applies the design's cleaning rules: only the first keypress at each
 * position counts, and latency is used only for correct keys whose previous
 * key was also right first time, excluding pauses and each drill's first key.
 */
export function firstAttempts(events: readonly KeystrokeEvent[], maxLatencyMs = DEFAULT_WEAKNESS_PARAMS.maxLatencyMs): Attempt[] {
  const bySession = new Map<string, KeystrokeEvent[]>();
  for (const e of events) {
    let list = bySession.get(e.sessionId);
    if (!list) bySession.set(e.sessionId, (list = []));
    list.push(e);
  }
  const out: Attempt[] = [];
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.timestamp - b.timestamp || (a.id ?? 0) - (b.id ?? 0));
    const cleanAt = new Map<number, boolean>();
    for (const e of list) {
      if (cleanAt.has(e.position)) continue; // a correction, not a new attempt
      cleanAt.set(e.position, e.correct);
      const prevClean = cleanAt.get(e.position - 1) === true;
      const latencyOk =
        e.correct && prevClean && e.position > 0 && e.latencyMs !== null && e.latencyMs > 0 && e.latencyMs <= maxLatencyMs;
      out.push({
        sessionId,
        timestamp: e.timestamp,
        expected: e.expected,
        prev: e.prevExpected,
        typed: e.actual,
        error: !e.correct,
        logLatency: latencyOk ? Math.log(e.latencyMs!) : null,
      });
    }
  }
  return out;
}

/** Recency-weighted sums for one item. */
class Acc {
  attempts = 0;
  errors = 0;
  w = 0;
  e = 0;
  lw = 0;
  lsum = 0;
  lastSeen: number | null = null;
  confusions = new Map<string, { weight: number; count: number }>();
  /** Per-session tallies for the review half-life, keyed by session. */
  sessions = new Map<string, { start: number; attempts: number; errors: number; lsum: number; ln: number }>();

  add(a: Attempt, w: number): void {
    this.attempts++;
    this.w += w;
    if (a.error) {
      this.errors++;
      this.e += w;
    }
    if (a.logLatency !== null) {
      this.lw += w;
      this.lsum += w * a.logLatency;
    }
    if (this.lastSeen === null || a.timestamp > this.lastSeen) this.lastSeen = a.timestamp;
    let s = this.sessions.get(a.sessionId);
    if (!s) this.sessions.set(a.sessionId, (s = { start: a.timestamp, attempts: 0, errors: 0, lsum: 0, ln: 0 }));
    s.start = Math.min(s.start, a.timestamp);
    s.attempts++;
    if (a.error) s.errors++;
    if (a.logLatency !== null) {
      s.lsum += a.logLatency;
      s.ln++;
    }
  }

  confuse(typed: string, w: number): void {
    const c = this.confusions.get(typed) ?? { weight: 0, count: 0 };
    c.weight += w;
    c.count++;
    this.confusions.set(typed, c);
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Builds the weakness model from one language's and layout's keystrokes. */
export function buildWeaknessModel(
  events: readonly KeystrokeEvent[],
  context: PracticeContext,
  options: WeaknessOptions = {},
): WeaknessModel {
  const p: WeaknessParams = { ...DEFAULT_WEAKNESS_PARAMS, ...options.params };
  const now = options.now ?? Date.now();
  const relevant = events.filter(
    (e) => e.language === context.language && e.layout === context.layout && e.timestamp <= now,
  );
  const attempts = firstAttempts(relevant, p.maxLatencyMs);

  const keys = new Map<string, Acc>();
  const bigrams = new Map<string, Acc>();
  const total = new Acc();
  const get = (m: Map<string, Acc>, k: string) => {
    let a = m.get(k);
    if (!a) m.set(k, (a = new Acc()));
    return a;
  };
  // Newest first, so each attempt knows how many newer tries of its key and bigram there are.
  const newer = new Map<string, number>();
  const byCount = (item: string) => {
    const n = newer.get(item) ?? 0;
    newer.set(item, n + 1);
    return Math.pow(2, -n / p.evidenceHalfLifeAttempts);
  };
  for (const a of [...attempts].sort((x, y) => y.timestamp - x.timestamp)) {
    const w = Math.pow(2, -(now - a.timestamp) / DAY_MS / p.evidenceHalfLifeDays);
    total.add(a, w);
    const key = get(keys, a.expected);
    const wk = w * byCount('k' + a.expected);
    key.add(a, wk);
    if (a.error) key.confuse(a.typed, wk);
    if (a.prev !== null) get(bigrams, a.prev + a.expected).add(a, w * byCount('b' + a.prev + a.expected));
  }
  for (const k of options.includeKeys ?? []) get(keys, k);
  for (const b of options.includeBigrams ?? []) if ([...b].length === 2) get(bigrams, b);

  // With no data at all, fall back to the design's target rate and ~40 WPM.
  const baseErr = total.w > 0 ? total.e / total.w : p.targetErrorRate;
  const baseLog = total.lw > 0 ? total.lsum / total.lw : Math.log(300);
  const baseline: Baseline = {
    attempts: total.attempts,
    errorRate: baseErr,
    logLatency: baseLog,
    latencyMs: Math.exp(baseLog),
    wpm: 60_000 / Math.exp(baseLog) / 5,
  };

  const freq = options.frequencies ?? defaultFrequencies(context.language);
  const freqScale = (m: ReadonlyMap<string, number> | undefined) => {
    if (!m) return () => 1;
    let max = 0;
    for (const v of m.values()) max = Math.max(max, v);
    const denom = Math.log1p(max);
    return (item: string) => (denom > 0 ? Math.log1p(m.get(item) ?? 0) / denom : 0);
  };
  const keyFreq = freqScale(freq?.keys);
  const bigramFreq = freqScale(freq?.bigrams);

  const score = (item: string, acc: Acc, alpha: number, p0: number, mu0: number, f: number): ItemStats => {
    const errorRate = (acc.e + alpha * p0) / (acc.w + alpha);
    const mu = (acc.lsum + p.latencyPriorSamples * mu0) / (acc.lw + p.latencyPriorSamples);
    const halfLifeDays = reviewHalfLife(acc, baseLog, p);
    const ageDays = acc.lastSeen === null ? null : (now - acc.lastSeen) / DAY_MS;
    const gate = errorRate <= p.speedGateErrorRate ? 1 : 0;
    const components: NeedComponents = {
      errors: clamp01((errorRate - p.targetErrorRate) / (p.maxErrorRate - p.targetErrorRate)),
      slowness: gate * clamp01((mu - baseLog) / LN2),
      review: ageDays === null ? 0 : 1 - Math.pow(2, -ageDays / halfLifeDays),
      exploration: 1 / Math.sqrt(1 + acc.w / p.explorationScale),
    };
    const { weights } = p;
    const need =
      weights.errors * components.errors +
      weights.slowness * components.slowness +
      weights.review * components.review +
      weights.exploration * components.exploration;
    return {
      item,
      attempts: acc.attempts,
      errors: acc.errors,
      weight: acc.w,
      errorRate,
      latencyMs: Math.exp(mu),
      latencyWeight: acc.lw,
      lastSeen: acc.lastSeen,
      halfLifeDays,
      frequency: f,
      components,
      need,
      priority: need * (0.5 + 0.5 * f),
    };
  };

  const keyStats = new Map<string, KeyStats>();
  for (const [ch, acc] of keys) {
    const stats = score(ch, acc, p.keyPriorAttempts, baseErr, baseLog, keyFreq(ch));
    const code = codeFor(context.layout, ch);
    keyStats.set(ch, {
      kind: 'key',
      ...stats,
      code,
      label: charLabel(context.layout, ch),
      confusions: [...acc.confusions]
        .map(([typed, c]) => ({ typed, ...c }))
        .sort((a, b) => b.weight - a.weight),
    });
  }

  const bigramStats: BigramStats[] = [];
  for (const [bg, acc] of bigrams) {
    const [first, second] = [...bg];
    // Back off to the second key; a key never seen on its own uses the user baseline.
    const k = keyStats.get(second);
    const p0 = k ? k.errorRate : baseErr;
    const mu0 = k ? Math.log(k.latencyMs) : baseLog;
    bigramStats.push({ kind: 'bigram', ...score(bg, acc, p.bigramPriorAttempts, p0, mu0, bigramFreq(bg)), first, second });
  }

  const byPriority = (a: ItemStats, b: ItemStats) => b.priority - a.priority || (a.item < b.item ? -1 : 1);
  const keyList = [...keyStats.values()].sort(byPriority);
  bigramStats.sort(byPriority);
  return {
    context: { language: context.language, layout: context.layout },
    asOf: now,
    baseline,
    keys: keyList,
    bigrams: bigramStats,
    ranked: [...keyList, ...bigramStats].sort(byPriority),
  };
}

/**
 * Replays the item's sessions in order: h starts at the floor, doubles after
 * a session that met criterion (accurate and not slow), halves after a miss.
 */
function reviewHalfLife(acc: Acc, baseLog: number, p: WeaknessParams): number {
  let h = p.minReviewHalfLifeDays;
  const sessions = [...acc.sessions.values()].sort((a, b) => a.start - b.start);
  for (const s of sessions) {
    const accurate = (s.attempts - s.errors) / s.attempts >= p.criterionAccuracy;
    // Sessions without a clean latency sample are judged on accuracy alone.
    const fastEnough = s.ln === 0 || s.lsum / s.ln - baseLog <= Math.log(p.criterionLatencyRatio);
    h = accurate && fastEnough ? h * 2 : Math.max(p.minReviewHalfLifeDays, h / 2);
  }
  return h;
}

/** Physical key that types `ch` on the layout's base or Shift layer (other capitals map to their lowercase key). */
export function codeFor(layoutId: string, ch: string): string | null {
  const how = howToType(layoutId, ch);
  if (how) return how.code;
  const lower = ch.toLowerCase();
  return lower === ch ? null : howToType(layoutId, lower)?.code ?? null;
}

const corpusCache = new Map<string, ItemFrequencies | undefined>();
function defaultFrequencies(language: string): ItemFrequencies | undefined {
  if (!corpusCache.has(language)) {
    // Not cached while unloaded, so the frequencies arrive with the corpus.
    const corpus = loadedCorpus(language);
    if (!corpus) return undefined;
    corpusCache.set(language, corpusFrequencies(corpus));
  }
  return corpusCache.get(language);
}

/**
 * Character and bigram counts from a corpus, for the frequency factor.
 * Words are treated as separated by spaces, so " t" (word start) and "e "
 * (word end) bigrams count too. Earlier words weigh more (Zipf, 1/rank),
 * which matches frequency-ranked word lists.
 */
export function corpusFrequencies(corpus: Corpus): ItemFrequencies {
  const keys = new Map<string, number>();
  const bigrams = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w);
  corpus.words.forEach((word, i) => {
    const w = 1 / (i + 1);
    const chars = [' ', ...word.normalize('NFC'), ' '];
    for (let j = 1; j < chars.length; j++) {
      bump(keys, chars[j], w);
      bump(bigrams, chars[j - 1] + chars[j], w);
    }
  });
  return { keys, bigrams };
}

/**
 * Picks focus items for the next drill: samples `count` distinct items from
 * the top of the ranking, with softmax probabilities over priority, so the
 * same few do not repeat forever. Lower temperature means greedier.
 */
export function pickFocusItems(
  model: WeaknessModel,
  { count = 5, temperature = 0.3, pool = 30, rand = Math.random }: {
    count?: number;
    temperature?: number;
    /** Only the top `pool` items are candidates. */
    pool?: number;
    rand?: () => number;
  } = {},
): WeaknessItem[] {
  const candidates = model.ranked.slice(0, Math.max(pool, count));
  const picked: WeaknessItem[] = [];
  while (picked.length < count && candidates.length > 0) {
    const top = candidates[0].priority;
    const weights = candidates.map((c) => Math.exp((c.priority - top) / temperature));
    let r = rand() * weights.reduce((s, w) => s + w, 0);
    let i = 0;
    while (i < weights.length - 1 && (r -= weights[i]) >= 0) i++;
    picked.push(candidates.splice(i, 1)[0]);
  }
  return picked;
}

/** Reads one language's and layout's keystrokes from the store and builds the model. */
export async function loadWeaknessModel(
  store: { forLanguage(language: string, layout?: string): Promise<KeystrokeEvent[]> },
  context: PracticeContext,
  options?: WeaknessOptions,
): Promise<WeaknessModel> {
  return buildWeaknessModel(await store.forLanguage(context.language, context.layout), context, options);
}
