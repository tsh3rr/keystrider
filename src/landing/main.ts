import '@fontsource-variable/jetbrains-mono';
import { loadThemeSetting } from '../settings';
import type { LandingCopy } from './content';

/**
 * The typing demo in the landing page's hero: one short line, typed like in
 * the trainer (a wrong key holds you on the letter), then speed, accuracy and
 * the keys that held you up, with a link on to the trainer. Nothing is saved.
 */

type Demo = LandingCopy['demo'] & { app: string };

const theme = loadThemeSetting();
if (theme !== 'system') document.documentElement.dataset.theme = theme;

const demo = JSON.parse(document.getElementById('lp-data')!.textContent!) as Demo;
const box = document.getElementById('lp-demo')!;
const textEl = document.getElementById('lp-text')!;
const input = document.getElementById('lp-input') as HTMLTextAreaElement;
const startPill = document.getElementById('lp-start')!;
const stats = document.getElementById('lp-stats')!;
const result = document.getElementById('lp-result')!;

let line = '';
let chars: HTMLSpanElement[] = [];
let pos = 0;
let keys = 0;
let errors = 0;
let started = 0;
let last = 0;
/** Per expected character: time to type it (ms, correct presses only) and wrong presses. */
let times = new Map<string, number[]>();
let misses = new Map<string, number>();
let lineIndex = Math.floor(Math.random() * demo.lines.length);

function reset(): void {
  line = demo.lines[lineIndex % demo.lines.length];
  pos = keys = errors = started = last = 0;
  times = new Map();
  misses = new Map();
  chars = [...line].map((ch) => {
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

function wpm(now: number): number {
  const minutes = (now - started) / 60000;
  return minutes > 0 ? Math.round(pos / 5 / minutes) : 0;
}

const accuracy = (): number => (keys ? Math.round(((keys - errors) / keys) * 100) : 100);

function type(ch: string): void {
  if (pos >= chars.length) return;
  const now = performance.now();
  if (!started) started = last = now;
  const expected = line[pos];
  keys++;
  const span = chars[pos];
  if (ch === expected) {
    // The first key has no time of its own: it only starts the clock.
    if (pos > 0 && expected !== ' ') times.set(expected, [...(times.get(expected) ?? []), now - last]);
    last = now;
    span.classList.remove('current', 'error');
    span.classList.add('typed');
    pos++;
    chars[pos]?.classList.add('current');
  } else {
    errors++;
    misses.set(expected, (misses.get(expected) ?? 0) + 1);
    span.classList.remove('error');
    void span.offsetWidth; // restart the shake
    span.classList.add('error');
  }
  if (pos >= 5) stats.textContent = `${wpm(now)} ${demo.wpm} · ${accuracy()} %`;
  if (pos >= chars.length) finish(now);
}

/**
 * The keys that cost the most: a wrong press counts as much as a slow one.
 * A key is slow when it took clearly longer than the learner's usual key.
 */
function slowKeys(): string[] {
  const all = [...times.values()].flat().sort((a, b) => a - b);
  const median = all.length ? all[Math.floor(all.length / 2)] : 0;
  const score = new Map<string, number>();
  for (const [ch, ts] of times) {
    const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
    if (avg > median * 1.4) score.set(ch, avg / median);
  }
  for (const [ch, n] of misses) if (ch !== ' ') score.set(ch, (score.get(ch) ?? 1) + n);
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([ch]) => ch);
}

function finish(now: number): void {
  const slow = slowKeys();
  const big = (value: string, label: string) => {
    const d = document.createElement('div');
    d.className = 'lp-big';
    d.append(Object.assign(document.createElement('strong'), { textContent: value }),
      Object.assign(document.createElement('span'), { textContent: label }));
    return d;
  };
  const numbers = document.createElement('div');
  numbers.className = 'lp-numbers';
  numbers.append(big(String(wpm(now)), demo.wpm), big(`${accuracy()} %`, demo.accuracy));

  const weak = document.createElement('p');
  weak.className = 'lp-weak';
  if (slow.length) {
    weak.append(demo.slowTitle, ' ', ...slow.map((ch) => Object.assign(document.createElement('kbd'), { textContent: ch })));
  } else {
    weak.textContent = demo.slowNone;
  }
  const next = Object.assign(document.createElement('p'), { textContent: slow.length ? demo.resultText : '' });
  next.hidden = !slow.length;

  const actions = document.createElement('div');
  actions.className = 'lp-actions';
  const go = Object.assign(document.createElement('a'), { className: 'lp-btn', href: demo.app, textContent: `${demo.cta} →` });
  const again = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn', textContent: demo.again });
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

input.addEventListener('input', () => {
  // Every character typed lands here; the field is emptied straight away (as in the trainer).
  const typed = input.value.normalize('NFC');
  input.value = '';
  for (const ch of typed) type(ch === '\n' ? ' ' : ch);
});
input.addEventListener('focus', showPill);
input.addEventListener('blur', showPill);
// Typing anywhere on the page starts the demo, as long as nothing else has focus.
document.addEventListener('keydown', (e) => {
  if (document.activeElement !== document.body || !result.hidden) return;
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  input.focus();
});
box.addEventListener('click', (e) => {
  if (result.hidden && !(e.target as Element).closest('a, button:not(#lp-start)')) input.focus();
});

reset();
