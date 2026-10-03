#!/usr/bin/env python3
"""Regenerate a frequency-ranked word list for one language.

Usage (from the repo root):
    python -m pip install "wordfreq==3.1.1" "pyspellchecker==0.9.0"
    python scripts/build-corpus.py en 10000
    python scripts/build-corpus.py de 10000
    (likewise fr, es, it, pl)

Writes src/corpora/<lang>-words.ts. The word data comes from wordfreq
(https://github.com/rspeer/wordfreq), whose word lists are licensed under
CC BY-SA 4.0, so the generated file is too (see its header).

wordfreq folds German "ß" to "ss" and keeps stray English words and names, so
for German each word is checked against pyspellchecker's German frequency list
(https://github.com/barrust/pyspellchecker, from OpenSubtitles via
https://github.com/hermitdave/FrequencyWords): the spelling it uses most
("straße", but "dass") is kept, and words it doesn't know are dropped.
French and Italian words are checked against pyspellchecker's lists the same
way (spelling unchanged), which drops names and stray English. Its Spanish list
misses common words, so Spanish and Polish (which it lacks) instead drop words
wordfreq finds more often in English than in the language itself.
pyspellchecker is only needed for German, French and Italian.
"""

import itertools
import re
import sys
from importlib.metadata import version
from pathlib import Path

import wordfreq

# Letters a language's practice words may use. Words with digits, apostrophes,
# hyphens or other letters are left out until those keys are drilled.
LETTERS = {
    "en": "abcdefghijklmnopqrstuvwxyz",
    "de": "abcdefghijklmnopqrstuvwxyzäöüß",
    "fr": "abcdefghijklmnopqrstuvwxyzàâæçéèêëîïôœùûüÿ",
    "es": "abcdefghijklmnopqrstuvwxyzáéíóúüñ",
    # í, ó and ú only turn up in loanwords and names.
    "it": "abcdefghijklmnopqrstuvwxyzàèéìòù",
    "pl": "abcdefghijklmnopqrstuvwxyząćęłńóśźż",
}

# Languages whose words are checked against pyspellchecker (see the docstring).
SPELLCHECK = {"de", "fr", "it"}

# Languages whose words are dropped when wordfreq finds them more often in English.
NOT_ENGLISH = {"es", "pl"}

# One-letter tokens that are real words; others ("s", "t", "m") come from
# split contractions and abbreviations.
SINGLE_LETTER_WORDS = {
    "en": {"a", "i"},
    "de": set(),
    "fr": {"a", "à", "y"},
    "es": {"a", "e", "o", "u", "y"},
    "it": {"a", "e", "è", "i", "o"},
    "pl": {"a", "i", "o", "u", "w", "z"},
}

LINE_WIDTH = 100

SPELLCHECK_NOTE = """
// The choice of words checked against pyspellchecker's word
// frequencies (https://github.com/barrust/pyspellchecker), built from OpenSubtitles 2018
// by Hermit Dave (https://github.com/hermitdave/FrequencyWords, CC BY-SA 4.0)."""


def spelling_fixer(lang: str):
    """Maps a wordfreq word to its usual spelling, or None to drop it; identity if not needed."""
    if lang in NOT_ENGLISH:
        return lambda w: w if wordfreq.zipf_frequency(w, "en") <= wordfreq.zipf_frequency(w, lang) else None
    if lang not in SPELLCHECK:
        return lambda w: w
    from spellchecker import SpellChecker

    freq = SpellChecker(language=lang).word_frequency

    if lang != "de":
        return lambda w: w if freq[w] > 0 else None

    def fix(w: str) -> str | None:
        # Every way of writing each "ss" as "ss" or "ß"; keep the most used one.
        parts = w.split("ss")
        variants = [
            "".join(p + s for p, s in zip(parts, [*joins, ""]))
            for joins in itertools.product(["ss", "ß"], repeat=len(parts) - 1)
        ]
        best = max(variants, key=lambda v: freq[v])
        return best if freq[best] > 0 else None

    return fix


def build(lang: str, count: int) -> list[str]:
    allowed = re.compile(f"^[{LETTERS[lang]}]+$")
    singles = SINGLE_LETTER_WORDS.get(lang, set())
    fix = spelling_fixer(lang)
    words: list[str] = []
    seen: set[str] = set()
    # Ask for extra so filtering still leaves `count` words.
    for raw in wordfreq.top_n_list(lang, count * 3, wordlist="best"):
        w = fix(raw) if allowed.match(raw) else None
        if w is None or (len(w) == 1 and w not in singles) or w in seen:
            continue
        seen.add(w)
        words.append(w)
        if len(words) == count:
            return words
    raise SystemExit(f"only {len(words)} words found for {lang}")


def note(lang: str) -> str:
    if lang == "de":
        return SPELLCHECK_NOTE.replace("The choice of words", '"ss"/"ß" spelling and the choice of words')
    if lang in SPELLCHECK:
        return SPELLCHECK_NOTE
    if lang in NOT_ENGLISH:
        return "\n// Words wordfreq finds more often in English than in this language are left out."
    return ""


def render(lang: str, words: list[str]) -> str:
    lines: list[str] = []
    line = ""
    for w in words:
        if line and len(line) + 1 + len(w) > LINE_WIDTH:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}" if line else w
    lines.append(line)
    body = "\n".join(lines)
    return f"""// GENERATED by scripts/build-corpus.py, do not edit by hand.
// Regenerate: python scripts/build-corpus.py {lang} {len(words)}
//
// The {len(words)} most frequent {lang} words, most frequent first, from wordfreq {version('wordfreq')}
// (https://github.com/rspeer/wordfreq, "best" list), keeping only plain lowercase letters.{note(lang)}
//
// License: wordfreq's word list data is redistributable under CC BY-SA 4.0
// (https://creativecommons.org/licenses/by-sa/4.0/); this file is a derived work
// under the same license. wordfreq by Robyn Speer, built on data from Google Books
// Ngrams (http://books.google.com/ngrams), Wikipedia, the Leeds Internet Corpus,
// ParaCrawl, OPUS OpenSubtitles 2018 (http://www.opensubtitles.org/) and the SUBTLEX
// word lists by Marc Brysbaert et al., which are freely available data
// (http://crr.ugent.be/programs-data/subtitle-frequencies).

export default `
{body}
`;
"""


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    lang, count = sys.argv[1], int(sys.argv[2])
    if lang not in LETTERS:
        raise SystemExit(f"add the {lang} alphabet to LETTERS first")
    out = Path(__file__).resolve().parent.parent / "src" / "corpora" / f"{lang}-words.ts"
    out.write_text(render(lang, build(lang, count)), encoding="utf-8", newline="\n")
    print(f"wrote {count} words to {out}")


if __name__ == "__main__":
    main()
