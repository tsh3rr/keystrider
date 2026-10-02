import { codeFor } from './weakness';

/**
 * Which finger presses which key, in standard touch typing.
 *
 * Fingers are assigned by physical key (`KeyboardEvent.code`), not by
 * character: the columns of the keyboard stay where they are whatever the
 * layout, so on German QWERTZ "y" (code KeyZ, bottom left) is a left pinky
 * key and "z" (code KeyY) a right index key. Pure logic, no DOM.
 */
export type Hand = 'left' | 'right';
export type FingerName = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';
export interface Finger {
  hand: Hand;
  name: FingerName;
}

const COLUMNS: Record<string, string[]> = {
  'left-pinky': ['Backquote', 'Digit1', 'KeyQ', 'KeyA', 'IntlBackslash', 'KeyZ', 'ShiftLeft'],
  'left-ring': ['Digit2', 'KeyW', 'KeyS', 'KeyX'],
  'left-middle': ['Digit3', 'KeyE', 'KeyD', 'KeyC'],
  'left-index': ['Digit4', 'Digit5', 'KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyV', 'KeyB'],
  'right-index': ['Digit6', 'Digit7', 'KeyY', 'KeyU', 'KeyH', 'KeyJ', 'KeyN', 'KeyM'],
  'right-middle': ['Digit8', 'KeyI', 'KeyK', 'Comma'],
  'right-ring': ['Digit9', 'KeyO', 'KeyL', 'Period'],
  'right-pinky': [
    'Digit0', 'Minus', 'Equal', 'KeyP', 'BracketLeft', 'BracketRight',
    'Semicolon', 'Quote', 'Backslash', 'Slash', 'ShiftRight', 'Enter',
  ],
};

const FINGER_OF = new Map<string, Finger>();
for (const [key, codes] of Object.entries(COLUMNS)) {
  const [hand, name] = key.split('-') as [Hand, FingerName];
  for (const code of codes) FINGER_OF.set(code, { hand, name });
}

/** Where each finger rests between keystrokes; F and J carry the bumps you can feel. */
export const HOME_KEYS: Readonly<Record<string, string>> = {
  'left-pinky': 'KeyA', 'left-ring': 'KeyS', 'left-middle': 'KeyD', 'left-index': 'KeyF',
  'right-index': 'KeyJ', 'right-middle': 'KeyK', 'right-ring': 'KeyL', 'right-pinky': 'Semicolon',
};
export const HOME_ROW: readonly string[] = Object.values(HOME_KEYS);

export function fingerFor(code: string): Finger | null {
  if (code === 'Space') return { hand: 'right', name: 'thumb' };
  return FINGER_OF.get(code) ?? null;
}

export const fingerId = (f: Finger) => `${f.hand}-${f.name}`;

/** "left index finger", "right pinky", "thumb". */
export function describeFinger(f: Finger): string {
  if (f.name === 'thumb') return 'thumb';
  return `${f.hand} ${f.name}${f.name === 'pinky' ? '' : ' finger'}`;
}

export interface KeyGuide {
  /** Physical key that types the character. */
  code: string;
  finger: Finger;
  /** Home key the finger reaches from, or null when the key is itself on the home row (or Space). */
  home: string | null;
  /** Shift key to hold with the other hand, for capitals. */
  shift: 'ShiftLeft' | 'ShiftRight' | null;
}

/**
 * How to type `ch` on the layout, or null when it is not on the base layer
 * (symbols that need Shift or AltGr are not mapped yet).
 */
export function guideFor(layoutId: string, ch: string): KeyGuide | null {
  const code = codeFor(layoutId, ch);
  if (code === null) return null;
  const finger = fingerFor(code);
  if (!finger) return null;
  const homeKey = HOME_KEYS[fingerId(finger)];
  const home = homeKey && homeKey !== code ? homeKey : null;
  // codeFor found the key through the lowercase letter, so this is a capital.
  const isCapital = ch !== ch.toLowerCase();
  // Shift is held by the pinky of the hand that is not typing the letter.
  const shift = isCapital ? (finger.hand === 'left' ? 'ShiftRight' : 'ShiftLeft') : null;
  return { code, finger, home, shift };
}
