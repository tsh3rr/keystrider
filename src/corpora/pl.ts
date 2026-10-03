import type { Corpus } from '../corpus';
import plSentences from './pl-sentences';
import words from './pl-words';

// The 10,000 most common Polish words, most frequent first, lowercase.
// Regenerate with scripts/build-corpus.py.
export const pl: Corpus = {
  language: 'pl',
  name: 'Polski',
  words: words.trim().split(/\s+/),
  // Polish letter frequency. On the Polish (Programmers) layout ą, ę, ł and the
  // rest are typed with AltGr; they unlock in frequency order like any letter.
  unlockOrder: [...'ieaoznswtcrdykmjplubęłgżhóśąćfńźxv'],
  // Straight quotes: „ and ” need AltGr.
  punctuation: ['.', ',', '-', '?', '!', ':', ';', '"', '()', "'"],
  sentences: plSentences,
};
