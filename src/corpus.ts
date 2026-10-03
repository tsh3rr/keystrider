/**
 * Practice text source for one language. Drill generation reads words from
 * here rather than from a hard-coded list, so adding a language means adding
 * a corpus, not changing the trainer.
 */
export interface Corpus {
  /** BCP 47 language tag, matching `PracticeContext.language`. */
  language: string;
  /** Display name in its own language, e.g. "English", "Polski". */
  name: string;
  words: readonly string[];
  /**
   * Order in which beginners unlock letters, first six together. Defaults to
   * the corpus' own letter frequency (see `unlockOrder` in drill.ts).
   */
  unlockOrder?: readonly string[];
  /**
   * Punctuation unlocked after capitals, in order; "()" is the bracket pair.
   * Defaults to `DEFAULT_PUNCTUATION` in drill.ts.
   */
  punctuation?: readonly string[];
  /**
   * Real sentences for sentence drills, with their normal capitals and
   * punctuation (see `practiceForm` in sentences.ts). Optional.
   */
  sentences?: readonly string[];
  /** Substrings generated pseudo-words must not contain, e.g. offensive words. */
  blockedSubstrings?: readonly string[];
}

/** A practice language as the pickers list it, before its corpus is loaded. */
export interface Language {
  language: string;
  /** Display name in its own language; matches the corpus' `name`. */
  name: string;
}

/**
 * Each corpus is its own chunk (about 90 kB of words), fetched the first time
 * its language is picked, so the app ships only the language in use.
 */
const LOADERS = new Map<string, { name: string; load: () => Promise<Corpus> }>([
  ['en', { name: 'English', load: () => import('./corpora/en').then((m) => m.en) }],
  ['de', { name: 'Deutsch', load: () => import('./corpora/de').then((m) => m.de) }],
  ['fr', { name: 'Français', load: () => import('./corpora/fr').then((m) => m.fr) }],
  ['es', { name: 'Español', load: () => import('./corpora/es').then((m) => m.es) }],
  ['it', { name: 'Italiano', load: () => import('./corpora/it').then((m) => m.it) }],
  ['pl', { name: 'Polski', load: () => import('./corpora/pl').then((m) => m.pl) }],
]);

const LANGUAGES: readonly Language[] = [...LOADERS].map(([language, { name }]) => ({ language, name }));

const loaded = new Map<string, Corpus>();
const loading = new Map<string, Promise<Corpus>>();

export const DEFAULT_LANGUAGE = 'en';

/** Fetches a language's corpus once; later calls return the same corpus. */
export function loadCorpus(language: string): Promise<Corpus> {
  const entry = LOADERS.get(language);
  if (!entry) return Promise.reject(new Error(`No corpus for language "${language}"`));
  let p = loading.get(language);
  if (!p) {
    p = entry.load().then((corpus) => {
      loaded.set(language, corpus);
      return corpus;
    });
    // A failed fetch (e.g. offline) can be retried on the next pick.
    p.catch(() => loading.delete(language));
    loading.set(language, p);
  }
  return p;
}

/**
 * A corpus already fetched with `loadCorpus`. The app loads the practice
 * language before switching to it, so code working in the current language
 * can rely on this.
 */
export function getCorpus(language: string): Corpus {
  const corpus = loaded.get(language);
  if (corpus) return corpus;
  throw new Error(LOADERS.has(language) ? `Corpus for "${language}" is not loaded yet` : `No corpus for language "${language}"`);
}

/** The corpus if it has been fetched, else undefined. */
export function loadedCorpus(language: string): Corpus | undefined {
  return loaded.get(language);
}

export function availableLanguages(): readonly Language[] {
  return LANGUAGES;
}

/**
 * The practice language for a first visit: the first browser language with a
 * corpus ("de-AT" counts as "de"), else `DEFAULT_LANGUAGE`.
 */
export function guessLanguage(locales: readonly string[]): string {
  for (const tag of locales) {
    const primary = tag.toLowerCase().split('-')[0];
    if (LOADERS.has(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

export function randomText(corpus: Corpus, wordCount = 30, rand: () => number = Math.random): string {
  const out: string[] = [];
  for (let i = 0; i < wordCount; i++) out.push(corpus.words[Math.floor(rand() * corpus.words.length)]);
  return out.join(' ');
}
