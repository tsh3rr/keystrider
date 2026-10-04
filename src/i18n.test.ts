import { afterEach, describe, expect, it } from 'vitest';
import { en, type Message } from './locales/en';
import { de } from './locales/de';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it as itLocale } from './locales/it';
import { pl } from './locales/pl';
import html from '../index.html?raw';
import { guessUiLanguage, num, pct, setUiLanguage, t, tMaybe, tNodes } from './i18n';

afterEach(() => setUiLanguage('en'));

const placeholders = (m: Message) =>
  [...new Set([...(typeof m === 'string' ? m : Object.values(m).join(' ')).matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort();

describe('i18n', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(t('result.done', { name: 'Drill 2' })).toBe('Drill 2 done');
    expect(t('result.done')).toBe('{name} done');
  });

  it('switches language', () => {
    setUiLanguage('de');
    expect(t('nav.practice')).toBe('Üben');
    expect(t('plan.coreN', { n: 3 })).toBe('Übung 3');
  });

  it('picks plural forms by n', () => {
    expect(t('result.slips', { n: 1 })).toBe('slip');
    expect(t('result.slips', { n: 0 })).toBe('slips');
    expect(t('fresh.ok', { n: 1, long: 40 })).toMatch(/^1 minute of/);
  });

  it('formats numbers the way each language writes them', () => {
    expect(num(96.5, 1)).toBe('96.5');
    expect(pct(0.965, 1)).toBe('96.5%');
    setUiLanguage('de');
    expect(num(96.5, 1)).toBe('96,5');
    expect(pct(0.92).replace(/\s/u, ' ')).toBe('92 %');
  });

  it('splits around node placeholders, keeping word order', () => {
    setUiLanguage('de');
    expect(tNodes('chip.usual', { wpm: '42' })).toEqual(['im Schnitt 42 WpM']);
  });

  it('only knows keys from the English source', () => {
    expect(tMaybe('layout.qwertz-de')).toBe('German QWERTZ');
    expect(tMaybe('layout.nope')).toBeUndefined();
  });

  it('guesses from the browser languages', () => {
    expect(guessUiLanguage(['de-AT', 'en'])).toBe('de');
    expect(guessUiLanguage(['fr-FR', 'en-GB'])).toBe('fr');
    expect(guessUiLanguage(['pl'])).toBe('pl');
    expect(guessUiLanguage(['pt-BR', 'es-MX'])).toBe('es');
    expect(guessUiLanguage(['nl'])).toBe('en');
  });

  it.each([['de', de], ['fr', fr], ['es', es], ['it', itLocale], ['pl', pl]] as const)('%s uses the same placeholders as English', (_, locale) => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(locale[key]), key).toEqual(placeholders(en[key]));
      expect(typeof locale[key], key).toBe(typeof en[key]);
    }
  });

  it('uses Polish few and many forms', () => {
    setUiLanguage('pl');
    expect(t('result.slips', { n: 1 })).toBe('pomyłka');
    expect(t('result.slips', { n: 3 })).toBe('pomyłki');
    expect(t('result.slips', { n: 5 })).toBe('pomyłek');
    expect(t('result.slips', { n: 22 })).toBe('pomyłki');
  });

  it('every key named in index.html exists', () => {
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) expect(Object.hasOwn(en, key), key).toBe(true);
  });
});
