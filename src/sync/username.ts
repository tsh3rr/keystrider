import { blockList, isBlocked } from '../wordfilter';

/** 3 to 20 letters (any script), digits, ".", "_" or "-"; the database checks a looser version of the same. */
const PATTERN = /^[\p{L}\p{N}_.-]{3,20}$/u;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export type UsernameProblem = 'invalid' | 'blocked';

/** What is wrong with a username, or null if it can be used. Offensive names are checked in English and the interface language. */
export function usernameProblem(name: string, language: string): UsernameProblem | null {
  if (!PATTERN.test(name)) return 'invalid';
  const languages = new Set(['en', language]);
  for (const lang of languages) if (isBlocked(name, blockList(lang))) return 'blocked';
  return null;
}
