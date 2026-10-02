import { describe, expect, it } from 'vitest';
import { en } from './corpora/en';
import { CAPITALS, DEFAULT_DRILL_PARAMS, initialCurriculum, unlockSteps, type CurriculumState } from './drill';
import { learningPath, sessionPlan } from './path';

const CTX = { language: 'en', layout: 'qwerty-us' };
const base = initialCurriculum(en, CTX);
const steps = unlockSteps(en, CTX.layout);

describe('learningPath', () => {
  it('starts in the letters stage with everything else locked', () => {
    const path = learningPath(base, en, null);
    expect(path.stages.map((s) => s.id)).toEqual(['letters', 'capitals', 'punctuation', 'digits']);
    expect(path.stages[0]).toMatchObject({ state: 'current', done: base.unlocked.length, total: 26 });
    expect(path.stages.slice(1).every((s) => s.state === 'locked')).toBe(true);
    expect(path.next).toBe(steps[base.unlocked.length]);
    // Without a model nothing counts as ready yet.
    expect(path.ready).toBe(0);
    expect(path.sentencesOpen).toBe(false);
  });

  it('moves to capitals once all letters are unlocked, and opens sentences', () => {
    const letters = steps.filter((s) => /^\p{L}$/u.test(s));
    const s: CurriculumState = { ...base, unlocked: letters };
    const path = learningPath(s, en, null);
    expect(path.stages[0].state).toBe('done');
    expect(path.stages[1].state).toBe('current');
    expect(path.next).toBe(CAPITALS);
    expect(path.sentencesOpen).toBe(true);
  });

  it('reports everything done at the end', () => {
    const path = learningPath({ ...base, unlocked: steps }, en, null);
    expect(path.next).toBeNull();
    expect(path.stages.every((s) => s.state === 'done')).toBe(true);
  });
});

describe('sessionPlan', () => {
  const kinds = (plan: ReturnType<typeof sessionPlan>) => plan.map((p) => `${p.kind}:${p.state}`);
  const n = DEFAULT_DRILL_PARAMS.focusEvery;

  it('marks the current core drill in the round', () => {
    const plan = sessionPlan({ ...base, coreDrills: n + 1 }, 'core', { warmedUp: false, sentencesOpen: true });
    expect(kinds(plan)).toEqual(['core:done', 'core:current', 'core:upcoming', 'focus:upcoming', 'sentence:upcoming']);
  });

  it('shows the warm-up and a locked sentence drill', () => {
    const plan = sessionPlan({ ...base, coreDrills: 4 }, 'warmup', { warmedUp: true, sentencesOpen: false });
    expect(kinds(plan)).toEqual(['warmup:current', 'core:upcoming', 'core:upcoming', 'core:upcoming', 'focus:upcoming', 'sentence:locked']);
  });

  it('marks the cores done during the focus burst and the sentence drill', () => {
    const plan = sessionPlan({ ...base, coreDrills: n }, 'sentence', { warmedUp: true, sentencesOpen: true });
    expect(kinds(plan)).toEqual(['warmup:done', 'core:done', 'core:done', 'core:done', 'focus:done', 'sentence:current']);
  });
});
