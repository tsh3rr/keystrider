import { describe, expect, it } from 'vitest';
import type { Corpus } from './corpus';
import { en } from './corpora/en';
import { eligibleSentences, practiceForm } from './sentences';

const letters = (s: string) => new Set(s);

describe('practiceForm', () => {
  const abc = letters('abcdefghijklmnopqrstuvwxyz');

  it('lowers capitals and drops punctuation at word edges while those keys are locked', () => {
    expect(practiceForm('The cat sat, then slept.', abc)).toBe('the cat sat then slept');
    expect(practiceForm('"Is it red?" she asked!', abc)).toBe('is it red she asked');
  });

  it('keeps capitals and punctuation once they are allowed', () => {
    const more = new Set([...abc, 'T', '.', ',']);
    expect(practiceForm('The cat sat, then slept.', more)).toBe('The cat sat, then slept.');
  });

  it('rejects sentences that need a locked letter, a digit or punctuation inside a word', () => {
    expect(practiceForm('The fox ran.', letters('thecarn'))).toBeNull();
    expect(practiceForm('It is 5 now.', abc)).toBeNull();
    expect(practiceForm('It is well-known.', abc)).toBeNull();
    expect(practiceForm('Do not do that.', abc)).toBe('do not do that');
  });

  it('works on letters outside ASCII', () => {
    const de = new Set([...abc, 'ü', 'ß']);
    expect(practiceForm('Über die Straße.', de)).toBe('über die straße');
    expect(practiceForm('Ça va.', abc)).toBeNull();
  });

  it('collapses spacing and rejects empty results', () => {
    expect(practiceForm('  a   b  ', abc)).toBe('a b');
    expect(practiceForm('...', abc)).toBeNull();
  });
});

describe('eligibleSentences', () => {
  const corpus: Corpus = { language: 'en', name: 'Test', words: [], sentences: ['A cat.', 'a cat', 'A dog.', 'Red tree.'] };

  it('dedupes practice forms and drops blocked words', () => {
    expect(eligibleSentences(corpus, letters('abcdefghijklmnopqrstuvwxyz'))).toHaveLength(3);
    expect(eligibleSentences(corpus, letters('abcdefghijklmnopqrstuvwxyz'), (w) => w === 'dog')).toHaveLength(2);
  });

  it('has a usable English starter set', () => {
    const all = eligibleSentences(en, letters('abcdefghijklmnopqrstuvwxyz'));
    expect(all.length).toBeGreaterThanOrEqual(150);
    for (const s of all) expect(s.length).toBeLessThanOrEqual(80);
  });
});
