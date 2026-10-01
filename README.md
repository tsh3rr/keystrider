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

## Languages

Practice text comes from a per-language `Corpus` (`src/corpus.ts`). Only English exists so far; adding a language means adding a file under `src/corpora/` and registering it.

Inspect it on the **Keystroke log** tab (export JSON or CSV, or clear), in DevTools under Application → IndexedDB, or from the console with `await typingLog.all()`.
