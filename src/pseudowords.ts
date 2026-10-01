import type { Corpus } from './corpus';
import { blockList } from './wordfilter';

/**
 * Character trigram model trained on a corpus' word list, used to make
 * pronounceable pseudo-words from only the letters a learner has unlocked.
 * Language-agnostic: it learns whatever the corpus spells.
 */

const START = '^';
const END = '$';

export interface PseudoWordOptions {
  /** Characters the word may use. */
  allowed: ReadonlySet<string>;
  /** Extra weight for a transition, given its bigram (" x" at word start, "x " at word end). */
  boost?: (bigram: string) => number;
  rand: () => number;
  minLength?: number;
  maxLength?: number;
}

export class TrigramModel {
  /** Context of 2, 1 and 0 characters → next character → count. */
  private readonly tables: Map<string, Map<string, number>>[] = [new Map(), new Map(), new Map()];
  private readonly words: ReadonlySet<string>;
  private readonly blocked: readonly string[];
  /** Mean log-probability below which a word counts as unpronounceable. */
  readonly floor: number;

  constructor(words: readonly string[], blocked: readonly string[] = []) {
    this.blocked = blocked.map((b) => b.normalize('NFC').toLowerCase());
    const clean = words.map((w) => w.normalize('NFC').toLowerCase()).filter((w) => w.length > 0);
    this.words = new Set(clean);
    for (const w of clean) {
      const chars = [START, START, ...w, END];
      for (let i = 2; i < chars.length; i++) {
        this.bump(0, chars[i - 2] + chars[i - 1], chars[i]);
        this.bump(1, chars[i - 1], chars[i]);
        this.bump(2, '', chars[i]);
      }
    }
    // The 10th percentile of real words' scores: pseudo-words must sound at least that English (or German, ...).
    const scores = clean.filter((w) => [...w].length >= 3).map((w) => this.meanLogProb(w)).sort((a, b) => a - b);
    this.floor = scores.length ? scores[Math.floor(scores.length * 0.1)] : -Infinity;
  }

  isWord(w: string): boolean {
    return this.words.has(w);
  }

  /** Average log P(next | previous two) over the word's transitions, end included, with back-off and add-one smoothing. */
  meanLogProb(word: string): number {
    const chars = [START, START, ...word, END];
    let sum = 0;
    for (let i = 2; i < chars.length; i++) sum += Math.log(this.prob(chars[i - 2] + chars[i - 1], chars[i]));
    return sum / (chars.length - 2);
  }

  /** Samples one pseudo-word, or null if the allowed letters lead nowhere. Callers filter the result with `acceptable`. */
  sample({ allowed, boost = () => 0, rand, minLength = 3, maxLength = 8 }: PseudoWordOptions): string | null {
    const out: string[] = [];
    let ctx = START + START;
    while (out.length < maxLength) {
      const canEnd = out.length >= minLength;
      let options: [string, number][] = [];
      for (let order = 0; order < 3 && options.length === 0; order++) {
        const key = order === 0 ? ctx : order === 1 ? ctx.slice(-1) : '';
        for (const [c, n] of this.tables[order].get(key) ?? []) {
          if (c === END ? canEnd : allowed.has(c)) options.push([c, n]);
        }
      }
      if (options.length === 0) return null;
      const prev = out.length ? out[out.length - 1] : ' ';
      options = options.map(([c, n]) => [c, n * (1 + boost(prev + (c === END ? ' ' : c)))]);
      const c = pick(options, rand);
      if (c === END) break;
      out.push(c);
      ctx = ctx.slice(-1) + c;
    }
    return out.length >= minLength ? out.join('') : null;
  }

  /** Not a real word, nothing blocked, no letter three times in a row, and above the pronounceability floor. */
  acceptable(word: string, minLength = 3, maxLength = 8): boolean {
    const n = [...word].length;
    return (
      n >= minLength && n <= maxLength && !this.isWord(word) &&
      !this.blocked.some((b) => word.includes(b)) &&
      !/(.)\1\1/u.test(word) && this.meanLogProb(word) >= this.floor
    );
  }

  private bump(order: number, ctx: string, next: string): void {
    let m = this.tables[order].get(ctx);
    if (!m) this.tables[order].set(ctx, (m = new Map()));
    m.set(next, (m.get(next) ?? 0) + 1);
  }

  private prob(ctx: string, next: string): number {
    // Simple back-off: the longest context seen, add-one smoothed over its alphabet.
    for (let order = 0; order < 3; order++) {
      const key = order === 0 ? ctx : order === 1 ? ctx.slice(-1) : '';
      const m = this.tables[order].get(key);
      if (!m) continue;
      let total = 0;
      for (const v of m.values()) total += v;
      return ((m.get(next) ?? 0) + 1) / (total + this.tables[2].get('')!.size + 1);
    }
    return 1e-6;
  }
}

function pick<T>(options: readonly (readonly [T, number])[], rand: () => number): T {
  let r = rand() * options.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of options) if ((r -= w) < 0) return v;
  return options[options.length - 1][0];
}

const cache = new WeakMap<Corpus, TrigramModel>();

/**
 * The trigram model for a corpus, trained once and reused. It rejects the
 * language's offensive terms (see wordfilter.ts); terms under three letters
 * can't be pseudo-words, which are at least three long.
 */
export function trigramModel(corpus: Corpus): TrigramModel {
  let m = cache.get(corpus);
  if (!m) cache.set(corpus, (m = new TrigramModel(corpus.words, blockList(corpus.language, corpus.blockedSubstrings).substrings)));
  return m;
}
