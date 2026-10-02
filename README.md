# Typing Trainer

A touch-typing trainer that analyzes your errors and weak keys and adapts practice to make you faster.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # typecheck + production build into dist/
```

Static app (TypeScript + Vite). No backend: all data stays in the browser.

## Keystroke log

Every typed character on the practice screen is stored in IndexedDB (database `typing-trainer`, store `keystrokes`) with:

| field | meaning |
| --- | --- |
| `sessionId` | one practice text |
| `language` | language of the practice text (BCP 47, e.g. `en`) |
| `layout` | keyboard layout the user typed on (e.g. `qwertz-de`, see below) |
| `timestamp` | epoch ms |
| `position` | index in the target text (Unicode code points) |
| `expected` / `actual` | character required vs. typed (NFC-normalized) |
| `code` | physical key that produced `actual` (`KeyboardEvent.code`; named after the US position, so `y` on a German keyboard is `KeyZ`) |
| `prevExpected` | target character before this one (bigram context) |
| `prevActual` | key actually typed on the previous press |
| `latencyMs` | time since the previous keypress |
| `correct` | `expected === actual` |

A wrong key does not advance the cursor, so every error is followed by a correction event.

Input is read from what the OS keyboard layout produces, not from raw key names, so AltGr characters (ą, ż), dead-key compositions (é, ü) and Mac Option characters count as normal keystrokes. Analysis should always filter by `language` and `layout` (`KeystrokeStore.forLanguage`) so stats from different languages never mix.

## Keyboard layouts

The practice screen has a **Keyboard layout** picker. The layout is found automatically, strongest source last:

1. a guess from the browser language (`de-DE` → German QWERTZ),
2. the browser's Keyboard API (`navigator.keyboard.getLayoutMap()`, Chrome and Edge on https or localhost), which reports the OS layout directly,
3. the keys you actually press: each keydown says which physical key produced which character, and that is matched against the known layouts (`src/layouts.ts`).

Picking a layout yourself wins; after that, detection only offers a switch. The choice is saved in localStorage.

When the layout changes, keystrokes already logged under the wrong one are retagged per practice session, using that session's own key/character pairs as evidence. History logged before detection existed (always tagged `qwerty-us`) is retagged to your layout once it is known, except sessions whose keys prove they were typed on another layout. The characters themselves were always recorded correctly; only the layout tag was a placeholder.

Layouts tied on their base layer (US vs. Polish Programmers, or German vs. Swiss when only letters were typed) are told apart by browser language, and the picker fixes any wrong pick.

## Weakness model

`src/weakness.ts` turns the keystroke log into per-key and per-bigram stats and a ranked list of what to practise next, following the "Weakness Model Design" doc.

```ts
const model = await loadWeaknessModel(store, { language: 'en', layout: 'qwertz-de' });
model.baseline;   // overall error rate, typical latency, WPM
model.keys;       // KeyStats[], highest priority first (char, code, layout label, confusions)
model.bigrams;    // BigramStats[], highest priority first
model.ranked;     // both together
pickFocusItems(model, { count: 5 });   // softmax-sampled focus items for the next drill
```

Each item carries a shrunk error rate, typical latency, review half-life, the four need components (errors, slowness, review, exploration), `need` and `priority`. Only the first press at each position counts; latency skips pauses over 2 s, the first key of a drill and keys typed right after a correction. Pass `now` to rebuild the model as it was at an earlier time, and `includeKeys` / `includeBigrams` to score items not typed yet. Parameters live in `DEFAULT_WEAKNESS_PARAMS`.

## Languages

Practice text comes from a per-language `Corpus` (`src/corpus.ts`). Only English exists so far; adding a language means adding a file under `src/corpora/` and registering it.

Inspect it on the **Keystroke log** tab (export JSON or CSV, or clear), in DevTools under Application → IndexedDB, or from the console with `await typingLog.all()`.

## Warm-ups and sentence drills

A practice session is the drills you type without a break of 30 minutes or more. Once you have typed a few core drills, each session opens with a short **warm-up**: items due for review (by the weakness model's review half-life) in easy, common words. It is typed cold, so it changes neither pace, level nor unlocks.

Once 20 letters are unlocked, every focus burst is followed by a **sentence drill**: real sentences picked by the same weakness score as other drills. Until capitals and punctuation are unlocked, sentences are typed lowercase without punctuation; sentences that need a locked letter, a digit, or an apostrophe or hyphen inside a word wait until those keys are unlocked. Sentence drills move pace but not unlocks or level. Code: `src/sentences.ts` and `nextKind` / `nextDrill` in `src/drill.ts`.

### Sentence lists

A corpus lists its sentences in `src/corpora/<lang>-sentences.ts`. English ships with about 200 short sentences written for this project (same license as the code).

`scripts/build-sentences.py` replaces that file with a larger set from [Tatoeba](https://tatoeba.org): short sentences whose words are all common (by wordfreq), without names, and checked against the offensive-word list when `naughty-words` is installed. **License:** Tatoeba sentences are [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/), so a generated file is under that license, with the attribution in its header and each sentence's Tatoeba id next to it. To run it (Windows cmd or PowerShell, Python 3 installed):

```sh
py -m pip install "wordfreq==3.1.1"
py scripts\build-sentences.py en 2000
```

On macOS/Linux use `python3` and `scripts/build-sentences.py`. Another language needs its alphabet in `LETTERS` and its Tatoeba code in `TATOEBA_CODES`.

## Deployment

The app is static, so any static host can serve the `dist` folder.

- Build command: `npm run build`
- Output folder: `dist`
- Node version: 22 (pinned in `.nvmrc`)

Production deploys from `main`; each pull request gets its own preview deploy for testing.
GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests and build on every pull request.
