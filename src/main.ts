import { TypingSession } from './session';
import { KeystrokeStore, toCsv } from './store';
import { DEFAULT_LANGUAGE, getCorpus, randomText } from './corpus';
import {
  KeyObserver, LAYOUTS, browserLayoutMap, detectLayout, getLayout, guessFromLocale, keyLabel, relabelPlan,
} from './layouts';
import { renderProgress, type Range } from './progressView';
import { backfillDone, loadLayoutSetting, markBackfillDone, saveLayoutSetting, type LayoutSetting } from './settings';
import type { KeystrokeEvent, PracticeContext } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const textEl = $('text');
const inputEl = $<HTMLTextAreaElement>('input');
const statsEl = $('stats');
const logRows = $('log-rows');
const logSummary = $('log-summary');

const LOG_TABLE_LIMIT = 500;

const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
// Until a key is pressed or the browser reports the layout, guess from the browser language.
let layoutSetting: LayoutSetting = loadLayoutSetting() ?? { layout: guessFromLocale(locales), source: 'guessed' };

// No language picker yet; English is the only corpus so far.
const context: PracticeContext = { language: DEFAULT_LANGUAGE, layout: layoutSetting.layout };

function newSession(): TypingSession {
  return new TypingSession(randomText(getCorpus(context.language)), context);
}

let session = newSession();
let store: KeystrokeStore;

function renderText(): void {
  const frag = document.createDocumentFragment();
  // Spread by code point so positions line up with TypingSession.position.
  [...session.text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch;
    if (i < session.position) span.className = 'typed';
    else if (i === session.position) span.className = 'current';
    frag.append(span);
  });
  textEl.replaceChildren(frag);
}

function renderStats(): void {
  const wpm = session.wpm().toFixed(0);
  const acc = (session.accuracy() * 100).toFixed(1);
  statsEl.textContent = session.done
    ? `Done: ${wpm} WPM, ${acc}% accuracy. Press Enter for new text.`
    : `${wpm} WPM · ${acc}% accuracy · ${session.errors} errors`;
}

function flashError(): void {
  const cur = textEl.querySelector('.current');
  cur?.classList.remove('error');
  void (cur as HTMLElement | null)?.offsetWidth; // restart animation
  cur?.classList.add('error');
}

function newText(): void {
  session = newSession();
  renderText();
  renderStats();
  inputEl.focus();
}

// Typing goes into a hidden textarea and is read from its `input` events
// rather than from `keydown`. That way the OS keyboard layout does the work:
// AltGr characters (ą, ż), dead-key compositions (é, ü), Mac Option
// characters and mobile keyboards all arrive as the text they produce.
// `keydown` is only used to remember which physical key was pressed last.
let lastCode: string | null = null;

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (session.done) newText();
    return;
  }
  // A dead key only starts a composition; the key that completes it is the one logged.
  if (e.key !== 'Dead') lastCode = e.code || null;
  observer.observe(e);
});

function handleChar(ch: string): void {
  const event = session.press(ch, Date.now(), lastCode);
  if (!event) return;
  store.add(event).catch((err) => console.error('Failed to log keystroke', err));
  if (!event.correct) flashError();
}

function flushInput(): void {
  const typed = inputEl.value;
  inputEl.value = '';
  if (!typed) return;
  for (const ch of typed.normalize('NFC')) handleChar(ch);
  lastCode = null;
  renderText();
  renderStats();
  checkObservedLayout();
}

inputEl.addEventListener('input', (e) => {
  // Mid-composition (dead key pressed, letter not yet typed): wait for the result.
  if ((e as InputEvent).isComposing) return;
  flushInput();
});
inputEl.addEventListener('compositionend', flushInput);
// Pasted or dropped text would be logged as keystrokes, so refuse it.
inputEl.addEventListener('paste', (e) => e.preventDefault());
inputEl.addEventListener('drop', (e) => e.preventDefault());
inputEl.addEventListener('focus', () => textEl.classList.add('focused'));
inputEl.addEventListener('blur', () => textEl.classList.remove('focused'));
textEl.addEventListener('click', () => inputEl.focus());

$('new-text').addEventListener('click', newText);

// --- Keyboard layout ---
//
// Three sources, strongest last: the browser language (a guess), the
// browser's Keyboard API (Chrome/Edge report the OS layout directly), and
// the keys the user actually presses (which physical key produced which
// character). The user can always override in the picker; after that,
// detection only suggests a switch instead of making it.

const layoutSelect = $<HTMLSelectElement>('layout-select');
const layoutStatus = $('layout-status');
const suggestBox = $('layout-suggest');
const observer = new KeyObserver();
let suggested: string | null = null;
/** Suggestions the user answered "Keep mine" to, so they are not asked again this visit. */
const declined = new Set<string>();

for (const l of LAYOUTS) layoutSelect.append(new Option(l.name, l.id));

const layoutName = (id: string) => getLayout(id)?.name ?? id;

function renderLayout(): void {
  layoutSelect.value = layoutSetting.layout;
  layoutStatus.textContent = {
    user: 'chosen by you',
    detected: 'detected from your keyboard',
    guessed: 'best guess so far; checked as you type',
  }[layoutSetting.source];
}

function showSuggestion(id: string | null): void {
  suggested = id;
  suggestBox.hidden = id === null;
  if (id !== null) {
    $('layout-suggest-text').textContent =
      `Your key presses look like ${layoutName(id)}, but the layout is set to ${layoutName(layoutSetting.layout)}.`;
  }
}

async function setLayout(layout: string, source: LayoutSetting['source']): Promise<void> {
  const changed = layout !== layoutSetting.layout;
  layoutSetting = { layout, source };
  saveLayoutSetting(layoutSetting);
  context.layout = layout;
  session.setLayout(layout);
  renderLayout();
  showSuggestion(null);
  if (changed) {
    // Keystrokes already logged in this text (and any earlier session whose own
    // keys contradict its tag) were recorded under the wrong layout: retag them.
    const plan = relabelPlan(await store.all(), layout, 'evidence');
    await store.relabelSessions(plan);
  }
  await backfillLegacyLog();
}

/**
 * Before layout detection, every keystroke was tagged US QWERTY whatever the
 * keyboard was. Once the layout is known (not just guessed), retag that old
 * history once. Sessions whose own keys prove a different layout keep it.
 */
async function backfillLegacyLog(): Promise<void> {
  if (layoutSetting.source === 'guessed' || backfillDone()) return;
  const plan = relabelPlan(await store.all(), layoutSetting.layout, 'backfill');
  await store.relabelSessions(plan);
  markBackfillDone();
}

function checkObservedLayout(): void {
  if (observer.size === 0) return;
  const d = detectLayout(observer.observations(), locales);
  // Nothing typed so far contradicts the current layout.
  if (!d.layout || d.candidates.includes(layoutSetting.layout)) return showSuggestion(null);
  if (layoutSetting.source === 'user') {
    if (!declined.has(d.layout) && suggested !== d.layout) showSuggestion(d.layout);
    return;
  }
  setLayout(d.layout, d.confidence === 'high' ? 'detected' : 'guessed').catch((err) =>
    console.error('Failed to update layout', err),
  );
}

async function detectFromBrowser(): Promise<void> {
  if (layoutSetting.source === 'user') return;
  const map = await browserLayoutMap();
  if (!map) return;
  const d = detectLayout(map, locales);
  // The Keyboard API reports the real OS layout; a tie only means layouts that share a base layer.
  if (d.layout) await setLayout(d.layout, 'detected');
}

layoutSelect.addEventListener('change', () => {
  setLayout(layoutSelect.value, 'user').catch((err) => console.error('Failed to update layout', err));
  inputEl.focus();
});
$('layout-suggest-yes').addEventListener('click', () => {
  if (suggested) setLayout(suggested, 'user').catch((err) => console.error('Failed to update layout', err));
  inputEl.focus();
});
$('layout-suggest-no').addEventListener('click', () => {
  if (suggested) declined.add(suggested);
  // Keeping the current layout is a confirmation of it.
  setLayout(layoutSetting.layout, 'user').catch((err) => console.error('Failed to update layout', err));
  inputEl.focus();
});

// --- Log inspector ---

function showChar(c: string | null): string {
  if (c === null) return '';
  return c === ' ' ? '␣' : c;
}

async function renderLog(): Promise<void> {
  const events = await store.all();
  const errors = events.filter((e) => !e.correct).length;
  const sessions = new Set(events.map((e) => e.sessionId)).size;
  logSummary.textContent =
    `${events.length} keystrokes · ${errors} errors · ${sessions} sessions` +
    (events.length > LOG_TABLE_LIMIT ? ` (showing latest ${LOG_TABLE_LIMIT})` : '');

  const frag = document.createDocumentFragment();
  for (const e of events.slice(-LOG_TABLE_LIMIT).reverse()) {
    const tr = document.createElement('tr');
    if (!e.correct) tr.className = 'wrong';
    const cells = [
      new Date(e.timestamp).toLocaleTimeString(),
      e.sessionId,
      `${e.language} · ${e.layout}`,
      String(e.position),
      showChar(e.expected),
      showChar(e.actual),
      e.code === null ? '' : keyLabel(e.layout, e.code),
      showChar(e.prevExpected),
      showChar(e.prevActual),
      e.latencyMs === null ? '' : String(e.latencyMs),
      e.correct ? '✓' : '✗',
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    // Key column shows the key as labelled on the layout; the raw physical code is in the tooltip.
    if (e.code) (tr.children[6] as HTMLElement).title = e.code;
    frag.append(tr);
  }
  logRows.replaceChildren(frag);
}

function download(name: string, type: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

$('export-json').addEventListener('click', async () => {
  download('keystrokes.json', 'application/json', JSON.stringify(await store.all(), null, 2));
});
$('export-csv').addEventListener('click', async () => {
  download('keystrokes.csv', 'text/csv', toCsv(await store.all()));
});
$('clear-log').addEventListener('click', async () => {
  if (!confirm('Delete all logged keystrokes?')) return;
  await store.clear();
  await renderLog();
});

// --- Progress ---

const progressRange = $<HTMLSelectElement>('progress-range');

function showProgress(): void {
  const v = progressRange.value;
  const range: Range = v === 'all' ? 'all' : (Number(v) as Range);
  renderProgress(store, context, range, layoutName(context.layout)).catch((err) =>
    console.error('Failed to render progress', err),
  );
}

progressRange.addEventListener('change', showProgress);

// --- Navigation ---

document.querySelectorAll<HTMLButtonElement>('nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b === btn));
    $('practice-view').hidden = view !== 'practice';
    $('log-view').hidden = view !== 'log';
    $('progress-view').hidden = view !== 'progress';
    if (view === 'log') renderLog();
    else if (view === 'progress') showProgress();
    else inputEl.focus();
  });
});

// Console access for ad-hoc inspection: `await typingLog.all()`
declare global {
  interface Window {
    typingLog: { all(): Promise<KeystrokeEvent[]>; count(): Promise<number> };
  }
}

KeystrokeStore.open().then((s) => {
  store = s;
  window.typingLog = { all: () => s.all(), count: () => s.count() };
  renderLayout();
  renderText();
  renderStats();
  inputEl.focus();
  detectFromBrowser()
    .then(backfillLegacyLog)
    .catch((err) => console.error('Layout detection failed', err));
});
