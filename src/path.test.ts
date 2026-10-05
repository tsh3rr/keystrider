import { describe, expect, it } from 'vitest';
import { en } from './corpora/en';
import { CAPITALS, DEFAULT_DRILL_PARAMS, initialCurriculum, tierTargetMs, unlockSteps, type CurriculumState } from './drill';
import { learningPath, sessionPlan } from './path';
import type { WeaknessModel } from './weakness';

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

describe('learningPath gaps', () => {
  const fast = tierTargetMs(base.tier) * 0.5;
  const model = (over: Record<string, { weight?: number; errorRate?: number; latencyMs?: number }>) => ({
    keys: base.unlocked.map((item) => ({ item, weight: 100, errorRate: 0.01, latencyMs: fast, ...over[item] })),
  }) as unknown as WeaknessModel;

  it('names why each blocking key holds up the unlock, errors first', () => {
    const [a, b, c, d] = base.unlocked;
    const path = learningPath(base, en, model({
      [a]: { latencyMs: tierTargetMs(base.tier) * 2 },
      [b]: { errorRate: 0.05 },
      [c]: { weight: 5 },
      [d]: { errorRate: 0.12 },
    }));
    expect(path.blocking).toHaveLength(4);
    expect(path.gaps.map((g) => [g.step, g.reason])).toEqual([[d, 'errors'], [b, 'errors'], [a, 'slow'], [c, 'few']]);
    expect(path.gaps[0].errorRate).toBe(0.12);
    expect(path.gaps[2].targetMs).toBe(tierTargetMs(base.tier));
  });

  it('has no gaps when every key meets the bar', () => {
    const path = learningPath(base, en, model({}));
    expect(path.blocking).toEqual([]);
    expect(path.gaps).toEqual([]);
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
