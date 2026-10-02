import type { Corpus } from '../corpus';
import enSentences from './en-sentences';
import words from './en-words';

// The 10,000 most common English words, most frequent first (rank matters: the
// drill generator prefers common words). Regenerate with scripts/build-corpus.py.
export const en: Corpus = {
  language: 'en',
  name: 'English',
  words: words.trim().split(/\s+/),
  // Frequency order adjusted so the first six sit on or near the home row (drill generator design).
  unlockOrder: [...'eniarltosudycghpmkbwfvzxqj'],
  sentences: enSentences,
};
