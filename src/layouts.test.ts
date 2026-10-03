import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  KeyObserver, LAYOUTS, charLabel, detectLayout, getLayout, guessFromLocale, howToType, keyLabel, relabelPlan,
} from './layouts';
import { KeystrokeStore } from './store';
import { TypingSession } from './session';

/** What a user on `layoutId` produces when typing `text` (base layer only). */
function typed(layoutId: string, text: string): [string, string][] {
  const byChar = new Map([...getLayout(layoutId)!.keys].map(([code, ch]) => [ch, code]));
  return [...text].filter((ch) => byChar.has(ch)).map((ch) => [byChar.get(ch)!, ch]);
}

function keydown(code: string, key: string, mods: { shift?: boolean; altGr?: boolean } = {}) {
  return {
    code, key, shiftKey: !!mods.shift, ctrlKey: false, altKey: false, metaKey: false,
    getModifierState: (m: string) => m === 'AltGraph' && !!mods.altGr,
  };
}

describe('layout table', () => {
  it('has unique ids and covers the main keys of each layout', () => {
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
    for (const l of LAYOUTS) expect(l.keys.size).toBeGreaterThanOrEqual(46);
  });

  it('labels physical keys as printed on the layout', () => {
    expect(keyLabel('qwertz-de', 'KeyZ')).toBe('Y');
    expect(keyLabel('qwertz-de', 'Semicolon')).toBe('Ö');
    expect(keyLabel('qwertz-de', 'Minus')).toBe('ß');
    expect(keyLabel('qwerty-us', 'KeyZ')).toBe('Z');
    expect(keyLabel('azerty-fr', 'KeyQ')).toBe('A');
    expect(keyLabel('unknown', 'KeyZ')).toBe('KeyZ');
  });
});

describe('howToType', () => {
  it('finds base-layer and Shift-layer characters per layout', () => {
    expect(howToType('qwerty-us', '-')).toEqual({ code: 'Minus', shift: false });
    expect(howToType('qwerty-us', '?')).toEqual({ code: 'Slash', shift: true });
    expect(howToType('qwertz-de', '-')).toEqual({ code: 'Slash', shift: false });
    expect(howToType('qwertz-de', '?')).toEqual({ code: 'Minus', shift: true });
    expect(howToType('qwertz-de', 'Z')).toEqual({ code: 'KeyY', shift: true });
    expect(howToType('qwerty-us', '1')).toEqual({ code: 'Digit1', shift: false });
    expect(howToType('azerty-fr', '1')).toEqual({ code: 'Digit1', shift: true });
    expect(howToType('qwerty-us', ' ')).toEqual({ code: 'Space', shift: false });
  });

  it('returns null for AltGr characters and unknown layouts', () => {
    expect(howToType('qwertz-de', '@')).toBeNull();
    expect(howToType('unknown', 'a')).toBeNull();
  });

  it('gives every layout capitals for all its base-layer ASCII letters', () => {
    for (const l of LAYOUTS) {
      for (const ch of l.keys.values()) {
        if (/^[a-z]$/.test(ch)) expect(howToType(l.id, ch.toUpperCase())?.shift).toBe(true);
      }
    }
  });

  it('types accented letters with a dead key first', () => {
    expect(howToType('qwerty-es', 'á')).toEqual({ code: 'KeyA', shift: false, dead: { code: 'Quote', shift: false, accent: '´' } });
    expect(howToType('qwerty-es', 'Ú')).toEqual({ code: 'KeyU', shift: true, dead: { code: 'Quote', shift: false, accent: '´' } });
    expect(howToType('qwerty-es', 'ü')).toEqual({ code: 'KeyU', shift: false, dead: { code: 'Quote', shift: true, accent: '¨' } });
    expect(howToType('azerty-fr', 'ê')).toEqual({ code: 'KeyE', shift: false, dead: { code: 'BracketLeft', shift: false, accent: '^' } });
    expect(howToType('azerty-fr', 'é')).toEqual({ code: 'Digit2', shift: false });
    // US QWERTY's ´ and ^ are plain characters, not dead keys.
    expect(howToType('qwerty-us', 'é')).toBeNull();
    expect(howToType('azerty-fr', 'á')).toBeNull();
  });

  it('types Polish letters with AltGr', () => {
    expect(howToType('qwerty-pl', 'ą')).toEqual({ code: 'KeyA', shift: false, altGr: true });
    expect(howToType('qwerty-pl', 'Ź')).toEqual({ code: 'KeyX', shift: true, altGr: true });
    expect(howToType('qwerty-us', 'ą')).toBeNull();
  });

  it('labels capitals with a Shift arrow and marks as themselves', () => {
    expect(charLabel('qwerty-us', 'e')).toBe('E');
    expect(charLabel('qwerty-us', 'E')).toBe('⇧E');
    expect(charLabel('qwertz-de', 'z')).toBe('Z');
    expect(charLabel('qwerty-us', '?')).toBe('?');
    expect(charLabel('qwerty-us', '7')).toBe('7');
    expect(charLabel('qwerty-us', ' ')).toBe('Space');
  });

  it('labels AltGr and dead-key letters as themselves, not as their base key', () => {
    expect(charLabel('qwerty-pl', 'ą')).toBe('Ą');
    expect(charLabel('qwerty-es', 'é')).toBe('É');
    expect(charLabel('qwerty-es', 'ñ')).toBe('Ñ');
  });
});

describe('detectLayout', () => {
  it('identifies every layout from the browser layout map', () => {
    for (const l of LAYOUTS) {
      const d = detectLayout(l.keys, l.locales);
      expect(d.layout).toBe(l.id);
    }
  });

  it('recognises German QWERTZ from y/z on swapped keys', () => {
    const d = detectLayout(typed('qwertz-de', 'you may be lazy'), ['de-DE']);
    expect(d.layout).toBe('qwertz-de');
    expect(d.candidates).not.toContain('qwerty-us');
  });

  it('keeps German and Swiss tied on letters alone and lets the browser language decide', () => {
    const pairs = typed('qwertz-de', 'you may be lazy');
    expect(detectLayout(pairs, ['de-DE'])).toMatchObject({ layout: 'qwertz-de', confidence: 'low' });
    expect(detectLayout(pairs, ['de-CH']).layout).toBe('qwertz-ch');
    // A German-only key settles it.
    expect(detectLayout([...pairs, ['Minus', 'ß']], ['de-CH'])).toMatchObject({ layout: 'qwertz-de', confidence: 'high' });
  });

  it('recognises AZERTY and Dvorak from ordinary words', () => {
    expect(detectLayout(typed('azerty-fr', 'quand nous aimons'), []).layout).toBe('azerty-fr');
    expect(detectLayout(typed('dvorak-us', 'the quick brown fox'), []).layout).toBe('dvorak-us');
  });

  it('is not thrown off by Shift or AltGr output that no base layer has', () => {
    const pairs: [string, string][] = [...typed('qwertz-de', 'zoo yes'), ['Minus', '?'], ['KeyQ', '@']];
    expect(detectLayout(pairs, []).candidates).toContain('qwertz-de');
    expect(detectLayout(pairs, []).candidates).not.toContain('qwerty-us');
  });

  it('reports no evidence when nothing usable was typed', () => {
    expect(detectLayout([], ['de'])).toEqual({ layout: null, confidence: 'none', candidates: [] });
  });
});

describe('guessFromLocale', () => {
  it('maps browser languages to their usual layout', () => {
    expect(guessFromLocale(['de-DE', 'de', 'en'])).toBe('qwertz-de');
    expect(guessFromLocale(['de-AT'])).toBe('qwertz-de');
    expect(guessFromLocale(['fr-CH'])).toBe('qwertz-ch');
    expect(guessFromLocale(['fr'])).toBe('azerty-fr');
    expect(guessFromLocale(['ja'])).toBe('qwerty-us');
  });
});

describe('KeyObserver', () => {
  it('keeps base-layer presses, lowercases letters and skips modified symbols', () => {
    const o = new KeyObserver();
    o.observe(keydown('KeyZ', 'Y', { shift: true }));
    o.observe(keydown('Minus', '?', { shift: true }));
    o.observe(keydown('KeyQ', '@', { altGr: true }));
    o.observe(keydown('Equal', 'Dead'));
    o.observe(keydown('Minus', 'ß'));
    expect([...o.observations()]).toEqual([['KeyZ', 'y'], ['Minus', 'ß']]);
  });

  it('forgets a key\'s old character when the OS layout is switched', () => {
    const o = new KeyObserver();
    o.observe(keydown('KeyZ', 'z'));
    o.observe(keydown('KeyZ', 'z'));
    o.observe(keydown('KeyZ', 'y'));
    expect([...o.observations()]).toEqual([['KeyZ', 'y']]);
  });
});

describe('relabelPlan', () => {
  const ev = (sessionId: string, layout: string, code: string | null, actual: string) => ({ sessionId, layout, code, actual });

  it('moves sessions whose keys contradict their tag and leaves the rest', () => {
    const events = [
      ev('de', 'qwerty-us', 'KeyZ', 'y'), // QWERTZ evidence
      ev('us', 'qwerty-us', 'KeyZ', 'z'), // really US
      ev('plain', 'qwerty-us', 'KeyA', 'a'), // fits both
    ];
    expect(relabelPlan(events, 'qwertz-de', 'evidence')).toEqual(new Map([['de', 'qwertz-de']]));
  });

  it('backfills ambiguous and evidence-free legacy sessions to the current layout', () => {
    const events = [
      ev('de', 'qwerty-us', 'KeyZ', 'y'),
      ev('us', 'qwerty-us', 'KeyZ', 'z'),
      ev('plain', 'qwerty-us', 'KeyA', 'a'),
      ev('old', 'qwerty-us', null, 'a'),
    ];
    expect(relabelPlan(events, 'qwertz-de', 'backfill')).toEqual(
      new Map([['de', 'qwertz-de'], ['plain', 'qwertz-de'], ['old', 'qwertz-de']]),
    );
  });
});

describe('KeystrokeStore.relabelSessions', () => {
  it('retags every keystroke of the named sessions', async () => {
    const store = await KeystrokeStore.open(new IDBFactory());
    const a = new TypingSession('yz', { language: 'en', layout: 'qwerty-us' }, 'a');
    const b = new TypingSession('yz', { language: 'en', layout: 'qwerty-us' }, 'b');
    for (const s of [a, b]) {
      await store.add(s.press('y', 1, 'KeyZ')!);
      await store.add(s.press('z', 2, 'KeyY')!);
    }
    expect(await store.relabelSessions(new Map([['a', 'qwertz-de']]))).toBe(2);
    const layouts = (await store.all()).map((e) => `${e.sessionId}:${e.layout}`);
    expect(layouts).toEqual(['a:qwertz-de', 'a:qwertz-de', 'b:qwerty-us', 'b:qwerty-us']);
    expect(await store.forLanguage('en', 'qwertz-de')).toHaveLength(2);
    store.close();
  });
});
