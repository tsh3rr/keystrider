import type { Corpus } from './corpus';

/**
 * Real sentences for sentence drills. A corpus may ship whole sentences with
 * capitals and punctuation; until the learner has those keys, a sentence is
 * typed in a simpler form: capitals lowered and punctuation at word edges
 * dropped. Sentences that cannot be simplified that way (a locked letter, a
 * digit, an apostrophe inside a word) are left out.
 */

const LETTER = /^\p{L}$/u;
const MARK = /^\p{M}$/u;

/**
 * The sentence as it would be typed with only `allowed` characters, or null
 * when it needs a key that is not unlocked. Pure and language-agnostic.
 */
export function practiceForm(sentence: string, allowed: ReadonlySet<string>): string | null {
  const chars = [...sentence.normalize('NFC')];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (allowed.has(c)) {
      out += c;
    } else if (/\s/u.test(c)) {
      out += ' ';
    } else if (LETTER.test(c) || MARK.test(c)) {
      const lower = c.toLowerCase();
      if (lower === c || !allowed.has(lower)) return null;
      out += lower;
    } else {
      // Punctuation between two letters is part of a word ("don't", "well-known"): dropping it would misspell the word.
      const inside = i > 0 && i < chars.length - 1 && LETTER.test(chars[i - 1]) && LETTER.test(chars[i + 1]);
      if (inside || /^\p{N}$/u.test(c)) return null;
    }
  }
  const text = out.replace(/ +/g, ' ').trim();
  return text.length > 0 ? text : null;
}

/**
 * The corpus' sentences in practice form for the given characters, without
 * duplicates. Sentences with a word the corpus blocks are dropped.
 */
export function eligibleSentences(corpus: Corpus, allowed: ReadonlySet<string>, blocked: (word: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of corpus.sentences ?? []) {
    const form = practiceForm(s, allowed);
    if (form === null || seen.has(form)) continue;
    seen.add(form);
    if (form.split(' ').some((w) => blocked(w.toLowerCase()))) continue;
    out.push(form);
  }
  return out;
}
