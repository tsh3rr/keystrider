import { afterEach, describe, expect, it } from 'vitest';
import { browserUiLanguage, percent, plural, setUiLanguage, t } from './i18n';
import { en } from './locales/en';
import { de } from './locales/de';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('locales', () => {
  it('German has every English key and no others', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('German texts use the same placeholders as English', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe('t', () => {
  afterEach(() => setUiLanguage('en'));

  it('fills in placeholders', () => {
    expect(t('drill.coreN', { n: 2 })).toBe('Drill 2');
    setUiLanguage('de');
    expect(t('drill.coreN', { n: 2 })).toBe('Übung 2');
  });

  it('leaves unknown placeholders visible', () => {
    expect(t('drill.coreN')).toBe('Drill {n}');
  });

  it('picks singular or plural', () => {
    expect(plural(1, 'pop.fresh.ok.one', 'pop.fresh.ok.other', { long: 40 })).toMatch(/^1 minute /);
    expect(plural(3, 'pop.fresh.ok.one', 'pop.fresh.ok.other', { long: 40 })).toMatch(/^3 minutes /);
  });

  it('formats percentages for the language', () => {
    expect(percent(0.965, 1)).toBe('96.5%');
    setUiLanguage('de');
    expect(percent(0.965, 1)).toBe('96,5 %');
  });
});

describe('browserUiLanguage', () => {
  it('takes the first browser language the app has text for', () => {
    expect(browserUiLanguage(['de-AT', 'en'])).toBe('de');
    expect(browserUiLanguage(['pl', 'en-GB'])).toBe('en');
    expect(browserUiLanguage(['pl'])).toBe('en');
  });
});
