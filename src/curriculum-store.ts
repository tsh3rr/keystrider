import type { CurriculumState } from './drill';
import type { PracticeContext } from './types';

/**
 * The drill generator's curriculum (unlocked keys, tier, pace), one per
 * language and layout, in localStorage. It is a few hundred bytes, unlike
 * the keystroke log, and can always be rebuilt from scratch.
 */

const key = (ctx: PracticeContext) => `typing-trainer.curriculum.${ctx.language}.${ctx.layout}`;

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

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
