import { describe, expect, it } from 'vitest';
import { de } from './corpora/de';
import { en } from './corpora/en';
import { DEFAULT_DRILL_PARAMS, TIERS, seededRandom, unlockSteps } from './drill';
import { DEFAULT_PLACEMENT_PARAMS, placeFromTest, placementText } from './placement';
import { TypingSession } from './session';
import type { KeystrokeEvent, PracticeContext } from './types';

const EN: PracticeContext = { language: 'en', layout: 'qwerty-us' };
const DE: PracticeContext = { language: 'de', layout: 'qwertz-de' };
const letters = (corpus = en, layout = EN.layout) => unlockSteps(corpus, layout).filter((s) => /^\p{L}$/u.test(s));

/** Types `text` at `iki` ms per key, pressing `wrong` first wherever the text has a letter in `weak`. */
function typeText(text: string, ctx = EN, iki = 150, weak = '', wrong = '#'): KeystrokeEvent[] {
  const s = new TypingSession(text, ctx, 'placement');
  const out: KeystrokeEvent[] = [];
  let t = 1_000_000;
  for (const c of text) {
    if (weak.includes(c)) out.push(s.press(wrong, (t += iki), null)!);
    out.push(s.press(c, (t += iki), null)!);
  }
  return out;
}

describe('placementText', () => {
  it('has the set number of lowercase words, each typeable with the language letters', () => {
    const text = placementText(en, EN.layout, seededRandom(1));
    const words = text.split(' ');
    expect(words).toHaveLength(DEFAULT_PLACEMENT_PARAMS.words);
    const allowed = new Set(letters());
    for (const w of words) for (const c of w) expect(allowed.has(c)).toBe(true);
  });

  it('uses every letter at least twice', () => {
    for (const [corpus, ctx] of [[en, EN], [de, DE]] as const) {
      const text = placementText(corpus, ctx.layout, seededRandom(7));
      for (const l of letters(corpus, ctx.layout)) {
        expect([...text].filter((c) => c === l).length, `${ctx.language} ${l}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('repeats no word', () => {
    const words = placementText(en, EN.layout, seededRandom(3)).split(' ');
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('placeFromTest', () => {
  const text = placementText(en, EN.layout, seededRandom(2));

  it('starts a slow typist at the beginning', () => {
    const p = placeFromTest(typeText(text, EN, 1000), en, EN);
    expect(p.skipped).toBe(false);
    expect(p.state.tier).toBe(1);
    expect(p.state.unlocked).toHaveLength(DEFAULT_DRILL_PARAMS.startKeys);
  });

  it('starts an inaccurate typist at the beginning', () => {
    const p = placeFromTest(typeText(text, EN, 150, 'etaoins'), en, EN);
    expect(p.accuracy).toBeLessThan(DEFAULT_PLACEMENT_PARAMS.minAccuracy);
    expect(p.skipped).toBe(false);
  });

  it('unlocks every letter and places the level under the speed for a fast, clean typist', () => {
    const p = placeFromTest(typeText(text, EN, 150), en, EN);
    // 150 ms per key is 80 WPM; the level sits at or under 80% of that.
    expect(p.wpm).toBeGreaterThan(75);
    expect(p.skipped).toBe(true);
    expect(TIERS[p.state.tier - 1]).toBeLessThanOrEqual(p.wpm * 0.8);
    expect(p.state.unlocked).toEqual(letters());
    expect(p.stoppedAt).toBeNull();
  });

  it('stops at the first letter in unlock order that goes wrong', () => {
    const order = letters();
    const weak = order[10];
    // Two misses on the letter, so it fails, while overall accuracy stays high.
    let missed = 0;
    const events: KeystrokeEvent[] = [];
    const s = new TypingSession(text, EN, 'placement');
    let t = 0;
    for (const c of text) {
      if (c === weak && missed < 2) {
        events.push(s.press('#', (t += 150), null)!);
        missed++;
      }
      events.push(s.press(c, (t += 150), null)!);
    }
    const p = placeFromTest(events, en, EN);
    expect(p.stoppedAt).toBe(weak);
    expect(p.state.unlocked).toEqual(order.slice(0, 10));
  });

  it('keeps the start keys for a placement in German', () => {
    const p = placeFromTest(typeText(placementText(de, DE.layout, seededRandom(4)), DE, 150), de, DE);
    expect(p.state.language).toBe('de');
    expect(p.state.unlocked).toEqual(letters(de, DE.layout));
  });
});
