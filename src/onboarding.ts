import { availableLanguages, getCorpus } from './corpus';
import { initialCurriculum, tierWpm, unlockSteps, type CurriculumState } from './drill';
import { KeyObserver, LAYOUTS, ROWS, charLabel, detectLayout, getLayout, keyLabel } from './layouts';
import { placeFromTest, placementText, type Placement } from './placement';
import { TypingSession } from './session';
import type { LayoutSetting } from './settings';
import type { KeystrokeEvent, PracticeContext } from './types';

/**
 * First-run setup, three short steps before the first drill:
 *
 * 1. Keyboard: practice language and layout, with a preview of the layout
 *    and a check field. Typing the top letter row lets layout detection
 *    confirm or correct the choice from the physical keys pressed.
 * 2. Where to start: from the beginning, or a one-minute placement test
 *    (placement.ts) that skips the keys the learner already types well.
 * 3. How it works: the method in four points.
 *
 * The screen only talks to the rest of the app through `OnboardingHost`.
 * All its text is in `T` below, so it can move to the translation files.
 */

const T = {
  steps: ['Keyboard', 'Where to start', 'How it works'],
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  skip: 'Skip setup',
  next: 'Continue',
  back: 'Back',

  keyboardTitle: 'Welcome! First, your keyboard',
  keyboardIntro: 'Drills are built for the language you practise and the keyboard you type on, so the finger guide shows your keys.',
  language: 'Practice language',
  layout: 'Keyboard layout',
  source: {
    user: 'Chosen by you.',
    detected: 'Detected from your keyboard.',
    guessed: 'A guess from your browser language. Check it below.',
  } as Record<LayoutSetting['source'], string>,
  checkLabel: 'To check, type the top row of letters on your keyboard, from left to right:',
  checkPlaceholder: 'Type here',
  checkMatch: (name: string) => `✓ Your keys match ${name}.`,
  checkFits: (name: string) => `✓ That fits ${name}.`,
  checkSwitched: (name: string) => `Your keys look like ${name}, so the layout was switched.`,
  checkNone: 'Type letters only, without Shift.',

  startTitle: 'Where would you like to start?',
  startIntro: 'Touch typing means typing without looking at your hands. Either way, the drills adapt to you as you go.',
  newTitle: "I'm new to touch typing",
  newText: 'Start with six common letters and add one key at a time.',
  testTitle: 'I can already type without looking',
  testText: 'Take a one-minute test and skip the keys you already know.',
  keepTitle: 'Keep my current lessons',
  keepText: 'Go on where you left off.',
  replaceNote: (lang: string, layout: string) =>
    `You already have lessons for ${lang} on ${layout}. Starting over or taking the test replaces them; your keystroke log is kept.`,

  testTitleRun: 'Placement test',
  testIntro: 'Type the text at your normal pace, without looking at your hands. Mistakes are fine: a wrong key holds you on the same letter.',
  testHint: 'Click the text and start typing.',
  testProgress: (done: number, total: number) => `${done} of ${total} words`,
  retry: 'Take the test again',

  resultTitle: 'Your starting point',
  wpm: 'WPM',
  accuracy: 'accuracy',
  placedAhead: (tier: number, letters: number, total: number) =>
    `You start at level ${tier} (${tierWpm(tier)} WPM) with ${letters} of ${total} letters unlocked.`,
  placedStop: (key: string) => `${key} comes next; from there, new keys unlock one at a time.`,
  placedAll: 'Capitals, punctuation and numbers come next.',
  placedSlow: 'You start from the beginning: six letters, then one new key at a time. Building the habit of not looking pays off fastest.',
  placedSloppy: 'You start from the beginning, with accuracy first. Typing cleanly at a slower pace builds speed faster than rushing.',

  methodTitle: 'How it works',
  method: [
    ['One new key at a time', 'The most common letters come first, so drills read like real words early on. A new key unlocks once every key you have is accurate and quick.'],
    ['Accuracy before speed', 'A wrong key holds you on the same letter. If your accuracy drops below 92%, speed is hidden until you type cleanly again.'],
    ['Drills aimed at your weak spots', 'Every keystroke is measured. Each drill leans on the keys and letter pairs that slow you down, and brings back keys you have not practised for a while.'],
    ['Short rounds and breaks', 'A session opens with a warm-up and mixes in short focus bursts and real sentences. When your typing gets worse, you get a nudge to take a break.'],
  ] as [string, string][],
  methodTip: 'Keep your eyes on the screen. The keyboard under the text shows which finger to use for each key.',
  start: 'Start practising',
};

/** What the onboarding screen needs from the app. */
export interface OnboardingHost {
  context(): PracticeContext;
  layoutSource(): LayoutSetting['source'];
  /** Whether lessons already exist for the current language and layout. */
  hasLessons(): boolean;
  setLanguage(language: string): void;
  setLayout(layout: string, source: LayoutSetting['source']): Promise<void>;
  /** Stores one keystroke of the placement test in the log. */
  log(event: KeystrokeEvent): Promise<unknown>;
  /**
   * Called when the learner is done or skips. `lessons` is the curriculum to
   * start with: a placement, a fresh start, or null to keep what is there.
   */
  finish(lessons: CurriculumState | null): void;
}

type Choice = 'new' | 'test' | 'keep';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export class Onboarding {
  private step = 0;
  private choice: Choice = 'new';
  private placement: Placement | null = null;
  private observer = new KeyObserver();
  private test: { session: TypingSession; events: KeystrokeEvent[]; writes: Promise<unknown>[] } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: OnboardingHost,
    private readonly locales: readonly string[],
  ) {}

  open(): void {
    this.step = 0;
    this.placement = null;
    this.test = null;
    this.observer = new KeyObserver();
    this.choice = this.host.hasLessons() ? 'keep' : 'new';
    this.root.hidden = false;
    this.render();
  }

  /** Redraws the keyboard step after the layout changed elsewhere (e.g. the browser reported it), unless the learner is typing in it. */
  layoutChanged(): void {
    if (this.root.hidden || this.step !== 0 || document.activeElement?.classList.contains('ob-check')) return;
    this.render();
  }

  private close(lessons: CurriculumState | null): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.test = null;
    this.host.finish(lessons);
  }

  private skip(): void {
    this.close(this.placement?.state ?? null);
  }

  private go(step: number): void {
    this.step = step;
    this.render();
  }

  private render(): void {
    const card = el('div', 'ob-card');
    const head = el('div', 'ob-head');
    const dots = el('ol', 'ob-steps');
    dots.setAttribute('aria-label', T.stepOf(this.step + 1, T.steps.length));
    T.steps.forEach((name, i) => {
      const li = el('li', i < this.step ? 'done' : i === this.step ? 'current' : '', name);
      if (i === this.step) li.setAttribute('aria-current', 'step');
      dots.append(li);
    });
    head.append(dots, button(T.skip, 'link-btn ob-skip', () => this.skip()));
    card.append(head);
    if (this.step === 0) this.renderKeyboard(card);
    else if (this.step === 1) this.renderStart(card);
    else this.renderMethod(card);
    this.root.replaceChildren(card);
    card.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  private footer(next: HTMLButtonElement, back?: () => void): HTMLElement {
    const foot = el('div', 'ob-foot');
    if (back) foot.append(button(T.back, 'ob-back', back));
    next.classList.add('primary');
    next.dataset.autofocus = '';
    foot.append(next);
    return foot;
  }

  // --- Step 1: keyboard ---

  private renderKeyboard(card: HTMLElement): void {
    const ctx = this.host.context();
    card.append(el('h2', '', T.keyboardTitle), el('p', 'ob-intro', T.keyboardIntro));

    const langs = availableLanguages();
    if (langs.length > 1) {
      const field = el('div', 'ob-field');
      field.append(el('span', 'ob-label', T.language));
      const seg = el('div', 'segmented ob-seg');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', T.language);
      seg.style.gridTemplateColumns = `repeat(${langs.length}, 1fr)`;
      for (const c of langs) {
        const b = button(c.name, '', () => {
          this.host.setLanguage(c.language);
          this.render();
        });
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(c.language === ctx.language));
        seg.append(b);
      }
      field.append(seg);
      card.append(field);
    }

    const field = el('label', 'ob-field');
    field.append(el('span', 'ob-label', T.layout));
    const select = el('select', 'ob-select');
    for (const l of LAYOUTS) select.append(new Option(l.name, l.id, false, l.id === ctx.layout));
    select.addEventListener('change', () => {
      this.host.setLayout(select.value, 'user').then(() => this.render()).catch((err) => console.error('Failed to update layout', err));
    });
    field.append(select, el('span', 'ob-note', T.source[this.host.layoutSource()]));
    card.append(field);

    const kb = el('div', 'kb ob-kb');
    kb.setAttribute('aria-hidden', 'true');
    const keys = new Map<string, HTMLElement>();
    ROWS.forEach((row, r) => {
      const rowEl = el('div', `kb-row kb-row-${r}`);
      for (const code of row) {
        const label = keyLabel(ctx.layout, code);
        if (label === code) continue; // a key this layout lacks
        const k = el('span', 'kb-key', label);
        keys.set(code, k);
        rowEl.append(k);
      }
      kb.append(rowEl);
    });
    card.append(kb);

    const check = el('label', 'ob-field');
    check.append(el('span', 'ob-label-plain', T.checkLabel));
    const input = el('input', 'ob-check');
    Object.assign(input, { type: 'text', placeholder: T.checkPlaceholder, autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'off');
    const status = el('span', 'ob-note ob-status');
    status.setAttribute('aria-live', 'polite');
    input.addEventListener('keydown', (e) => {
      this.observer.observe(e);
      keys.get(e.code)?.classList.add('ob-hit');
    });
    input.addEventListener('input', () => {
      const d = detectLayout(this.observer.observations(), this.locales);
      const current = this.host.context().layout;
      const name = (id: string) => getLayout(id)?.name ?? id;
      if (!d.layout) status.textContent = input.value ? T.checkNone : '';
      else if (d.candidates.includes(current)) {
        status.textContent = d.confidence === 'high' ? T.checkMatch(name(current)) : T.checkFits(name(current));
        status.classList.add('ok');
      } else {
        // The keys contradict the chosen layout: switch, and keep what was typed.
        const typed = input.value;
        this.host.setLayout(d.layout, 'detected').then(() => {
          this.render();
          const again = this.root.querySelector<HTMLInputElement>('.ob-check');
          const note = this.root.querySelector<HTMLElement>('.ob-status');
          if (again && note) {
            again.value = typed;
            note.textContent = T.checkSwitched(name(d.layout!));
            again.focus();
          }
        }).catch((err) => console.error('Failed to update layout', err));
      }
    });
    check.append(input, status);
    card.append(check);

    card.append(this.footer(button(T.next, '', () => {
      // Going on with a layout confirms it.
      const layout = this.host.context().layout;
      if (this.host.layoutSource() !== 'user') {
        this.host.setLayout(layout, 'user').catch((err) => console.error('Failed to update layout', err));
      }
      this.go(1);
    })));
  }

  // --- Step 2: where to start, and the placement test ---

  private renderStart(card: HTMLElement): void {
    if (this.test) return this.renderTest(card);
    if (this.placement) return this.renderPlacement(card);

    card.append(el('h2', '', T.startTitle), el('p', 'ob-intro', T.startIntro));
    const options = el('div', 'ob-options');
    options.setAttribute('role', 'radiogroup');
    const hasLessons = this.host.hasLessons();
    const choices: [Choice, string, string][] = [
      ...(hasLessons ? [['keep', T.keepTitle, T.keepText] as [Choice, string, string]] : []),
      ['new', T.newTitle, T.newText],
      ['test', T.testTitle, T.testText],
    ];
    for (const [id, title, text] of choices) {
      const b = button('', 'ob-option', () => {
        this.choice = id;
        options.querySelectorAll('.ob-option').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === this.choice));
      b.append(el('b', '', title), el('span', '', text));
      b.addEventListener('dblclick', () => next.click());
      options.append(b);
    }
    card.append(options);
    if (hasLessons) {
      const ctx = this.host.context();
      const lang = availableLanguages().find((c) => c.language === ctx.language)?.name ?? ctx.language;
      card.append(el('p', 'ob-note', T.replaceNote(lang, getLayout(ctx.layout)?.name ?? ctx.layout)));
    }
    const next = button(T.next, '', () => {
      if (this.choice === 'test') this.startTest();
      else this.go(2);
    });
    card.append(this.footer(next, () => this.go(0)));
  }

  private startTest(): void {
    const ctx = this.host.context();
    const text = placementText(getCorpus(ctx.language), ctx.layout);
    this.test = { session: new TypingSession(text, ctx), events: [], writes: [] };
    this.render();
  }

  private renderTest(card: HTMLElement): void {
    const test = this.test!;
    card.append(el('h2', '', T.testTitleRun), el('p', 'ob-intro', T.testIntro));
    const textEl = el('div', 'text ob-text');
    textEl.setAttribute('aria-hidden', 'true');
    const input = el('textarea', 'typing-input');
    input.setAttribute('aria-label', T.testTitleRun);
    for (const a of ['autocomplete', 'autocapitalize', 'autocorrect']) input.setAttribute(a, 'off');
    input.spellcheck = false;
    const hint = el('p', 'type-hint', T.testHint);
    const progress = el('p', 'ob-note ob-progress');
    const words = test.session.text.split(' ').length;

    const draw = () => {
      const chars = [...test.session.text];
      textEl.replaceChildren(...chars.map((ch, i) =>
        el('span', i < test.session.position ? 'typed' : i === test.session.position ? 'current' : '', ch)));
      const done = chars.slice(0, test.session.position).filter((c) => c === ' ').length;
      progress.textContent = T.testProgress(done, words);
    };
    let lastCode: string | null = null;
    const flush = () => {
      const typed = input.value;
      input.value = '';
      for (const ch of typed.normalize('NFC')) {
        const ev = test.session.press(ch, Date.now(), lastCode);
        if (!ev) break;
        test.events.push(ev);
        test.writes.push(this.host.log(ev).catch((err) => console.error('Failed to log keystroke', err)));
      }
      lastCode = null;
      draw();
      if (test.events.at(-1)?.correct === false) textEl.querySelector('.current')?.classList.add('error');
      if (test.session.done) this.finishTest();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
      else if (e.key !== 'Dead') lastCode = e.code || null;
    });
    input.addEventListener('input', (e) => {
      if (!(e as InputEvent).isComposing) flush();
    });
    input.addEventListener('compositionend', flush);
    input.addEventListener('paste', (e) => e.preventDefault());
    input.addEventListener('drop', (e) => e.preventDefault());
    input.addEventListener('focus', () => { textEl.classList.add('focused'); hint.hidden = true; });
    input.addEventListener('blur', () => { textEl.classList.remove('focused'); hint.hidden = false; });
    textEl.addEventListener('click', () => input.focus());
    input.dataset.autofocus = '';
    draw();

    const wrap = el('div', 'ob-typing');
    wrap.append(textEl, input);
    card.append(wrap, hint, progress);
    const foot = el('div', 'ob-foot');
    foot.append(button(T.back, 'ob-back', () => {
      this.test = null;
      this.render();
    }));
    card.append(foot);
  }

  private finishTest(): void {
    const test = this.test;
    if (!test) return;
    const ctx = this.host.context();
    Promise.all(test.writes).finally(() => {
      if (this.test !== test) return;
      this.placement = placeFromTest(test.events, getCorpus(ctx.language), ctx);
      this.test = null;
      this.render();
    });
  }

  private renderPlacement(card: HTMLElement): void {
    const p = this.placement!;
    const ctx = this.host.context();
    card.append(el('h2', '', T.resultTitle));

    const nums = el('div', 'rc-nums ob-nums');
    const tile = (value: string, unit: string) => {
      const t = el('div', 'rc-tile');
      const big = el('div', 'rc-big');
      big.append(value, el('small', '', unit));
      t.append(big);
      return t;
    };
    nums.append(tile(String(Math.round(p.wpm)), T.wpm), tile(`${Math.round(p.accuracy * 100)}%`, T.accuracy));
    card.append(nums);

    const letters = unlockSteps(getCorpus(ctx.language), ctx.layout).filter((s) => /^\p{L}$/u.test(s));
    let text: string;
    if (p.skipped) {
      const n = p.state.unlocked.length;
      text = T.placedAhead(p.state.tier, n, letters.length) + ' ' +
        (p.stoppedAt ? T.placedStop(charLabel(ctx.layout, p.stoppedAt)) : n >= letters.length ? T.placedAll : '');
    } else {
      text = p.accuracy < 0.9 ? T.placedSloppy : T.placedSlow;
    }
    card.append(el('p', 'ob-result', text.trim()));
    const foot = this.footer(button(T.next, '', () => this.go(2)));
    foot.prepend(button(T.retry, 'link-btn ob-retry', () => this.startTest()));
    card.append(foot);
  }

  // --- Step 3: how it works ---

  private renderMethod(card: HTMLElement): void {
    card.append(el('h2', '', T.methodTitle));
    const list = el('ol', 'ob-method');
    T.method.forEach(([title, text], i) => {
      const li = el('li');
      li.append(el('span', 'ob-num', String(i + 1)));
      const body = el('div');
      body.append(el('b', '', title), el('p', '', text));
      li.append(body);
      list.append(li);
    });
    card.append(list, el('p', 'ob-note', T.methodTip));
    card.append(this.footer(button(T.start, '', () => this.close(this.lessons())), () => this.go(1)));
  }

  /** The lessons to start with, from the choice in step 2. */
  private lessons(): CurriculumState | null {
    if (this.placement) return this.placement.state;
    if (this.choice === 'keep') return null;
    // From the beginning, built without history so nothing is skipped.
    const ctx = this.host.context();
    return initialCurriculum(getCorpus(ctx.language), ctx);
  }
}
