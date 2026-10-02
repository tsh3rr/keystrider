/**
 * Keyboard layout choice, kept in localStorage so it survives reloads.
 * Small and per-device, unlike the keystroke log, so IndexedDB is not needed.
 */
export interface LayoutSetting {
  layout: string;
  /**
   * "user": picked or confirmed by the user; detection only suggests changes.
   * "detected": the browser or observed keys identified it; may be updated by detection.
   * "guessed": from the browser language only; replaced as soon as keys tell us more.
   */
  source: 'user' | 'detected' | 'guessed';
}

const KEY = 'typing-trainer.layout';
/** Set once keystrokes logged before layout detection existed have been retagged. */
const BACKFILL_KEY = 'typing-trainer.layout-backfill-done';

export function loadLayoutSetting(storage: Storage | undefined = safeStorage()): LayoutSetting | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LayoutSetting>;
    if (typeof parsed.layout !== 'string') return null;
    const source = parsed.source === 'user' || parsed.source === 'detected' ? parsed.source : 'guessed';
    return { layout: parsed.layout, source };
  } catch {
    return null;
  }
}

export function saveLayoutSetting(setting: LayoutSetting, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(setting));
  } catch {
    // Private mode or storage disabled: the choice just won't persist.
  }
}

export function backfillDone(storage: Storage | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(BACKFILL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markBackfillDone(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(BACKFILL_KEY, '1');
  } catch {
    // ignore, see saveLayoutSetting
  }
}

const FINGER_GUIDE_KEY = 'typing-trainer.finger-guide';

/** Whether the on-screen finger guide is shown; on unless the user turned it off. */
export function loadFingerGuideSetting(storage: Storage | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(FINGER_GUIDE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveFingerGuideSetting(on: boolean, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(FINGER_GUIDE_KEY, on ? 'on' : 'off');
  } catch {
    // ignore, see saveLayoutSetting
  }
}

const GUIDE_FADE_KEY = 'typing-trainer.finger-guide-fade';

/** Whether the finger guide stays dim for keys the learner already knows; on unless turned off. */
export function loadGuideFadeSetting(storage: Storage | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(GUIDE_FADE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveGuideFadeSetting(on: boolean, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(GUIDE_FADE_KEY, on ? 'on' : 'off');
  } catch {
    // ignore, see saveLayoutSetting
  }
}

const WORD_FILTER_KEY = 'typing-trainer.word-filter';

/** Whether drills hide offensive words; on unless the user turned it off. */
export function loadWordFilterSetting(storage: Storage | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(WORD_FILTER_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveWordFilterSetting(on: boolean, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(WORD_FILTER_KEY, on ? 'on' : 'off');
  } catch {
    // ignore, see saveLayoutSetting
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const SHOW_KEYS_KEY = 'typing-trainer.show-keys';

/** Whether the row of all keys (unlocked and locked) is shown above the drill; off unless the user turned it on. */
export function loadShowKeysSetting(storage: Storage | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(SHOW_KEYS_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveShowKeysSetting(on: boolean, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(SHOW_KEYS_KEY, on ? 'on' : 'off');
  } catch {
    // ignore, see saveLayoutSetting
  }
}

const BREAK_REMINDERS_KEY = 'typing-trainer.break-reminders';

/** Whether the trainer suggests a break when typing gets worse or a stretch runs long; on unless turned off. */
export function loadBreakRemindersSetting(storage: Storage | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(BREAK_REMINDERS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveBreakRemindersSetting(on: boolean, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(BREAK_REMINDERS_KEY, on ? 'on' : 'off');
  } catch {
    // ignore, see saveLayoutSetting
  }
}

const LANGUAGE_KEY = 'typing-trainer.language';

/** The practice language the user picked, or null if they never picked one. */
export function loadLanguageSetting(storage: Storage | undefined = safeStorage()): string | null {
  try {
    return storage?.getItem(LANGUAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveLanguageSetting(language: string, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(LANGUAGE_KEY, language);
  } catch {
    // ignore, see saveLayoutSetting
  }
}

export type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'typing-trainer.theme';

/** Light, dark, or following the system setting (the default). */
export function loadThemeSetting(storage: Storage | undefined = safeStorage()): Theme {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemeSetting(theme: Theme, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // ignore, see saveLayoutSetting
  }
}
