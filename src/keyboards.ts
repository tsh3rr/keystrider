import type { KeystrokeEvent } from './types';

/**
 * Keyboard profiles: one per physical keyboard the learner practises on
 * (a laptop, a desk keyboard at home, one at work), so each gets its own
 * statistics. Off unless turned on in Settings.
 *
 * Browsers do not say which keyboard a key came from (WebHID could, but only
 * after a permission prompt per device), so the learner picks the keyboard;
 * a profile remembers its layout, and typing that looks like another
 * profile's layout suggests switching to it.
 *
 * Keystrokes carry the profile's id. Keystrokes without one (typed before
 * profiles were turned on, or while they were off) belong to the main
 * keyboard, which always exists and cannot be removed.
 *
 * The list of profiles is synced with the account; whether profiles are on
 * and which one is in use stay with each device, like the other settings.
 */

export const MAIN_KEYBOARD = 'main';
/** At most this many keyboards, removed ones not counted. */
export const MAX_KEYBOARDS = 8;
export const MAX_NAME_LENGTH = 40;
/**
 * Drills on a keyboard with fewer keystrokes than this (in the language and
 * layout being practised) adapt to every keyboard's history, so a new
 * keyboard does not start from nothing. Progress always shows its own.
 */
export const OWN_MODEL_MIN_KEYSTROKES = 300;

export interface KeyboardProfile {
  id: string;
  /** What the learner calls it; empty for the main keyboard until renamed (the app shows a default). */
  name: string;
  /** The layout last used on it; switching to it switches to this layout. */
  layout: string | null;
  created: number;
  /** Last change, for sync: the newer copy of a profile wins. */
  at: number;
  /** Removed, kept so the removal reaches the learner's other devices. */
  deleted?: true;
}

export type KeyboardList = Record<string, KeyboardProfile>;

export interface KeyboardSettings {
  enabled: boolean;
  active: string;
}

// Same 'typing-trainer.' prefix as every other key this app stores.
const LIST_KEY = 'typing-trainer.keyboards';
const SETTINGS_KEY = 'typing-trainer.keyboard';

export const keyboardOf = (e: Pick<KeystrokeEvent, 'keyboard'>): string => e.keyboard ?? MAIN_KEYBOARD;

/** The profiles in use, main keyboard first, then in the order they were added. */
export function visibleKeyboards(list: KeyboardList): KeyboardProfile[] {
  const main = list[MAIN_KEYBOARD] ?? mainKeyboard(0);
  const others = Object.values(list).filter((k) => k.id !== MAIN_KEYBOARD && !k.deleted);
  return [main, ...others.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))];
}

export function mainKeyboard(now: number, layout: string | null = null): KeyboardProfile {
  return { id: MAIN_KEYBOARD, name: '', layout, created: 0, at: now };
}

/**
 * The keystrokes typed on one keyboard; all of them when profiles are off
 * (`keyboard` null). With `fallbackBelow`, a keyboard with fewer keystrokes
 * than that gets everyone's.
 */
export function forKeyboard<T extends Pick<KeystrokeEvent, 'keyboard'>>(events: T[], keyboard: string | null, fallbackBelow = 0): T[] {
  if (keyboard === null) return events;
  const own = events.filter((e) => keyboardOf(e) === keyboard);
  return own.length < fallbackBelow ? events : own;
}

/** The keyboard in use: null while profiles are off; the main one if the picked one was removed. */
export function activeKeyboard(settings: KeyboardSettings, list: KeyboardList): string | null {
  if (!settings.enabled) return null;
  const k = list[settings.active];
  return k && !k.deleted ? k.id : MAIN_KEYBOARD;
}

/** Another keyboard set to this layout, to suggest when typing looks like it. */
export function keyboardWithLayout(list: KeyboardList, layout: string, except: string): KeyboardProfile | null {
  return visibleKeyboards(list).find((k) => k.id !== except && k.layout === layout) ?? null;
}

export function newKeyboardId(now: number = Date.now()): string {
  return `k${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Merges this device's profiles with the account's, the newer copy of each
 * winning (this device's on a tie). Returns the merged list, whether this
 * device's copy changed, and whether the account's is out of date.
 */
export function mergeKeyboards(local: KeyboardList, remote: KeyboardList): { merged: KeyboardList; localChanged: boolean; pushRemote: boolean } {
  const merged: KeyboardList = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[id];
    const r = valid(remote[id]) ? remote[id] : undefined;
    merged[id] = l && (!r || l.at >= r.at) ? l : r!;
  }
  const same = (a: KeyboardProfile | undefined, b: KeyboardProfile | undefined) => JSON.stringify(a) === JSON.stringify(b);
  return {
    merged,
    localChanged: Object.keys(merged).some((id) => !same(merged[id], local[id])),
    pushRemote: Object.keys(merged).some((id) => !same(merged[id], remote[id])),
  };
}

function valid(k: unknown): k is KeyboardProfile {
  const p = k as KeyboardProfile | undefined;
  return typeof p?.id === 'string' && typeof p.name === 'string' && typeof p.at === 'number' && typeof p.created === 'number';
}

export function loadKeyboards(storage: Storage | undefined = safeStorage()): KeyboardList {
  try {
    const raw = storage?.getItem(LIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as KeyboardList;
    return Object.fromEntries(Object.entries(parsed).filter(([id, k]) => valid(k) && k.id === id));
  } catch {
    return {};
  }
}

export function saveKeyboards(list: KeyboardList, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // Private mode or storage disabled: the profiles just won't persist.
  }
}

export function loadKeyboardSettings(storage: Storage | undefined = safeStorage()): KeyboardSettings {
  try {
    const parsed = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}') as Partial<KeyboardSettings>;
    return { enabled: parsed.enabled === true, active: typeof parsed.active === 'string' ? parsed.active : MAIN_KEYBOARD };
  } catch {
    return { enabled: false, active: MAIN_KEYBOARD };
  }
}

export function saveKeyboardSettings(settings: KeyboardSettings, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore, see saveKeyboards
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
