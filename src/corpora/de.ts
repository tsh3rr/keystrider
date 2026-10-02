import type { Corpus } from '../corpus';
import deSentences from './de-sentences';
import words from './de-words';

// The 10,000 most common German words, most frequent first, lowercase (nouns
// too: word drills are lowercase until capitals unlock, and sentence drills
// carry the real capitals). Regenerate with scripts/build-corpus.py.
export const de: Corpus = {
  language: 'de',
  name: 'Deutsch',
  words: words.trim().split(/\s+/),
  // German letter frequency, first six spread over both hands near the home row;
  // umlauts and ß come once the common letters are in.
  unlockOrder: [...'enirsatdhulgcombfwkzpväüößjyxq'],
  // Straight quotes: „ and “ need AltGr or a dead key on most keyboards.
  punctuation: ['.', ',', '?', '-', '!', ':', '"', ';', '()', "'"],
  sentences: deSentences,
};
