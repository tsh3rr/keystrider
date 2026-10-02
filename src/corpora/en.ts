import type { Corpus } from '../corpus';
import enSentences from './en-sentences';

// Common English words. Placeholder until frequency-ranked corpora exist.
export const en: Corpus = {
  language: 'en',
  name: 'English',
  words: (
    'the of and to in is you that it he was for on are as with his they at be this have from ' +
    'or one had by word but not what all were we when your can said there use an each which she ' +
    'do how their if will up other about out many then them these so some her would make like him ' +
    'into time has look two more write go see number no way could people my than first water been ' +
    'call who oil its now find long down day did get come made may part over new sound take only ' +
    'little work know place year live me back give most very after thing our just name good sentence ' +
    'man think say great where help through much before line right too mean old any same tell boy ' +
    'follow came want show also around form three small set put end does another well large must big ' +
    'even such because turn here why ask went men read need land different home us move try kind hand ' +
    // So every letter can be unlocked and practised.
    'quite question quick next example box six size zero'
  ).split(' '),
  // Frequency order adjusted so the first six sit on or near the home row (drill generator design).
  unlockOrder: [...'eniarltosudycghpmkbwfvzxqj'],
  sentences: enSentences,
};
