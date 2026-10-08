import '@fontsource-variable/jetbrains-mono';
import { PLACEMENT_WORDS, canSkipAhead, saveLandingTest, wordsTyped } from '../handoff';
import { KeyObserver, detectLayout, guessFromLocale } from '../layouts';
import { TypingSession } from '../session';
import { loadThemeSetting } from '../settings';
import type { KeystrokeEvent } from '../types';
import type { LandingCopy, LandingLanguage } from './content';

/**
 * The typing line in the landing page's hero. It is the start of the
 * trainer's placement test: typed with the trainer's own TypingSession (a
 * wrong key holds you on the letter), with the layout recognised from the
 * keys pressed. At the end it shows speed, accuracy and the keys that held
 * the learner up, and says what comes next in the trainer: lesson 1, or the
 * rest of the placement test for whoever can skip ahead. The keystrokes are
 * handed over (handoff.ts) so the trainer carries on from here.
 */

type Demo = LandingCopy['demo'] & { app: string; lang: LandingLanguage };

const theme = loadThemeSetting();
if (theme !== 'system') document.documentElement.dataset.theme = theme;

const demo = JSON.parse(document.getElementById('lp-data')!.textContent!) as Demo;
const box = document.getElementById('lp-demo')!;
const textEl = document.getElementById('lp-text')!;
const input = document.getElementById('lp-input') as HTMLTextAreaElement;
const startPill = document.getElementById('lp-start')!;
const stats = document.getElementById('lp-stats')!;
const result = document.getElementById('lp-result')!;

const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
const guessedLayout = guessFromLocale(browserLocales);

let session: TypingSession;
let events: KeystrokeEvent[] = [];
let observer = new KeyObserver();
let chars: HTMLSpanElement[] = [];
let lastCode: string | null = null;
let lineIndex = Math.floor(Math.random() * demo.lines.length);

function reset(): void {
  const line = demo.lines[lineIndex % demo.lines.length];
  session = new TypingSession(line, { language: demo.lang, layout: guessedLayout });
  events = [];
  observer = new KeyObserver();
  chars = [...session.text].map((ch) => {
    const s = document.createElement('span');
    s.textContent = ch;
    if (ch === ' ') s.className = 'sp';
    return s;
  });
  textEl.replaceChildren(...chars);
  chars[0].classList.add('current');
  stats.textContent = '';
  result.hidden = true;
  textEl.hidden = false;
  showPill();
}

function showPill(): void {
  startPill.hidden = document.activeElement === input || !result.hidden;
  textEl.classList.toggle('focused', document.activeElement === input);
}

/** Speed and accuracy as the trainer counts them (drillResult in drill.ts). */
function score(): { wpm: number; accuracy: number } {
  const correct = events.filter((e) => e.correct);
  const span = correct.length ? correct.at(-1)!.timestamp - events[0].timestamp : 0;
  const firstTries = new Map<number, boolean>();
  for (const e of events) if (!firstTries.has(e.position)) firstTries.set(e.position, e.correct);
  const right = [...firstTries.values()].filter(Boolean).length;
  return {
    wpm: span > 0 ? Math.max(correct.length - 1, 0) / 5 / (span / 60_000) : 0,
    accuracy: firstTries.size ? right / firstTries.size : 1,
  };
}

function type(ch: string): void {
  const before = session.position;
  const ev = session.press(ch, Date.now(), lastCode);
  if (!ev) return;
  events.push(ev);
  const span = chars[before];
  if (ev.correct) {
    span.classList.remove('current', 'error');
    span.classList.add('typed');
    chars[session.position]?.classList.add('current');
  } else {
    span.classList.remove('error');
    void span.offsetWidth; // restart the shake
    span.classList.add('error');
  }
  if (session.position >= 5) {
    const { wpm, accuracy } = score();
    stats.textContent = `${Math.round(wpm)} ${demo.wpm} · ${Math.round(accuracy * 100)} %`;
  }
  if (session.done) finish();
}

/**
 * The keys that cost the most: a wrong press counts as much as a slow one.
 * A key is slow when it took clearly longer than the learner's usual key.
 */
function slowKeys(): string[] {
  const times = new Map<string, number[]>();
  const misses = new Map<string, number>();
  let wrongBefore = false;
  for (const e of events) {
    if (!e.correct) {
      if (e.expected !== ' ') misses.set(e.expected, (misses.get(e.expected) ?? 0) + 1);
      wrongBefore = true;
    } else {
      // Only clean presses tell how long a key takes; the first key only starts the clock.
      if (!wrongBefore && e.latencyMs !== null && e.expected !== ' ') times.set(e.expected, [...(times.get(e.expected) ?? []), e.latencyMs]);
      wrongBefore = false;
    }
  }
  const all = [...times.values()].flat().sort((a, b) => a - b);
  const median = all.length ? all[Math.floor(all.length / 2)] : 0;
  const cost = new Map<string, number>();
  for (const [ch, ts] of times) {
    const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
    if (median > 0 && avg > median * 1.4) cost.set(ch, avg / median);
  }
  for (const [ch, n] of misses) cost.set(ch, (cost.get(ch) ?? 1) + n);
  return [...cost].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([ch]) => ch);
}

/** Hands the line to the trainer, under the layout the keys showed if they did. */
function handOver(): void {
  const d = detectLayout(observer.observations(), browserLocales);
  const detected = d.layout !== null && d.confidence === 'high';
  const layout = detected ? d.layout! : guessedLayout;
  saveLandingTest({
    language: demo.lang,
    layout,
    layoutSource: detected ? 'detected' : 'guessed',
    events: events.map((e) => ({ ...e, layout })),
    savedAt: Date.now(),
  });
}

function finish(): void {
  handOver();
  const { wpm, accuracy } = score();
  const fast = canSkipAhead(wpm, accuracy);
  const slow = slowKeys();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) =>
    Object.assign(document.createElement(tag), { className: cls }, text === undefined ? {} : { textContent: text });
  const big = (value: string, label: string) => {
    const d = el('div', 'lp-big');
    d.append(el('strong', '', value), el('span', '', label));
    return d;
  };
  const numbers = el('div', 'lp-numbers');
  numbers.append(big(String(Math.round(wpm)), demo.wpm), big(`${Math.round(accuracy * 100)} %`, demo.accuracy));

  const weak = el('p', 'lp-weak');
  if (slow.length) weak.append(demo.slowTitle, ' ', ...slow.map((ch) => el('kbd', '', ch)));
  else weak.textContent = demo.slowNone;

  const left = PLACEMENT_WORDS - wordsTyped(events);
  const next = el('p', 'lp-next', fast ? demo.nextFast.replace('{n}', String(left)) : demo.nextBeginner);

  const actions = el('div', 'lp-actions');
  const go = Object.assign(el('a', 'lp-btn', `${fast ? demo.ctaFast : demo.ctaBeginner} →`), { href: demo.app });
  const again = Object.assign(el('button', 'link-btn', demo.again), { type: 'button' });
  again.addEventListener('click', () => {
    lineIndex++;
    reset();
    input.focus();
  });
  actions.append(go, again);

  result.replaceChildren(numbers, weak, next, actions);
  textEl.hidden = true;
  stats.textContent = '';
  result.hidden = false;
  input.blur();
  showPill();
  go.focus();
}

input.addEventListener('keydown', (e) => {
  observer.observe(e);
  if (e.key === 'Enter') e.preventDefault();
  else if (e.key !== 'Dead') lastCode = e.code || null;
});
const flush = () => {
  // Every character typed lands here; the field is emptied straight away (as in the trainer).
  const typed = input.value.normalize('NFC');
  input.value = '';
  for (const ch of typed) type(ch);
  lastCode = null;
};
input.addEventListener('input', (e) => {
  if (!(e as InputEvent).isComposing) flush();
});
input.addEventListener('compositionend', flush);
input.addEventListener('paste', (e) => e.preventDefault());
input.addEventListener('focus', showPill);
input.addEventListener('blur', showPill);
// Typing anywhere on the page starts the line, as long as nothing else has focus.
document.addEventListener('keydown', (e) => {
  if (document.activeElement !== document.body || !result.hidden) return;
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  input.focus();
});
box.addEventListener('click', (e) => {
  if (result.hidden && !(e.target as Element).closest('a, button:not(#lp-start)')) input.focus();
});

reset();
