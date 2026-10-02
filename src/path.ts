import type { Corpus } from './corpus';
import {
  CAPITALS, DEFAULT_DRILL_PARAMS, blockingKeys, sentencesReady, unlockSteps,
  type CurriculumState, type DrillKind, type DrillParams,
} from './drill';
import type { WeaknessModel } from './weakness';

/**
 * Where the learner is, for display only: the stages of the unlock ladder,
 * what the next unlock waits on, and the rhythm of drills in a session.
 * Reads the curriculum; never changes it.
 */

export type StageId = 'letters' | 'capitals' | 'punctuation' | 'digits';

export interface Stage {
  id: StageId;
  /** Steps unlocked in this stage, and how many it has. */
  done: number;
  total: number;
  state: 'done' | 'current' | 'locked';
}

export interface PathSummary {
  stages: Stage[];
  /** The step that unlocks next, or null when everything is unlocked. */
  next: string | null;
  /** Unlocked steps that already meet the unlock bar, of all unlocked steps. */
  ready: number;
  unlocked: number;
  /** Unlocked steps still below the bar, in unlock order. */
  blocking: string[];
  /** Letters unlocked, and how many sentence drills need. */
  letters: number;
  sentenceLetters: number;
  sentencesOpen: boolean;
}

const isLetter = (c: string) => /^\p{L}$/u.test(c);
const isDigit = (c: string) => /^\p{Nd}$/u.test(c);

function stageOf(step: string): StageId {
  if (step === CAPITALS) return 'capitals';
  if (isLetter(step)) return 'letters';
  if (isDigit(step)) return 'digits';
  return 'punctuation';
}

export function learningPath(
  state: CurriculumState,
  corpus: Corpus,
  model: WeaknessModel | null,
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): PathSummary {
  const steps = unlockSteps(corpus, state.layout);
  const unlocked = new Set(state.unlocked);
  const next = steps.find((s) => !unlocked.has(s)) ?? null;
  const ids: StageId[] = ['letters', 'capitals', 'punctuation', 'digits'];
  const current = next === null ? null : stageOf(next);
  const stages = ids
    .map((id) => {
      const inStage = steps.filter((s) => stageOf(s) === id);
      const done = inStage.filter((s) => unlocked.has(s)).length;
      return { id, done, total: inStage.length };
    })
    .filter((s) => s.total > 0)
    .map((s): Stage => ({
      ...s,
      state: s.done === s.total ? 'done' : s.id === current ? 'current' : 'locked',
    }));
  const blocking = model ? blockingKeys(model, state, p) : [...state.unlocked];
  const letters = state.unlocked.filter(isLetter).length;
  return {
    stages,
    next,
    ready: state.unlocked.length - blocking.length,
    unlocked: state.unlocked.length,
    blocking,
    letters,
    sentenceLetters: p.sentenceMinLetters,
    sentencesOpen: sentencesReady(state, corpus, p),
  };
}

export interface PlanStep {
  kind: DrillKind;
  state: 'done' | 'current' | 'upcoming' | 'locked';
}

/**
 * The drills of the current round, in order: the warm-up if this session
 * had one, `focusEvery` core drills, a focus burst, then a sentence drill
 * (locked until sentences open). Mirrors `nextKind`.
 */
export function sessionPlan(
  state: CurriculumState,
  current: DrillKind,
  opts: { warmedUp: boolean; sentencesOpen: boolean },
  p: DrillParams = DEFAULT_DRILL_PARAMS,
): PlanStep[] {
  const round: DrillKind[] = [
    ...(opts.warmedUp || current === 'warmup' ? ['warmup' as const] : []),
    ...Array.from({ length: p.focusEvery }, () => 'core' as const),
    'focus',
    'sentence',
  ];
  // Index of the current drill in the round.
  const coresDone = state.coreDrills % p.focusEvery;
  const firstCore = round.indexOf('core');
  const at =
    current === 'warmup' ? 0
    : current === 'core' ? firstCore + coresDone
    : current === 'focus' ? round.indexOf('focus')
    : round.indexOf('sentence');
  return round.map((kind, i) => ({
    kind,
    state: kind === 'sentence' && !opts.sentencesOpen ? 'locked' : i < at ? 'done' : i === at ? 'current' : 'upcoming',
  }));
}
