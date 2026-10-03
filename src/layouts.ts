/**
 * Keyboard layouts: which character each physical key produces.
 *
 * `KeyboardEvent.code` names physical keys after their US QWERTY position
 * ("KeyZ" is the key left of X), so on a German keyboard typing "y" reports
 * code "KeyZ". A layout maps those physical codes to the characters printed
 * on the user's keyboard. The base layer tells layouts apart and names
 * keys; the Shift layer says how capitals, punctuation and digits are typed.
 * Accented letters typed with a dead key (´ then e for é), letters on
 * AltGr (Polish ą) and symbols on AltGr (German @ and €) are listed
 * separately, as on the standard Windows layouts.
 */
export interface Layout {
  /** Stored in `KeystrokeEvent.layout`, e.g. "qwertz-de". */
  id: string;
  /** Shown in the layout picker. */
  name: string;
  /** Language tags whose users most likely have this layout; breaks ties. */
  locales: readonly string[];
  /** Physical key code to the character it types without modifiers. */
  keys: ReadonlyMap<string, string>;
  /** Physical key code to the character it types with Shift. */
  shifted: ReadonlyMap<string, string>;
  /** Accents on the base or Shift layer that are dead keys: pressed before a letter, they add the accent to it. */
  dead: ReadonlySet<string>;
  /** Letters typed with AltGr, to the base-layer letter of their key ("ą" → "a"). Capitals add Shift. */
  altGr: ReadonlyMap<string, string>;
  /** Symbols typed with AltGr, to their key and whether Shift is held too (German @ is AltGr + Q). */
  altGrSymbols: ReadonlyMap<string, { code: string; shift: boolean }>;
}

/** Combining mark each dead-key accent adds. */
const ACCENTS = new Map([['´', '\u0301'], ['`', '\u0300'], ['^', '\u0302'], ['¨', '\u0308'], ['~', '\u0303']]);

/** How to type a character: its key, whether Shift is held, and any AltGr or dead key needed first. */
export interface KeyPress {
  code: string;
  shift: boolean;
  /** Held with the key (Polish ą, German @). */
  altGr?: true;
  /** Dead key pressed before the key (´ before e for é), and the accent printed on it. */
  dead?: { code: string; shift: boolean; accent: string };
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => `Digit${d}`);
const letters = (s: string) => [...s].map((c) => `Key${c}`);
// The four rows of an ISO keyboard, left to right, as KeyboardEvent.code values.
export const ROWS: readonly (readonly string[])[] = [
  ['Backquote', ...DIGITS, 'Minus', 'Equal'],
  [...letters('QWERTYUIOP'), 'BracketLeft', 'BracketRight'],
  [...letters('ASDFGHJKL'), 'Semicolon', 'Quote', 'Backslash'],
  ['IntlBackslash', ...letters('ZXCVBNM'), 'Comma', 'Period', 'Slash'],
];

type Rows = [string, string, string, string];

interface Extras {
  /** Characters of the rows that are dead keys. */
  dead?: string;
  /** AltGr letter to the base letter of its key, e.g. { ą: 'a' }. */
  altGr?: Record<string, string>;
  /** AltGr symbol to the code of its key, e.g. { '@': 'KeyQ' }; a leading ⇧ adds Shift. */
  symbols?: Record<string, string>;
}

/** Builds a layout from one string per row, base and Shift layer; a space marks a key the layout lacks. */
function layout(id: string, name: string, locales: string[], rows: Rows, shiftRows: Rows, extras: Extras = {}): Layout {
  const map = (rs: Rows) => {
    const keys = new Map<string, string>();
    rs.forEach((row, r) => {
      const chars = [...row];
      if (chars.length !== ROWS[r].length) throw new Error(`Layout ${id}: row ${r} has ${chars.length} keys`);
      chars.forEach((ch, i) => {
        if (ch !== ' ') keys.set(ROWS[r][i], ch);
      });
    });
    return keys;
  };
  return {
    id, name, locales, keys: map(rows), shifted: map(shiftRows),
    dead: new Set(extras.dead ?? ''), altGr: new Map(Object.entries(extras.altGr ?? {})),
    altGrSymbols: new Map(Object.entries(extras.symbols ?? {}).map(([ch, key]) => {
      const shift = key.startsWith('⇧');
      const code = shift ? key.slice(1) : key;
      if (!ROWS.some((row) => row.includes(code))) throw new Error(`Layout ${id}: unknown key ${code} for ${ch}`);
      return [ch, { code, shift }];
    })),
  };
}

// Dead keys (German ^ and ´, Spanish ´ and `, ...) are listed with the accent
// they add; the browser reports them as "Dead" while typing, so they never
// count as evidence for or against a layout.
export const LAYOUTS: readonly Layout[] = [
  layout('qwerty-us', 'English (US) QWERTY', ['en-US', 'en'], [
    '`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'\\", ' zxcvbnm,./'], [
    '~!@#$%^&*()_+', 'QWERTYUIOP{}', 'ASDFGHJKL:"|', ' ZXCVBNM<>?']),
  layout('qwerty-uk', 'English (UK) QWERTY', ['en-GB', 'en-IE'], [
    '`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'#", '\\zxcvbnm,./'], [
    '¬!"£$%^&*()_+', 'QWERTYUIOP{}', 'ASDFGHJKL:@~', '|ZXCVBNM<>?'], {
    symbols: { '€': 'Digit4', '¦': 'Backquote' },
  }),
  layout('qwertz-de', 'German QWERTZ', ['de', 'de-DE', 'de-AT'], [
    '^1234567890ß´', 'qwertzuiopü+', 'asdfghjklöä#', '<yxcvbnm,.-'], [
    '°!"§$%&/()=?`', 'QWERTZUIOPÜ*', "ASDFGHJKLÖÄ'", '>YXCVBNM;:_'], {
    dead: '^´`',
    symbols: {
      '@': 'KeyQ', '€': 'KeyE', 'µ': 'KeyM', '²': 'Digit2', '³': 'Digit3', '{': 'Digit7', '[': 'Digit8', ']': 'Digit9',
      '}': 'Digit0', '\\': 'Minus', '~': 'BracketRight', '|': 'IntlBackslash',
    },
  }),
  layout('qwertz-ch', 'Swiss QWERTZ', ['de-CH', 'fr-CH', 'it-CH'], [
    "§1234567890'^", 'qwertzuiopü¨', 'asdfghjklöä$', '<yxcvbnm,.-'], [
    '°+"*ç%&/()=?`', 'QWERTZUIOPè!', 'ASDFGHJKLéà£', '>YXCVBNM;:_'], {
    dead: '^`¨',
    symbols: {
      '¦': 'Digit1', '@': 'Digit2', '#': 'Digit3', '¬': 'Digit6', '|': 'Digit7', '¢': 'Digit8', '€': 'KeyE',
      '[': 'BracketLeft', ']': 'BracketRight', '{': 'Quote', '}': 'Backslash', '\\': 'IntlBackslash',
    },
  }),
  layout('azerty-fr', 'French AZERTY', ['fr', 'fr-FR'], [
    `²&é"'(-è_çà)=`, 'azertyuiop^$', 'qsdfghjklmù*', '<wxcvbn,;:!'], [
    ' 1234567890°+', 'AZERTYUIOP¨£', 'QSDFGHJKLM%µ', '>WXCVBN?./§'], {
    dead: '^¨',
    symbols: {
      '#': 'Digit3', '{': 'Digit4', '[': 'Digit5', '|': 'Digit6', '\\': 'Digit8', '@': 'Digit0', ']': 'Minus',
      '}': 'Equal', '€': 'KeyE', '¤': 'BracketRight',
    },
  }),
  layout('azerty-be', 'Belgian AZERTY', ['fr-BE', 'nl-BE'], [
    `²&é"'(§è!çà)-`, 'azertyuiop^$', 'qsdfghjklmùµ', '<wxcvbn,;:='], [
    '³1234567890°_', 'AZERTYUIOP¨*', 'QSDFGHJKLM%£', '>WXCVBN?./+'], {
    dead: '^¨',
    symbols: {
      '|': 'Digit1', '@': 'Digit2', '#': 'Digit3', '{': 'Digit9', '}': 'Digit0', '€': 'KeyE', '[': 'BracketLeft',
      ']': 'BracketRight', '\\': 'IntlBackslash',
    },
  }),
  layout('qwerty-es', 'Spanish QWERTY', ['es', 'es-ES'], [
    "º1234567890'¡", 'qwertyuiop`+', 'asdfghjklñ´ç', '<zxcvbnm,.-'], [
    'ª!"·$%&/()=?¿', 'QWERTYUIOP^*', 'ASDFGHJKLÑ¨Ç', '>ZXCVBNM;:_'], {
    dead: '´`^¨',
    symbols: {
      '\\': 'Backquote', '|': 'Digit1', '@': 'Digit2', '#': 'Digit3', '¬': 'Digit6', '€': 'KeyE', '[': 'BracketLeft',
      ']': 'BracketRight', '{': 'Quote', '}': 'Backslash',
    },
  }),
  layout('qwerty-it', 'Italian QWERTY', ['it', 'it-IT'], [
    "\\1234567890'ì", 'qwertyuiopè+', 'asdfghjklòàù', '<zxcvbnm,.-'], [
    '|!"£$%&/()=?^', 'QWERTYUIOPé*', 'ASDFGHJKLç°§', '>ZXCVBNM;:_'], {
    symbols: { '€': 'KeyE', '[': 'BracketLeft', ']': 'BracketRight', '{': '⇧BracketLeft', '}': '⇧BracketRight', '@': 'Semicolon', '#': 'Quote' },
  }),
  layout('qwerty-se', 'Swedish / Finnish QWERTY', ['sv', 'fi'], [
    '§1234567890+´', 'qwertyuiopå¨', "asdfghjklöä'", '<zxcvbnm,.-'], [
    '½!"#¤%&/()=?`', 'QWERTYUIOPÅ^', 'ASDFGHJKLÖÄ*', '>ZXCVBNM;:_'], {
    dead: '´`¨^',
    symbols: {
      '@': 'Digit2', '£': 'Digit3', '$': 'Digit4', '€': 'KeyE', '{': 'Digit7', '[': 'Digit8', ']': 'Digit9', '}': 'Digit0',
      '\\': 'Minus', '|': 'IntlBackslash', 'µ': 'KeyM',
    },
  }),
  // Same base layer as US; Polish letters come from AltGr.
  layout('qwerty-pl', 'Polish (Programmers)', ['pl'], [
    '`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'\\", '\\zxcvbnm,./'], [
    '~!@#$%^&*()_+', 'QWERTYUIOP{}', 'ASDFGHJKL:"|', '|ZXCVBNM<>?'], {
    altGr: { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'x', ż: 'z' },
    symbols: { '€': 'KeyU' },
  }),
  layout('dvorak-us', 'Dvorak (US)', [], [
    '`1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-\\', ' ;qjkxbmwvz'], [
    '~!@#$%^&*(){}', '"<>PYFGCRL?+', 'AOEUIDHTNS_|', ' :QJKXBMWVZ']),
  layout('colemak', 'Colemak', [], [
    '`1234567890-=', 'qwfpgjluy;[]', "arstdhneio'\\", ' zxcvbkm,./'], [
    '~!@#$%^&*()_+', 'QWFPGJLUY:{}', 'ARSTDHNEIO"|', ' ZXCVBKM<>?']),
];

export const DEFAULT_LAYOUT = 'qwerty-us';

const BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));

export function getLayout(id: string): Layout | undefined {
  return BY_ID.get(id);
}

/**
 * The physical key that types `ch` on the layout, and whether it needs
 * Shift. Base layer first, so "1" on QWERTY is unshifted while on AZERTY it
 * needs Shift. Then AltGr letters and symbols and letters made with a dead
 * key, which say so. Null when the layout cannot type it (or is unknown).
 */
export function howToType(layoutId: string, ch: string): KeyPress | null {
  if (ch === ' ') return { code: 'Space', shift: false };
  const l = BY_ID.get(layoutId);
  if (!l) return null;
  return direct(l, ch) ?? viaAltGr(l, ch) ?? viaDeadKey(l, ch);
}

function direct(l: Layout, ch: string): KeyPress | null {
  for (const [code, c] of l.keys) if (c === ch) return { code, shift: false };
  for (const [code, c] of l.shifted) if (c === ch) return { code, shift: true };
  return null;
}

function viaAltGr(l: Layout, ch: string): KeyPress | null {
  const symbol = l.altGrSymbols.get(ch);
  if (symbol) return { ...symbol, altGr: true };
  const lower = ch.toLowerCase();
  const base = l.altGr.get(lower);
  if (base === undefined) return null;
  const key = direct(l, base);
  return key && !key.shift ? { code: key.code, shift: ch !== lower, altGr: true } : null;
}

function viaDeadKey(l: Layout, ch: string): KeyPress | null {
  const [letter, mark, ...rest] = [...ch.normalize('NFD')];
  if (mark === undefined || rest.length > 0) return null;
  for (const accent of l.dead) {
    if (ACCENTS.get(accent) !== mark) continue;
    const dead = direct(l, accent);
    const key = direct(l, letter);
    if (dead && key) return { ...key, dead: { ...dead, accent } };
  }
  return null;
}

/**
 * Label of a physical key on the given layout, e.g. "Y" for "KeyZ" on
 * QWERTZ. Falls back to the raw code for keys the layout does not list.
 */
export function keyLabel(layoutId: string, code: string): string {
  const ch = BY_ID.get(layoutId)?.keys.get(code);
  if (ch === undefined) return code;
  // "ß".toUpperCase() is "SS"; keep characters without a one-letter capital as they are.
  const upper = ch.toUpperCase();
  return [...upper].length === 1 ? upper : ch;
}

/**
 * How to show a typed character as a key: letters as their key cap ("Z"),
 * capitals with a Shift arrow ("⇧Z") so they differ from the lowercase key,
 * and punctuation and digits as themselves.
 */
export function charLabel(layoutId: string, ch: string): string {
  if (ch === ' ') return 'Space';
  const lower = ch.toLowerCase();
  const upper = ch.toUpperCase();
  if (lower === upper) return ch;
  const base = howToType(layoutId, lower);
  // Only a letter with its own key shows the key cap; ą (AltGr+A) or é (dead key) show themselves.
  const cap = base && !base.shift && !base.altGr && !base.dead ? keyLabel(layoutId, base.code) : upper;
  return ch === lower ? cap : '⇧' + cap;
}

/** Observed (physical key, character) pairs: the evidence detection works from. */
export type KeyObservations = Iterable<readonly [code: string, char: string]>;

export interface Detection {
  /** Best matching layout id, or null when there was no usable evidence. */
  layout: string | null;
  /**
   * "high": the evidence rules out every other layout.
   * "low": several layouts fit equally well (for example only letters were
   * typed, which German and Swiss QWERTZ share) and the browser language
   * or list order picked one.
   */
  confidence: 'high' | 'low' | 'none';
  /** All layouts that tied for the best score, best guess first. */
  candidates: string[];
}

/**
 * Scores every known layout against observed key/character pairs.
 *
 * A pair that a layout predicts counts for it, one it contradicts counts
 * against it. Characters no layout's base layer produces (Shift or AltGr
 * output like "?" or "ą") contradict all of them equally, so they cannot
 * change the ranking; that keeps detection usable on raw logged keystrokes,
 * which do not record modifiers.
 */
export function detectLayout(observations: KeyObservations, locales: readonly string[] = []): Detection {
  // Collapse to one tally per (code, char) so repeated keys weigh in proportion.
  const tally = new Map<string, Map<string, number>>();
  for (const [code, rawChar] of observations) {
    const char = rawChar.toLowerCase();
    if (!code || [...char].length !== 1) continue;
    const perCode = tally.get(code) ?? new Map<string, number>();
    perCode.set(char, (perCode.get(char) ?? 0) + 1);
    tally.set(code, perCode);
  }

  const scores = LAYOUTS.map((l) => {
    let score = 0;
    let evidence = 0;
    for (const [code, chars] of tally) {
      const expected = l.keys.get(code);
      if (expected === undefined) continue;
      for (const [char, n] of chars) {
        evidence += n;
        score += char === expected ? n : -n;
      }
    }
    return { id: l.id, score, evidence };
  });

  if (scores.every((s) => s.evidence === 0)) return { layout: null, confidence: 'none', candidates: [] };

  const best = Math.max(...scores.map((s) => s.score));
  const tied = scores.filter((s) => s.score === best).map((s) => s.id);
  const candidates = rankByLocale(tied, locales);
  return {
    layout: candidates[0],
    confidence: candidates.length === 1 ? 'high' : 'low',
    candidates,
  };
}

/** Orders layout ids so the one matching the user's languages comes first. */
function rankByLocale(ids: string[], locales: readonly string[]): string[] {
  const rank = (id: string) => {
    const layoutLocales = BY_ID.get(id)!.locales;
    const i = locales.findIndex((loc) =>
      layoutLocales.some((l) => l.toLowerCase() === loc.toLowerCase()),
    );
    if (i >= 0) return i * 2;
    // A bare language ("de") matching a regional one ("de-AT") ranks just behind an exact match.
    const j = locales.findIndex((loc) => layoutLocales.includes(loc.split('-')[0]));
    return j >= 0 ? j * 2 + 1 : Infinity;
  };
  // Stable sort keeps LAYOUTS order (US first) among equally ranked ids.
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

/** Best guess from browser languages alone, before any key was pressed. */
export function guessFromLocale(locales: readonly string[]): string {
  return rankByLocale(LAYOUTS.map((l) => l.id), locales)[0];
}

const MAX_COUNT = 20;

/**
 * Collects (code, character) pairs from keydown events while the user types,
 * keeping only presses whose output is the key's base character.
 */
export class KeyObserver {
  /** Latest character seen per physical key; a change (user switched layout in the OS) overwrites it. */
  private readonly seen = new Map<string, { char: string; count: number }>();

  observe(e: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'getModifierState'>): void {
    if (!e.code || [...e.key].length !== 1) return; // "Dead", "Shift", "Enter", ...
    if (e.ctrlKey || e.altKey || e.metaKey || e.getModifierState('AltGraph')) return;
    const isLetter = e.key.toLowerCase() !== e.key.toUpperCase();
    // Shift (or Caps Lock) only changes a letter's case; for anything else it picks another character.
    if (e.shiftKey && !isLetter) return;
    const char = e.key.toLowerCase();
    const prev = this.seen.get(e.code);
    // Capped so one heavily used key cannot drown out the rest.
    this.seen.set(e.code, { char, count: prev?.char === char ? Math.min(prev.count + 1, MAX_COUNT) : 1 });
  }

  /** Pairs collected so far, each repeated by how often it was seen. */
  *observations(): Generator<[string, string]> {
    for (const [code, { char, count }] of this.seen) {
      for (let i = 0; i < count; i++) yield [code, char];
    }
  }

  get size(): number {
    return this.seen.size;
  }
}

/**
 * Asks the browser for the OS keyboard layout (Keyboard API, Chrome and
 * Edge only, needs https or localhost). Returns null where unsupported.
 */
export async function browserLayoutMap(): Promise<Map<string, string> | null> {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Iterable<[string, string]>> } }).keyboard;
  if (!kb?.getLayoutMap) return null;
  try {
    return new Map(await kb.getLayoutMap());
  } catch {
    return null; // e.g. blocked inside a cross-origin iframe
  }
}

/**
 * Decides which logged practice sessions carry the wrong layout tag, using
 * each session's own (code, actual) pairs as evidence. Returns the new
 * layout per session id; sessions that are fine are left out.
 *
 * - "evidence": only sessions whose keystrokes contradict their tag move,
 *   to `current` if it fits the evidence, else to the best match. Safe to
 *   run any time, since it never touches a session the evidence supports.
 * - "backfill": for keystrokes logged before layout detection existed, when
 *   every tag was the US placeholder. Any session `current` fits moves to
 *   it, including ones with no evidence either way.
 */
export function relabelPlan(
  events: readonly { sessionId: string; layout: string; code: string | null; actual: string }[],
  current: string,
  mode: 'evidence' | 'backfill',
): Map<string, string> {
  const sessions = new Map<string, { layout: string; pairs: [string, string][] }>();
  for (const e of events) {
    const s = sessions.get(e.sessionId) ?? { layout: e.layout, pairs: [] };
    if (e.code) s.pairs.push([e.code, e.actual]);
    sessions.set(e.sessionId, s);
  }

  const plan = new Map<string, string>();
  for (const [id, { layout, pairs }] of sessions) {
    const { candidates } = detectLayout(pairs);
    let target: string;
    if (candidates.length === 0) {
      if (mode === 'evidence') continue;
      target = current;
    } else if (mode === 'backfill' && candidates.includes(current)) {
      target = current;
    } else if (candidates.includes(layout)) {
      continue;
    } else {
      target = candidates.includes(current) ? current : candidates[0];
    }
    if (target !== layout) plan.set(id, target);
  }
  return plan;
}
