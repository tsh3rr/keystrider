import { describe, expect, it } from 'vitest';
import { availableLanguages, guessLanguage } from './corpus';
import { de } from './corpora/de';
import { en } from './corpora/en';
import { es } from './corpora/es';
import { fr } from './corpora/fr';
import { it as itCorpus } from './corpora/it';
import { pl } from './corpora/pl';
import { practiceForm } from './sentences';
import { CAPITALS, stepChars, unlockSteps } from './drill';

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

describe.each([
  { corpus: fr, layout: 'azerty-fr', letters: /^[a-zàâçéèêëîïôùûœæüÿ]+$/, special: 'éèàçê', common: 'et' },
  { corpus: es, layout: 'qwerty-es', letters: /^[a-záéíóúüñ]+$/, special: 'áéíóúñ', common: 'que' },
  { corpus: itCorpus, layout: 'qwerty-it', letters: /^[a-zàèéìòù]+$/, special: 'àèéìòù', common: 'che' },
  { corpus: pl, layout: 'qwerty-pl', letters: /^[a-ząćęłńóśźż]+$/, special: 'ąćęłńóśźż', common: 'nie' },
])('$corpus.name corpus', ({ corpus, layout, letters, special, common }) => {
  it('has thousands of distinct lowercase words with its accented letters', () => {
    expect(corpus.words.length).toBeGreaterThanOrEqual(5000);
    expect(new Set(corpus.words).size).toBe(corpus.words.length);
    expect(corpus.words.every((w) => letters.test(w))).toBe(true);
    for (const c of special) expect(corpus.words.some((w) => w.includes(c)), c).toBe(true);
  });

  it('is ordered most frequent first', () => {
    expect(corpus.words.slice(0, 10)).toContain(common);
  });

  it('lists every letter of its words in its unlock order, each once', () => {
    const order = corpus.unlockOrder ?? [];
    expect(new Set(order).size).toBe(order.length);
    expect(new Set(order)).toEqual(new Set(corpus.words.join('')));
  });

  it('unlocks every letter and mark on its own keyboard layout', () => {
    const steps = unlockSteps(corpus, layout);
    for (const c of corpus.unlockOrder ?? []) expect(steps, c).toContain(c);
    for (const m of corpus.punctuation ?? []) expect(steps, m).toContain(m);
  });

  it('has sentences that become typeable on its layout once everything is unlocked', () => {
    const steps = unlockSteps(corpus, layout);
    const letters = steps.filter((s) => s.length === 1 && s.toLowerCase() !== s.toUpperCase());
    const allowed = new Set([' ', ...steps.flatMap((s) => stepChars(s, letters, layout))]);
    expect(steps).toContain(CAPITALS);
    // Capitals the layout lacks (À on AZERTY) are typed lowercase; nothing else may change.
    for (const s of corpus.sentences ?? []) expect(practiceForm(s, allowed)?.toLowerCase(), s).toBe(s.toLowerCase());
  });
});

describe('guessLanguage', () => {
  it('picks the first browser language with a corpus, ignoring the region', () => {
    expect(guessLanguage(['de-AT', 'en'])).toBe('de');
    expect(guessLanguage(['xx', 'en-GB', 'de'])).toBe('en');
    expect(guessLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(guessLanguage(['pl-PL'])).toBe('pl');
  });

  it('falls back to English', () => {
    expect(guessLanguage(['xx'])).toBe('en');
    expect(guessLanguage([])).toBe('en');
  });

  it('only guesses languages that exist', () => {
    expect(availableLanguages().map((c) => c.language)).toEqual(expect.arrayContaining(['en', 'de', 'fr', 'es', 'it', 'pl']));
  });
});
