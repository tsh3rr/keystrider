import { describe, expect, it } from 'vitest';
import type { Corpus } from './corpus';
import { en } from './corpora/en';
import { eligibleWords, seededRandom } from './drill';
import { trigramModel } from './pseudowords';
import { blockList, corpusFilter, isBlocked, isBlockedWord } from './wordfilter';

// Assertions here count matches instead of comparing word lists, so a failure never prints a blocked term.

const ALL_LETTERS = new Set('abcdefghijklmnopqrstuvwxyz');

describe('blockList', () => {
  it('has terms for English and other languages, and none for unknown ones', () => {
    for (const lang of ['en', 'de', 'pl', 'fr', 'es']) expect(blockList(lang).substrings.length).toBeGreaterThan(20);
    expect(blockList('xx').substrings.length).toBe(0);
    expect(blockList('xx').words.size).toBe(0);
  });

  it('falls back from a regional tag to its language', () => {
    expect(blockList('de-AT').substrings.length).toBe(blockList('de').substrings.length);
    expect(blockList('EN-gb').substrings.length).toBe(blockList('en').substrings.length);
  });

  it('keeps only letters, lowercased, with short terms as whole words', () => {
    const { substrings, words } = blockList('en');
    expect(substrings.filter((t) => !/^[\p{Ll}\p{Lo}\p{M}]+$/u.test(t) || [...t].length < 3).length).toBe(0);
    expect([...words].filter((t) => [...t].length >= 3).length).toBe(0);
  });

  it('blocks every term of its own list', () => {
    const list = blockList('en');
    expect([...list.substrings, ...list.words].filter((t) => !isBlocked(t, list)).length).toBe(0);
  });

  it('adds extra terms, joining phrases and ignoring case and punctuation', () => {
    const list = blockList('xx', ['Zebra Crossing', 'qz']);
    expect(isBlocked('myzebracrossingx', list)).toBe(true);
    expect(isBlocked('Zebra-Crossing', list)).toBe(true);
    expect(isBlocked('zebra', list)).toBe(false);
    expect(isBlocked('qz', list)).toBe(true);
    expect(isBlocked('aqzb', list)).toBe(false);
  });
});

describe('isBlockedWord', () => {
  it('matches real words whole, with inflections, but not by substring', () => {
    const list = blockList('en-US', ['lantern']);
    expect(isBlockedWord('lantern', list)).toBe(true);
    expect(isBlockedWord('Lanterns', list)).toBe(true);
    expect(isBlockedWord('lanternfish', list)).toBe(false);
    expect(isBlockedWord('mylantern', list)).toBe(false);
    expect(isBlocked('mylantern', list)).toBe(true);
  });

  it('only adds inflections for languages that define them', () => {
    expect(isBlockedWord('lanterns', blockList('xx', ['lantern']))).toBe(false);
  });
});

describe('the drill generator', () => {
  const corpus: Corpus = { language: 'xx', name: 'Test', words: [...en.words, 'lantern', 'lane'], blockedSubstrings: ['ern', 'lane'] };

  it('drops blocked real words but keeps ones that only contain a term', () => {
    const words = eligibleWords(corpus, ALL_LETTERS);
    expect(words.length).toBeGreaterThan(50);
    expect(words.includes('lane')).toBe(false);
    expect(words.includes('lantern')).toBe(true);
    expect(corpusFilter(corpus)('lane')).toBe(true);
  });

  it('never makes up a pseudo-word with a blocked term', () => {
    const tri = trigramModel(corpus);
    const rand = seededRandom(5);
    let made = 0;
    for (let i = 0; i < 2000; i++) {
      const w = tri.sample({ allowed: ALL_LETTERS, rand });
      if (w === null || !tri.acceptable(w)) continue;
      made++;
      expect(w.includes('ern') || w.includes('lane')).toBe(false);
    }
    expect(made).toBeGreaterThan(200);
  });

  it('keeps English output clean', () => {
    const filter = corpusFilter(en);
    expect(eligibleWords(en, ALL_LETTERS).filter(filter).length).toBe(0);
    const tri = trigramModel(en);
    const rand = seededRandom(9);
    let made = 0;
    let blocked = 0;
    for (let i = 0; i < 5000; i++) {
      const w = tri.sample({ allowed: ALL_LETTERS, rand });
      if (w === null || !tri.acceptable(w)) continue;
      made++;
      if (isBlocked(w, blockList('en'))) blocked++;
    }
    expect(made).toBeGreaterThan(1000);
    expect(blocked).toBe(0);
  });
});
