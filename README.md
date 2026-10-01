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
| `layout` | keyboard layout id (e.g. `qwerty-us`) |
| `timestamp` | epoch ms |
| `position` | index in the target text (Unicode code points) |
| `expected` / `actual` | character required vs. typed (NFC-normalized) |
| `code` | physical key that produced `actual` (`KeyboardEvent.code`, layout-independent) |
| `prevExpected` | target character before this one (bigram context) |
| `prevActual` | key actually typed on the previous press |
| `latencyMs` | time since the previous keypress |
| `correct` | `expected === actual` |

A wrong key does not advance the cursor, so every error is followed by a correction event.

Input is read from what the OS keyboard layout produces, not from raw key names, so AltGr characters (ą, ż), dead-key compositions (é, ü) and Mac Option characters count as normal keystrokes. Analysis should always filter by `language` and `layout` (`KeystrokeStore.forLanguage`) so stats from different languages never mix.

## Languages

Practice text comes from a per-language `Corpus` (`src/corpus.ts`). Only English exists so far; adding a language means adding a file under `src/corpora/` and registering it.

Inspect it on the **Keystroke log** tab (export JSON or CSV, or clear), in DevTools under Application → IndexedDB, or from the console with `await typingLog.all()`.
