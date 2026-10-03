import type { Corpus } from '../corpus';
import itSentences from './it-sentences';
import words from './it-words';

// The 10,000 most common Italian words, most frequent first, lowercase.
// Regenerate with scripts/build-corpus.py.
export const it: Corpus = {
  language: 'it',
  name: 'Italiano',
  words: words.trim().split(/\s+/),
  // Italian letter frequency; accented vowels come once the common letters are in.
  unlockOrder: [...'eiaontlrscdupmvghfbzqèàùòìéxwkjy'],
  // The apostrophe comes early: l', un' and c'è are everywhere.
  punctuation: ['.', ',', "'", '?', '-', '!', ':', ';', '"', '()'],
  sentences: itSentences,
};
