import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TypingSession } from './session';
import { KeystrokeStore, toCsv } from './store';
import { getCorpus, randomText, type Corpus } from './corpus';

const EN = { language: 'en', layout: 'qwerty-us' };
const PL = { language: 'pl', layout: 'pl-programmer' };

describe('TypingSession', () => {
  it('logs expected, actual, previous keys and latency', () => {
    const s = new TypingSession('ab', EN, 'x');
    const e1 = s.press('a', 1000, 'KeyA')!;
    expect(e1).toMatchObject({
      sessionId: 'x', language: 'en', layout: 'qwerty-us', code: 'KeyA',
      position: 0, expected: 'a', actual: 'a',
      prevExpected: null, prevActual: null, latencyMs: null, correct: true,
    });

    const e2 = s.press('v', 1150)!;
    expect(e2).toMatchObject({
      position: 1, expected: 'b', actual: 'v',
      prevExpected: 'a', prevActual: 'a', latencyMs: 150, correct: false,
    });

    const e3 = s.press('b', 1400)!;
    expect(e3).toMatchObject({ position: 1, prevActual: 'v', latencyMs: 250, correct: true });
    expect(s.done).toBe(true);
    expect(s.press('c', 1500)).toBeNull();
  });

  it('computes WPM and accuracy', () => {
    const s = new TypingSession('hello', EN, 'x');
    for (const [i, c] of [...'hellx'].entries()) s.press(c, i * 100);
    s.press('o', 600);
    expect(s.accuracy()).toBeCloseTo(5 / 6);
    // 5 chars = 1 word in 600 ms = 100 WPM
    expect(s.wpm(600)).toBeCloseTo(100);
  });

  it('matches accented letters however they were composed', () => {
    // Target uses decomposed "e" + combining acute; typed "é" is precomposed.
    const s = new TypingSession('ze\u0301ż', PL, 'p');
    expect(s.press('z', 0)!.correct).toBe(true);
    const e = s.press('\u00e9', 10, 'KeyE')!;
    expect(e).toMatchObject({ expected: 'é', actual: 'é', correct: true, language: 'pl' });
    expect(s.press('z', 20)!.correct).toBe(false);
    expect(s.press('ż', 30, 'KeyZ')!).toMatchObject({ position: 2, correct: true });
    expect(s.done).toBe(true);
  });

  it('counts positions by code point, not UTF-16 unit', () => {
    const s = new TypingSession('😀a', EN, 'q');
    expect(s.press('😀', 0)!).toMatchObject({ position: 0, expected: '😀', correct: true });
    expect(s.press('a', 10)!).toMatchObject({ position: 1, prevExpected: '😀', correct: true });
    expect(s.done).toBe(true);
  });
});

describe('corpus', () => {
  it('draws words only from the given language', () => {
    const pl: Corpus = { language: 'pl', name: 'Polski', words: ['zażółć', 'gęślą'] };
    const words = randomText(pl, 20).split(' ');
    expect(words).toHaveLength(20);
    expect(words.every((w) => pl.words.includes(w))).toBe(true);
  });

  it('fails loudly for a language without a corpus', () => {
    expect(getCorpus('en').language).toBe('en');
    expect(() => getCorpus('xx')).toThrow(/xx/);
  });
});

describe('KeystrokeStore', () => {
  it('persists and clears events', async () => {
    const store = await KeystrokeStore.open();
    const s = new TypingSession('hi', EN, 'y');
    await store.add(s.press('h', 1)!);
    await store.add(s.press('u', 2)!);
    await store.add(new TypingSession('ą', PL, 'z').press('ą', 3, 'KeyA')!);
    const all = await store.all();
    expect(all).toHaveLength(3);
    expect(all[1]).toMatchObject({ expected: 'i', actual: 'u', correct: false });
    expect(await store.forLanguage('en')).toHaveLength(2);
    expect(await store.forLanguage('pl', 'pl-programmer')).toMatchObject([{ actual: 'ą', code: 'KeyA' }]);
    expect(await store.forLanguage('pl', 'qwerty-us')).toHaveLength(0);
    await store.clear();
    expect(await store.count()).toBe(0);
    store.close();
  });

  it('tags events logged before v2 as English QWERTY', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve) => {
      const req = factory.open('typing-trainer', 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore('keystrokes', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('timestamp', 'timestamp');
        store.add({ sessionId: 'old', expected: 'a', actual: 'a', correct: true });
      };
      req.onsuccess = () => { req.result.close(); resolve(); };
    });
    const store = await KeystrokeStore.open(factory);
    expect(await store.forLanguage('en', 'qwerty-us')).toMatchObject([
      { sessionId: 'old', language: 'en', layout: 'qwerty-us', code: null },
    ]);
    store.close();
  });
});

describe('toCsv', () => {
  it('quotes whitespace and leaves nulls empty', () => {
    const s = new TypingSession('a b', EN, 'z');
    s.press('a', 0);
    const csv = toCsv([s.press(',', 10, 'Comma')!]);
    const [, row] = csv.split('\n');
    expect(row).toBe(',z,en,qwerty-us,10,1," ",",",Comma,a,a,10,false');
  });
});
