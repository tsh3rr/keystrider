import '@fontsource-variable/jetbrains-mono';
import { PLACEMENT_WORDS, canSkipAhead, saveLandingTest, wordsTyped } from '../handoff';
import { KeyObserver, ROWS, detectLayout, getLayout, guessFromLocale } from '../layouts';
import { fingerFor, fingerId, guideFor } from '../fingers';
import { TypingSession } from '../session';
import { loadThemeSetting } from '../settings';
import type { KeystrokeEvent } from '../types';
import type { LandingCopy, LandingLanguage } from './content';
import { HEAT_LEVELS, PLACED, PLACE_CELLS, QWERTY_TOP, STEPS, WEEK_DONE, WEEK_GOAL, skippedText, tabAt, type VignetteData } from './vignettes';

/**
 * The typing line in the landing page's hero. It is the start of the
 * trainer's placement test: typed with the trainer's own TypingSession (a
 * wrong key holds you on the letter), with the layout recognised from the
 * keys pressed. A small keyboard under the line shows the next key and the
 * finger for it. At the end it shows speed, accuracy and the keys that held
 * the learner up, and says what comes next in the trainer: lesson 1, or the
 * rest of the placement test for whoever can skip ahead. The page's one start
 * button below then says so, with an arrow pointing at it. The keystrokes
 * are handed over (handoff.ts) so the trainer carries on from here.
 *
 * Someone who has practised in this browser before sees "Keep practising"
 * on the start buttons instead.
 *
 * Further down, the feature pictures play once as they scroll into view
 * (vignettes.ts), and the weak-key bars grow.
 */

type Demo = LandingCopy['demo'] & {
  app: string;
  lang: LandingLanguage;
  continue: string;
  titles: string[];
  fingers: Record<string, string>;
  spaceKey: string;
  vignettes: VignetteData;
};

const theme = loadThemeSetting();
if (theme !== 'system') document.documentElement.dataset.theme = theme;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const demo = JSON.parse(document.getElementById('lp-data')!.textContent!) as Demo;
const box = document.getElementById('lp-demo')!;
const label = document.querySelector<HTMLElement>('#lp-label > span')!;
const typeArea = document.getElementById('lp-type')!;
const textEl = document.getElementById('lp-text')!;
const input = document.getElementById('lp-input') as HTMLTextAreaElement;
const startPill = document.getElementById('lp-start')!;
const stats = document.getElementById('lp-stats')!;
const result = document.getElementById('lp-result')!;
const cta = document.getElementById('lp-cta')!;
const go = document.getElementById('lp-go')!;
const goLabel = go.querySelector<HTMLElement>('[data-cta]')!;
const startLabel = goLabel.textContent!;

/** Has practised here before: the same test as public/to-app.js, which sends them on unless they asked for this page. */
const returning = (() => {
  try {
    return localStorage.getItem('typing-trainer.onboarded') === '1' || localStorage.getItem('typing-trainer.language') !== null;
  } catch {
    return false;
  }
})();
if (returning) document.querySelectorAll('[data-cta]').forEach((el) => { el.textContent = demo.continue; });

const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
const guessedLayout = guessFromLocale(browserLocales);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) =>
  Object.assign(document.createElement(tag), { className: cls }, text === undefined ? {} : { textContent: text });

/**
 * The finger guide under the line: three letter rows and Space of the
 * layout in use, tinted by finger, the next key raised in cobalt. It starts
 * on the layout guessed from the browser language and switches once the
 * keys pressed show another.
 */
const guide = {
  root: document.getElementById('lp-guide')!,
  kb: document.getElementById('lp-kb')!,
  key: document.getElementById('lp-guide-key')!,
  finger: document.getElementById('lp-guide-finger')!,
  layout: '',
  keys: new Map<string, HTMLElement>(),
  lit: null as HTMLElement | null,

  build(layoutId: string): void {
    if (layoutId === this.layout) return;
    const layout = getLayout(layoutId);
    if (!layout) return;
    this.layout = layoutId;
    this.keys.clear();
    this.lit = null;
    // The letter rows without the digits; the ISO key left of Z is left out to keep the rows short.
    const rows = [ROWS[1].slice(0, 11), ROWS[2].slice(0, 11), ROWS[3].slice(1)].map((codes, r) => {
      const row = el('div', `lp-kb-row lp-kb-row-${r}`);
      for (const code of codes) {
        const ch = layout.keys.get(code);
        if (ch === undefined) continue;
        const key = el('span', `lp-kb-key tint-${fingerFor(code)?.name ?? 'index'}`, ch);
        this.keys.set(code, key);
        row.append(key);
      }
      return row;
    });
    const space = el('span', 'lp-kb-key lp-kb-space tint-thumb');
    this.keys.set('Space', space);
    const spaceRow = el('div', 'lp-kb-row');
    spaceRow.append(space);
    this.kb.replaceChildren(...rows, spaceRow);
  },

  show(ch: string | undefined): void {
    this.lit?.classList.remove('is-next');
    this.lit = null;
    if (ch === undefined) return;
    const how = guideFor(this.layout, ch);
    this.key.textContent = ch === ' ' ? '␣' : ch.toLocaleUpperCase(demo.lang);
    const f = how?.finger;
    this.finger.textContent = f ? (f.name === 'thumb' ? demo.fingers.thumb : demo.fingers[fingerId(f)]) ?? '' : '';
    const key = how ? this.keys.get(how.code) : undefined;
    if (key) {
      key.classList.add('is-next');
      this.lit = key;
    }
  },
};

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
  label.textContent = demo.label;
  result.hidden = true;
  typeArea.hidden = false;
  guide.root.hidden = false;
  guide.build(guessedLayout);
  guide.show(session.text[0]);
  cta.classList.remove('is-ready');
  goLabel.textContent = returning ? demo.continue : startLabel;
  showPill();
}

function showPill(): void {
  const focused = document.activeElement === input;
  startPill.hidden = focused || !result.hidden;
  textEl.classList.toggle('focused', focused);
  box.classList.toggle('is-focused', focused);
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

/** The layout the keys pressed so far show, if they show one clearly. */
function detected(): string | null {
  const d = detectLayout(observer.observations(), browserLocales);
  return d.layout !== null && d.confidence === 'high' ? d.layout : null;
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
  if (session.done) {
    finish();
    return;
  }
  guide.build(detected() ?? guide.layout);
  guide.show(session.text[session.position]);
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
  const found = detected();
  const layout = found ?? guessedLayout;
  saveLandingTest({
    language: demo.lang,
    layout,
    layoutSource: found ? 'detected' : 'guessed',
    events: events.map((e) => ({ ...e, layout })),
    savedAt: Date.now(),
  });
}

function finish(): void {
  handOver();
  const { wpm, accuracy } = score();
  const fast = canSkipAhead(wpm, accuracy);
  const slow = slowKeys();
  const big = (value: string, text: string) => {
    const d = el('div', 'lp-big');
    d.append(el('strong', '', value), el('span', '', text));
    return d;
  };
  const numbers = el('div', 'lp-numbers');
  numbers.append(big(String(Math.round(wpm)), demo.wpmLong), big(`${Math.round(accuracy * 100)} %`, demo.accuracy));

  const weak = el('p', 'lp-weak');
  if (slow.length) weak.append(demo.slowTitle, ...slow.map((ch) => el('kbd', '', ch)));
  else weak.textContent = demo.slowNone;

  const left = PLACEMENT_WORDS - wordsTyped(events);
  const next = el('p', 'lp-next', fast ? demo.nextFast.replace('{n}', String(left)) : demo.nextBeginner);

  const again = Object.assign(el('button', 'link-btn lp-again', demo.again), { type: 'button' });
  again.addEventListener('click', () => {
    lineIndex++;
    reset();
    input.focus();
  });

  result.replaceChildren(numbers, weak, next, again);
  label.textContent = demo.result;
  typeArea.hidden = true;
  guide.root.hidden = true;
  stats.textContent = '';
  result.hidden = false;
  input.blur();
  showPill();
  // One way on: the start button under the line now names the next step, and an arrow points at it.
  goLabel.textContent = returning ? demo.continue : fast ? demo.ctaFast : demo.ctaBeginner;
  cta.classList.add('is-ready');
  go.focus({ preventScroll: true });
  cta.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
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

/**
 * The headline types itself: it waits on the first one, then deletes it as
 * if with backspace and types the next, in turn, behind a blinking caret.
 * Screen readers keep the first headline; with reduced motion nothing moves.
 */
function typeHeadlines(): void {
  const h1 = document.getElementById('lp-title')!;
  const titles = demo.titles;
  if (titles.length < 2 || reducedMotion) return;
  const live = Object.assign(document.createElement('span'), { className: 'lp-title-live' });
  live.setAttribute('aria-hidden', 'true');
  const text = document.createTextNode(titles[0]);
  const caret = Object.assign(document.createElement('span'), { className: 'lp-caret' });
  live.append(text, caret);
  const sizers = titles.map((t) => {
    const s = Object.assign(document.createElement('span'), { className: 'lp-title-sizer', textContent: t });
    s.setAttribute('aria-hidden', 'true');
    return s;
  });
  const spoken = Object.assign(document.createElement('span'), { className: 'sr-only', textContent: titles[0] });
  h1.replaceChildren(spoken, ...sizers, live);
  h1.classList.add('is-typing');

  const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
  const busy = (on: boolean) => live.classList.toggle('is-busy', on);
  (async () => {
    for (let i = 0; ; i = (i + 1) % titles.length) {
      busy(false);
      await wait(i === 0 ? 4200 : 2800);
      busy(true);
      while (text.data) {
        text.data = [...text.data].slice(0, -1).join('');
        await wait(18);
      }
      await wait(380);
      const next = [...titles[(i + 1) % titles.length]];
      for (let n = 1; n <= next.length; n++) {
        text.data = next.slice(0, n).join('');
        // A little uneven, like a person typing; a beat longer after a space or punctuation.
        await wait(42 + Math.random() * 50 + (/[\s.,:]/.test(next[n - 1]) ? 60 : 0));
      }
    }
  })();
}

/* --- Feature pictures (vignettes.ts): each frame sets classes and text on the elements render.ts drew. --- */

const v = demo.vignettes;
const cards = [...document.querySelectorAll<HTMLElement>('.lp-feat[data-v]')];
const all = (card: HTMLElement, sel: string) => [...card.querySelectorAll<HTMLElement>(sel)];
const one = (card: HTMLElement, sel: string) => card.querySelector<HTMLElement>(sel)!;

const FRAMES: ((card: HTMLElement, step: number) => void)[] = [
  (card, step) => {
    const tab = tabAt(v, step);
    all(card, '.lp-v-tabs span').forEach((s, i) => s.classList.toggle('is-on', i === tab));
    all(card, '.lp-v-key').forEach((k, i) => {
      k.textContent = v.tabs[tab].keys[i];
      k.classList.toggle('is-diff', v.tabs[tab].keys[i] !== QWERTY_TOP[i]);
    });
    one(card, '.lp-v-cap').textContent = v.tabs[tab].caption;
  },
  (card, step) => {
    const at = step % v.word.length;
    const next = v.word[at];
    one(card, '.lp-v-next kbd').textContent = next.toLocaleUpperCase(v.lang);
    one(card, '.lp-v-next span').textContent = v.wordFingers[at];
    all(card, '.lp-v-fkey').forEach((k, i) => {
      k.classList.toggle('is-next', v.row[i].ch === next);
      k.classList.toggle('is-known', v.row[i].ch !== next && v.row[i].known);
    });
    all(card, '.lp-v-word span').forEach((s, i) => { s.className = i < at ? 'is-typed' : i === at ? 'is-current' : ''; });
  },
  (card, step) => {
    const placed = PLACED[step];
    one(card, '.lp-v-pill b').textContent = `${placed}/${PLACE_CELLS}`;
    all(card, '.lp-v-cells span').forEach((c, i) => { c.className = i < PLACED[0] ? 'is-first' : i < placed ? 'is-skipped' : ''; });
    const note = one(card, '.lp-v-note');
    note.textContent = placed > PLACED[0] ? skippedText(v, placed - PLACED[0]) : v.placing;
    note.classList.toggle('is-done', placed > PLACED[0]);
  },
  (card, step) => {
    one(card, '.lp-v-speed b').textContent = step === 0 ? '24' : '42';
    one(card, '.lp-v-plot').classList.toggle('is-hidden', step === 0);
    all(card, '.lp-v-heat span').forEach((h, i) => { h.className = `heat-${step >= 2 ? Math.max(0, HEAT_LEVELS[i] - 1) : HEAT_LEVELS[i]}`; });
  },
  (card, step) => {
    const done: readonly number[] = WEEK_DONE.slice(0, step);
    all(card, '.lp-v-days i').forEach((d, i) => d.classList.toggle('is-done', done.includes(i)));
    one(card, '.lp-v-bar i').style.width = `${(done.length / WEEK_GOAL) * 100}%`;
    one(card, '.lp-v-goal-text b').textContent = `${done.length} / ${WEEK_GOAL}`;
  },
  (card, step) => {
    one(card, '.lp-v-dot').classList.toggle('is-across', step >= 1);
    one(card, '.lp-v-lesson').textContent = step >= 2 ? '7' : '6';
  },
];

/**
 * Each card plays once when it scrolls into view, then rests on its last
 * frame; cards that arrive together start one after the other. Hovering a
 * card plays it again. With reduced motion the pictures stay on the last
 * frame render.ts drew.
 */
function playVignettes(): void {
  if (reducedMotion || cards.length !== FRAMES.length) return;
  const playing = new Set<number>();
  const play = (i: number) => {
    if (playing.has(i)) return;
    playing.add(i);
    FRAMES[i](cards[i], 0);
    let step = 0;
    const id = setInterval(() => {
      FRAMES[i](cards[i], ++step);
      if (step >= STEPS[i]) {
        clearInterval(id);
        playing.delete(i);
      }
    }, 900);
  };
  cards.forEach((card, i) => {
    FRAMES[i](card, 0);
    card.addEventListener('mouseenter', () => play(i));
  });
  if (!('IntersectionObserver' in window)) {
    cards.forEach((_, i) => setTimeout(() => play(i), 250 + i * 450));
    return;
  }
  let queued = 0;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const i = cards.indexOf(e.target as HTMLElement);
      setTimeout(() => {
        queued = Math.max(0, queued - 1);
        play(i);
      }, 250 + queued++ * 450);
    }
  }, { threshold: 0.35 });
  cards.forEach((card) => io.observe(card));
}

/** The weak-key bars grow from nothing when the table comes into view. */
function growBars(): void {
  const table = document.querySelector<HTMLElement>('.lp-weak-table');
  if (reducedMotion || !table || !('IntersectionObserver' in window)) return;
  table.classList.add('is-waiting');
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    setTimeout(() => table.classList.remove('is-waiting'), 400);
  }, { threshold: 0.35 });
  io.observe(table);
}

reset();
typeHeadlines();
playVignettes();
growBars();
