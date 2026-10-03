import type { Corpus } from '../corpus';
import frSentences from './fr-sentences';
import words from './fr-words';

// The 10,000 most common French words, most frequent first, lowercase.
// Regenerate with scripts/build-corpus.py.
export const fr: Corpus = {
  language: 'fr',
  name: 'Français',
  words: words.trim().split(/\s+/),
  // French letter frequency; é comes early, since it is in so many words.
  unlockOrder: [...'esantiuroldpcmévqfgbhàjxèyêçzôùîâûkëwï'],
  // The apostrophe comes early: l', d' and qu' are everywhere. Straight quotes,
  // since « » need AltGr on most keyboards.
  punctuation: ['.', ',', "'", '?', '-', '!', ':', ';', '"', '()'],
  sentences: frSentences,
};
