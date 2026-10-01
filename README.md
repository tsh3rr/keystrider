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

Every printable keypress on the practice screen is stored in IndexedDB (database `typing-trainer`, store `keystrokes`) with:

| field | meaning |
| --- | --- |
| `sessionId` | one practice text |
| `timestamp` | epoch ms |
| `position` | index in the target text |
| `expected` / `actual` | character required vs. typed |
| `prevExpected` | target character before this one (bigram context) |
| `prevActual` | key actually typed on the previous press |
| `latencyMs` | time since the previous keypress |
| `correct` | `expected === actual` |

A wrong key does not advance the cursor, so every error is followed by a correction event.

Inspect it on the **Keystroke log** tab (export JSON or CSV, or clear), in DevTools under Application → IndexedDB, or from the console with `await typingLog.all()`.
