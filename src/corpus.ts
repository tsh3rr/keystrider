import { en } from './corpora/en';

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
  /** Substrings generated pseudo-words must not contain, e.g. offensive words. */
  blockedSubstrings?: readonly string[];
}

const CORPORA = new Map<string, Corpus>([[en.language, en]]);

export const DEFAULT_LANGUAGE = en.language;

export function getCorpus(language: string): Corpus {
  const corpus = CORPORA.get(language);
  if (!corpus) throw new Error(`No corpus for language "${language}"`);
  return corpus;
}

export function availableLanguages(): Corpus[] {
  return [...CORPORA.values()];
}

export function randomText(corpus: Corpus, wordCount = 30, rand: () => number = Math.random): string {
  const out: string[] = [];
  for (let i = 0; i < wordCount; i++) out.push(corpus.words[Math.floor(rand() * corpus.words.length)]);
  return out.join(' ');
}
