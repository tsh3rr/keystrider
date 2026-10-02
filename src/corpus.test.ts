import { describe, expect, it } from 'vitest';
import { availableLanguages, guessLanguage } from './corpus';
import { de } from './corpora/de';
import { en } from './corpora/en';
import { practiceForm } from './sentences';

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

describe('German corpus', () => {
  it('has thousands of distinct lowercase words with umlauts and ß', () => {
    expect(de.words.length).toBeGreaterThanOrEqual(5000);
    expect(new Set(de.words).size).toBe(de.words.length);
    expect(de.words.every((w) => /^[a-zäöüß]+$/.test(w))).toBe(true);
    for (const c of 'äöüß') expect(de.words.filter((w) => w.includes(c)).length).toBeGreaterThan(20);
  });

  it('is ordered most frequent first', () => {
    expect(de.words.slice(0, 10)).toContain('und');
  });

  it('spells ß where German does, not the Swiss ss', () => {
    expect(de.words).toContain('weiß');
    expect(de.words).not.toContain('weiss');
    expect(de.words).toContain('dass');
  });

  it('lists every letter of its words in its unlock order, each once', () => {
    const order = de.unlockOrder ?? [];
    expect(new Set(order).size).toBe(order.length);
    expect(new Set(order)).toEqual(new Set(de.words.join('')));
  });

  it('has sentences that become typeable with the unlocked letters', () => {
    const letters = new Set([...(de.unlockOrder ?? []), ' ']);
    const forms = (de.sentences ?? []).map((s) => practiceForm(s, letters));
    expect(forms.every((f) => f !== null)).toBe(true);
  });
});

describe('guessLanguage', () => {
  it('picks the first browser language with a corpus, ignoring the region', () => {
    expect(guessLanguage(['de-AT', 'en'])).toBe('de');
    expect(guessLanguage(['xx', 'en-GB', 'de'])).toBe('en');
  });

  it('falls back to English', () => {
    expect(guessLanguage(['xx'])).toBe('en');
    expect(guessLanguage([])).toBe('en');
  });

  it('only guesses languages that exist', () => {
    expect(availableLanguages().map((c) => c.language)).toEqual(expect.arrayContaining(['en', 'de']));
  });
});
