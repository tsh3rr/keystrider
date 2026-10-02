import { describe, expect, it } from 'vitest';
import { ROWS } from './layouts';
import { describeFinger, fingerFor, guideFor, HOME_ROW } from './fingers';

describe('fingerFor', () => {
  it('assigns a finger to every key on the four rows', () => {
    for (const code of ROWS.flat()) expect(fingerFor(code), code).not.toBeNull();
  });

  it('puts the home row under the eight fingers, left pinky to right pinky', () => {
    expect(HOME_ROW.map((c) => describeFinger(fingerFor(c)!))).toEqual([
      'left pinky', 'left ring finger', 'left middle finger', 'left index finger',
      'right index finger', 'right middle finger', 'right ring finger', 'right pinky',
    ]);
  });

  it('types Space with a thumb', () => {
    expect(describeFinger(fingerFor('Space')!)).toBe('thumb');
  });
});

describe('guideFor', () => {
  it('follows the physical key on German QWERTZ, not US positions', () => {
    // QWERTZ y sits bottom left (code KeyZ), z sits right of t (code KeyY).
    expect(guideFor('qwertz-de', 'y')).toMatchObject({ code: 'KeyZ', finger: { hand: 'left', name: 'pinky' }, home: 'KeyA' });
    expect(guideFor('qwertz-de', 'z')).toMatchObject({ code: 'KeyY', finger: { hand: 'right', name: 'index' }, home: 'KeyJ' });
    expect(guideFor('qwerty-us', 'z')).toMatchObject({ code: 'KeyZ', finger: { hand: 'left', name: 'pinky' } });
  });

  it('maps umlauts to their keys', () => {
    expect(guideFor('qwertz-de', 'ö')).toMatchObject({ code: 'Semicolon', home: null, finger: { name: 'pinky' } });
    expect(guideFor('qwertz-de', 'ü')).toMatchObject({ code: 'BracketLeft', home: 'Semicolon' });
  });

  it('has no reach for home row keys or Space', () => {
    expect(guideFor('qwertz-de', 'f')?.home).toBeNull();
    expect(guideFor('qwertz-de', ' ')).toMatchObject({ code: 'Space', home: null, shift: null });
  });

  it('holds Shift with the other hand for capitals', () => {
    expect(guideFor('qwertz-de', 'A')).toMatchObject({ code: 'KeyA', shift: 'ShiftRight' });
    expect(guideFor('qwertz-de', 'K')).toMatchObject({ code: 'KeyK', shift: 'ShiftLeft' });
    expect(guideFor('qwertz-de', 'k')?.shift).toBeNull();
    expect(guideFor('qwertz-de', 'ß')?.shift).toBeNull();
  });

  it('guides punctuation and digits on their layout, with Shift where needed', () => {
    expect(guideFor('qwertz-de', '?')).toMatchObject({ code: 'Minus', finger: { hand: 'right', name: 'pinky' }, shift: 'ShiftLeft' });
    expect(guideFor('qwerty-us', '?')).toMatchObject({ code: 'Slash', shift: 'ShiftLeft' });
    expect(guideFor('qwertz-de', '-')).toMatchObject({ code: 'Slash', shift: null });
    expect(guideFor('qwertz-de', '(')).toMatchObject({ code: 'Digit8', finger: { hand: 'right', name: 'middle' }, shift: 'ShiftLeft' });
    expect(guideFor('qwerty-us', '1')).toMatchObject({ code: 'Digit1', finger: { hand: 'left', name: 'pinky' }, shift: null });
    expect(guideFor('azerty-fr', '1')).toMatchObject({ code: 'Digit1', shift: 'ShiftRight' });
    expect(guideFor('qwerty-us', '"')).toMatchObject({ code: 'Quote', shift: 'ShiftLeft' });
  });

  it('gives no hint for AltGr symbols', () => {
    expect(guideFor('qwertz-de', '@')).toBeNull();
  });
});
