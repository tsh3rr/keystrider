import { describe, expect, it } from 'vitest';
import { en } from './corpora/en';

describe('English corpus', () => {
  it('has thousands of distinct lowercase words', () => {
    expect(en.words.length).toBeGreaterThanOrEqual(5000);
    expect(new Set(en.words).size).toBe(en.words.length);
    expect(en.words.every((w) => /^[a-z]+$/.test(w))).toBe(true);
  });

  it('is ordered most frequent first', () => {
    expect(en.words.slice(0, 10)).toContain('the');
  });

  it('can unlock every letter in its unlock order', () => {
    const letters = new Set(en.words.join(''));
    for (const c of en.unlockOrder ?? []) expect(letters.has(c)).toBe(true);
  });
});
