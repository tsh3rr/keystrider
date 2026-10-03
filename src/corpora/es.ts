import type { Corpus } from '../corpus';
import esSentences from './es-sentences';
import words from './es-words';

// The 10,000 most common Spanish words, most frequent first, lowercase.
// Regenerate with scripts/build-corpus.py.
export const es: Corpus = {
  language: 'es',
  name: 'Español',
  words: words.trim().split(/\s+/),
  // Spanish letter frequency; accented vowels and ñ come once the common letters are in.
  unlockOrder: [...'eaosnrlidutcmpqybgvhfóíjázéñxúwkü'],
  // Questions and exclamations unlock with their opening mark: ¿…? and ¡…!.
  punctuation: ['.', ',', '¿?', '¡!', '-', ':', ';', '"', '()', "'"],
  sentences: esSentences,
};
