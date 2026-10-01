import lists from 'naughty-words';
import type { Corpus } from './corpus';

/**
 * Offensive-word filter for generated practice text, per language. The terms
 * come from the LDNOOBW lists (npm `naughty-words`, CC BY 4.0), which cover
 * about 30 languages, so a new corpus is filtered without code changes.
 * Made-up words are rejected if they contain a term anywhere; real words only
 * if they are one (see `isBlockedWord`). The terms are never shown in the app.
 */

/**
 * Endings that still read as the blocked word in a real word ("term" + "s").
 * Real words are matched whole (with these endings), not by substring, so
 * innocent words that merely contain a term stay in the drills.
 */
const INFLECTIONS: Record<string, readonly string[]> = {
  en: ['s', 'es', 'ed', 'er', 'ers', 'ing', 'y', 'ies'],
};

/** Terms this short are only blocked as whole words; inside longer words they'd reject too much harmless text. */
const MIN_SUBSTRING = 3;

export interface BlockList {
  /** Blocked anywhere inside a word. */
  substrings: readonly string[];
  /** Blocked only as the whole word. */
  words: ReadonlySet<string>;
  /** Every term, for whole-word matching of real words. */
  terms: ReadonlySet<string>;
  /** Endings a real word may add to a term and still be blocked. */
  inflections: readonly string[];
}

const cache = new Map<string, BlockList>();
const corpusCache = new WeakMap<Corpus, (word: string) => boolean>();

/** Lowercase letters only, so phrases and hyphenated entries match how they'd be typed as one word. */
function normalize(term: string): string {
  return term.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
}

/** Language tag → list key: the exact tag if the lists have it, else its primary subtag ("de-AT" → "de"). */
function listFor(language: string): readonly string[] {
  return lists[language] ?? lists[language.toLowerCase().split('-')[0]] ?? [];
}

/** The block list for a language, optionally with extra terms. Empty for languages the lists don't cover. */
export function blockList(language: string, extra: readonly string[] = []): BlockList {
  const key = [language, ...extra].join('\0');
  const hit = cache.get(key);
  if (hit) return hit;
  const substrings = new Set<string>();
  const words = new Set<string>();
  for (const raw of [...listFor(language), ...extra]) {
    const t = normalize(raw);
    if (t.length === 0) continue;
    if ([...t].length >= MIN_SUBSTRING) substrings.add(t);
    else words.add(t);
  }
  const inflections = INFLECTIONS[language.toLowerCase().split('-')[0]] ?? [];
  const list = { substrings: [...substrings], words, terms: new Set([...substrings, ...words]), inflections };
  cache.set(key, list);
  return list;
}

/** True if the word is, or contains, a blocked term. Used for made-up words. */
export function isBlocked(word: string, list: BlockList): boolean {
  const w = normalize(word);
  return list.words.has(w) || list.substrings.some((t) => w.includes(t));
}

/** True if a real word is a blocked term, or one with an inflection ending. Used for corpus words. */
export function isBlockedWord(word: string, list: BlockList): boolean {
  const w = normalize(word);
  return list.terms.has(w) || list.inflections.some((e) => w.endsWith(e) && list.terms.has(w.slice(0, -e.length)));
}

/** A memoized `isBlockedWord` for a corpus' language plus its own `blockedSubstrings`. */
export function corpusFilter(corpus: Corpus): (word: string) => boolean {
  let f = corpusCache.get(corpus);
  if (!f) {
    const list = blockList(corpus.language, corpus.blockedSubstrings);
    const seen = new Map<string, boolean>();
    f = (word) => {
      let b = seen.get(word);
      if (b === undefined) seen.set(word, (b = isBlockedWord(word, list)));
      return b;
    };
    corpusCache.set(corpus, f);
  }
  return f;
}
