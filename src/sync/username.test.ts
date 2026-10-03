import { describe, expect, it } from 'vitest';
import { blockList } from '../wordfilter';
import { usernameProblem } from './username';

describe('usernameProblem', () => {
  it('accepts letters of any script, digits and . _ -', () => {
    for (const name of ['anna', 'Jürgen_1', 'Łukasz.K', 'Zoë-92']) expect(usernameProblem(name, 'de')).toBeNull();
  });

  it('rejects names that are too short, too long or contain other characters', () => {
    for (const name of ['ab', 'a'.repeat(21), 'two words', 'name@mail', 'a/b', '']) expect(usernameProblem(name, 'en')).toBe('invalid');
  });

  it('rejects names containing a blocked term', () => {
    // A term from the list itself, never written out here.
    const term = blockList('en').substrings.find((t) => /^[a-z]{4,10}$/.test(t))!;
    expect(usernameProblem(`x${term}1`, 'de')).toBe('blocked');
  });
});
