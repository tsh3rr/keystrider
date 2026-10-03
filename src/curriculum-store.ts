import type { CurriculumState } from './drill';
import type { PracticeContext } from './types';

/**
 * The drill generator's curriculum (unlocked keys, tier, pace), one per
 * language and layout, in localStorage. It is a few hundred bytes, unlike
 * the keystroke log, and can always be rebuilt from scratch.
 */

const PREFIX = 'typing-trainer.curriculum.';
const key = (ctx: PracticeContext) => `${PREFIX}${ctx.language}.${ctx.layout}`;

export function loadCurriculum(ctx: PracticeContext, storage: Storage | undefined = safeStorage()): CurriculumState | null {
  try {
    const raw = storage?.getItem(key(ctx));
    if (!raw) return null;
    const s = JSON.parse(raw) as CurriculumState;
    if (s.version !== 1 || !Array.isArray(s.unlocked) || s.language !== ctx.language || s.layout !== ctx.layout) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveCurriculum(state: CurriculumState, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(key(state), JSON.stringify(state));
  } catch {
    // Private mode or storage disabled: progress just won't persist.
  }
}

export function clearCurriculum(ctx: PracticeContext, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(key(ctx));
  } catch {
    // ignore, see saveCurriculum
  }
}

/** Whether any curriculum is saved, i.e. this browser has practised before. */
export function hasAnyCurriculum(storage: Storage | undefined = safeStorage()): boolean {
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) if (storage?.key(i)?.startsWith(PREFIX)) return true;
    return false;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Every saved curriculum, keyed "language.layout". */
export function allCurricula(storage: Storage | undefined = safeStorage()): Record<string, CurriculumState> {
  const out: Record<string, CurriculumState> = {};
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const k = storage?.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const [language, ...rest] = k.slice(PREFIX.length).split('.');
      const state = loadCurriculum({ language, layout: rest.join('.') }, storage);
      if (state) out[`${state.language}.${state.layout}`] = state;
    }
  } catch {
    // storage blocked: nothing saved
  }
  return out;
}
