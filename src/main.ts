import { TypingSession } from './session';
import { KeystrokeStore, toCsv } from './store';
import type { KeystrokeEvent } from './types';
import { randomText } from './words';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const textEl = $('text');
const statsEl = $('stats');
const logRows = $('log-rows');
const logSummary = $('log-summary');

const LOG_TABLE_LIMIT = 500;

let session = new TypingSession(randomText());
let store: KeystrokeStore;

function renderText(): void {
  const frag = document.createDocumentFragment();
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
  session = new TypingSession(randomText());
  renderText();
  renderStats();
  textEl.focus();
}

textEl.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (session.done) {
    if (e.key === 'Enter') newText();
    return;
  }
  // Only printable characters count as keystrokes; ignore Shift, Tab, etc.
  if (e.key.length !== 1) return;
  e.preventDefault();

  const event = session.press(e.key);
  if (!event) return;
  store.add(event).catch((err) => console.error('Failed to log keystroke', err));
  if (!event.correct) flashError();
  renderText();
  renderStats();
});

$('new-text').addEventListener('click', newText);

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
      String(e.position),
      showChar(e.expected),
      showChar(e.actual),
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

// --- Navigation ---

document.querySelectorAll<HTMLButtonElement>('nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b === btn));
    $('practice-view').hidden = view !== 'practice';
    $('log-view').hidden = view !== 'log';
    if (view === 'log') renderLog();
    else textEl.focus();
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
  renderText();
  renderStats();
  textEl.focus();
});
