import { availableLanguages, getCorpus } from './corpus';
import { withFlag } from './flags';
import { stairMark } from './stairMark';
import { initialCurriculum, tierWpm, unlockSteps, type CurriculumState } from './drill';
import { PLACEMENT_WORDS, canSkipAhead, wordsTyped } from './handoff';
import { KeyObserver, LAYOUTS, ROWS, charLabel, detectLayout, getLayout, keyLabel } from './layouts';
import { DEFAULT_PLACEMENT_PARAMS, placeFromTest, placementResult, placementText, quickText, type Placement } from './placement';
import { TypingSession } from './session';
import type { LayoutSetting } from './settings';
import type { KeystrokeEvent, PracticeContext } from './types';
import { num, pct, t, tMaybe } from './i18n';
import { benefits } from './sync/ui';

/**
 * First-run setup, three short steps before the first drill:
 *
 * 1. Keyboard: practice language and layout, with a preview of the layout
 *    and a check field. Typing the top letter row lets layout detection
 *    confirm or correct the choice from the physical keys pressed.
 * 2. Where to start: from the beginning, or a one-minute placement test
 *    (placement.ts) that skips the keys the learner already types well.
 * 3. How it works: the method in four points, and what the optional
 *    account is good for.
 *
 * Someone who already has an account can sign in from step 1; once their
 * lessons have synced, the setup closes by itself (see main.ts).
 *
 * A first visit takes a shorter way (`openQuick`): straight into a short
 * line of common words, which is the start of the placement test, often
 * already typed on the landing page. Beginners start lesson 1 from it; whoever
 * is fast enough to skip ahead types the rest of the placement test. The
 * layout is recognised from the keys pressed on the way, and "How it works"
 * comes after the first round instead (main.ts).
 *
 * The screen only talks to the rest of the app through `OnboardingHost`.
 * Its text comes from the translation files (`onboarding.*` keys) through `T` below.
 */

const T = {
  get steps() { return [t('onboarding.stepKeyboard'), t('onboarding.stepStart'), t('onboarding.stepMethod')]; },
  stepOf: (n: number, total: number) => t('onboarding.stepOf', { n, total }),
  get skip() { return t('onboarding.skip'); },
  get next() { return t('onboarding.next'); },
  get back() { return t('onboarding.back'); },

  get keyboardTitle() { return t('onboarding.keyboardTitle'); },
  get keyboardIntro() { return t('onboarding.keyboardIntro'); },
  get language() { return t('menu.practiceLanguage'); },
  get layoutDetected() { return t('onboarding.layoutDetected'); },
  get layoutGuessed() { return t('onboarding.layoutGuessed'); },
  get layoutChosen() { return t('onboarding.layoutChosen'); },
  get confirmQuestion() { return t('onboarding.confirmQuestion'); },
  get confirmYes() { return t('onboarding.confirmYes'); },
  get confirmNo() { return t('onboarding.confirmNo'); },
  get useList() { return t('onboarding.useList'); },
  get checkLabel() { return t('onboarding.checkLabel'); },
  get checkPlaceholder() { return t('onboarding.checkPlaceholder'); },
  checkMatch: (name: string) => t('onboarding.checkMatch', { name }),
  checkFits: (name: string) => t('onboarding.checkFits', { name }),
  checkSwitched: (name: string) => t('onboarding.checkSwitched', { name }),
  get checkNone() { return t('onboarding.checkNone'); },

  get startTitle() { return t('onboarding.startTitle'); },
  get startIntro() { return t('onboarding.startIntro'); },
  get newTitle() { return t('onboarding.newTitle'); },
  get newText() { return t('onboarding.newText'); },
  get testTitle() { return t('onboarding.testTitle'); },
  get testText() { return t('onboarding.testText'); },
  get keepTitle() { return t('onboarding.keepTitle'); },
  get keepText() { return t('onboarding.keepText'); },
  replaceNote: (lang: string, layout: string) => t('onboarding.replaceNote', { lang, layout }),

  get haveAccountQuestion() { return t('onboarding.haveAccount'); },
  get haveAccountText() { return t('onboarding.haveAccountText'); },
  get haveAccountAction() { return t('account.signIn'); },
  get accountCreate() { return t('onboarding.accountCreate'); },

  get testTitleRun() { return t('onboarding.testTitleRun'); },
  get testIntro() { return t('onboarding.testIntro'); },
  get testHint() { return t('onboarding.testHint'); },
  testProgress: (done: number, total: number) => t('onboarding.testProgress', { done, total }),
  get retry() { return t('onboarding.retry'); },

  get resultTitle() { return t('onboarding.resultTitle'); },
  get wpm() { return t('result.wpm'); },
  get accuracy() { return t('onboarding.accuracy'); },
  placedAhead: (tier: number, letters: number, total: number) =>
    t('onboarding.placedAhead', { tier, wpm: tierWpm(tier), letters, total }),
  placedStop: (key: string) => t('onboarding.placedStop', { key }),
  get placedAll() { return t('onboarding.placedAll'); },
  get placedSlow() { return t('onboarding.placedSlow'); },
  get placedSloppy() { return t('onboarding.placedSloppy'); },

  get methodTitle() { return t('onboarding.methodTitle'); },
  get method(): [string, string][] {
    return ([1, 2, 3, 4] as const).map((n) => [t(`onboarding.method${n}Title`), t(`onboarding.method${n}`, { acc: pct(0.92) })]);
  },
  get methodTip() { return t('onboarding.methodTip'); },
  get start() { return t('onboarding.start'); },

  get quickTitle() { return t('onboarding.quickTitle'); },
  get quickIntro() { return t('onboarding.quickIntro'); },
  get moreTitle() { return t('onboarding.moreTitle'); },
  moreIntro: (n: number) => t('onboarding.moreIntro', { n }),
  get quickSkip() { return t('onboarding.quickSkip'); },
};

/** Words in the opening line of a first visit's placement (the landing page's line is about as long). */
const QUICK_WORDS = 12;
/** Fewer words than this left of the placement test are not worth a second line. */
const MIN_MORE_WORDS = 6;

/** A layout's name in the interface language. */
const layoutName = (id: string) => tMaybe(`layout.${id}`) ?? getLayout(id)?.name ?? id;

/** What the onboarding screen needs from the app. */
export interface OnboardingHost {
  context(): PracticeContext;
  layoutSource(): LayoutSetting['source'];
  /** Whether lessons already exist for the current language and layout. */
  hasLessons(): boolean;
  /** Resolves once the language is in use (its corpus loaded). */
  setLanguage(language: string): Promise<void>;
  setLayout(layout: string, source: LayoutSetting['source']): Promise<void>;
  /** Stores one keystroke of the placement test in the log. */
  log(event: KeystrokeEvent): Promise<unknown>;
  /** Whether the learner is signed in to the optional account. */
  signedIn(): boolean;
  /** Opens the account panel, showing sign-in or account creation. */
  openAccount(kind: 'signin' | 'signup'): void;
  /**
   * Called when the learner is done or skips. `lessons` is the curriculum to
   * start with: a placement, a fresh start, or null to keep what is there.
   * `quick` is true at the end of a first visit's short setup (`openQuick`).
   */
  finish(lessons: CurriculumState | null, quick: boolean): void;
}

type Choice = 'new' | 'test' | 'keep';
/** Step 1: confirm the shown layout, or find it (by typing, or from the list). */
type KeyboardMode = 'confirm' | 'find';

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
  private kbMode: KeyboardMode = 'confirm';
  private listOpen = false;
  private choice: Choice = 'new';
  private placement: Placement | null = null;
  private observer = new KeyObserver();
  private test: { session: TypingSession; events: KeystrokeEvent[]; writes: Promise<unknown>[] } | null = null;
  /** The short first-visit setup (openQuick) rather than the full one. */
  private quick = false;
  /** Quick setup: placement keystrokes typed so far, the landing page's included. */
  private prior: KeystrokeEvent[] = [];
  /** Quick setup: whether a line was typed here, not only on the landing page. */
  private typedHere = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: OnboardingHost,
    private readonly locales: readonly string[],
  ) {}

  open(): void {
    this.quick = false;
    this.prior = [];
    this.step = 0;
    this.kbMode = 'confirm';
    this.listOpen = false;
    this.placement = null;
    this.test = null;
    this.observer = new KeyObserver();
    this.choice = this.host.hasLessons() ? 'keep' : 'new';
    this.root.hidden = false;
    this.render();
  }

  /**
   * The first-visit setup: the placement test and nothing else. `prior` are
   * the keystrokes of a line already typed on the landing page, if any.
   */
  openQuick(prior: readonly KeystrokeEvent[]): void {
    this.open();
    this.quick = true;
    this.step = 1;
    this.prior = [...prior];
    this.typedHere = false;
    if (this.prior.length) this.afterLine();
    else this.startTest();
  }

  /** Redraws in a new interface language, unless the placement test is being typed. */
  languageChanged(): void {
    if (!this.root.hidden && !this.test) this.render();
  }

  /** Redraws the keyboard step after the layout changed elsewhere (e.g. the browser reported it), unless the learner is typing in it. */
  layoutChanged(): void {
    if (this.root.hidden || this.step !== 0 || document.activeElement?.classList.contains('ob-check')) return;
    this.render();
  }

  /** Closes the setup keeping the lessons there are, e.g. after signing in brought them from another device. */
  dismiss(): void {
    if (!this.root.hidden) this.close(null);
  }

  /** Redraws when the learner signs in or out, unless the placement test is being typed. */
  accountChanged(): void {
    if (!this.root.hidden && !this.test) this.render();
  }

  private close(lessons: CurriculumState | null): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.test = null;
    this.host.finish(lessons, this.quick);
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
    if (this.quick) return this.renderQuick(card);
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
    if (this.step === 0 && !this.host.signedIn()) {
      // Same box as the offer to create an account in the last step, so both read as one thing.
      const words = el('div');
      words.append(el('b', '', T.haveAccountQuestion), el('p', '', T.haveAccountText));
      card.append(this.accountBox(words, T.haveAccountAction, () => this.host.openAccount('signin')));
    }
    if (this.step === 0) this.renderKeyboard(card);
    else if (this.step === 1) this.renderStart(card);
    else this.renderMethod(card);
    this.root.replaceChildren(card);
    card.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  /** The practice language picker; `changed` runs once the new language is in use. */
  private languageField(card: HTMLElement, changed: () => void): void {
    const langs = availableLanguages();
    if (langs.length < 2) return;
    const ctx = this.host.context();
    const field = el('div', 'ob-field');
    field.append(el('span', 'ob-label', T.language));
    const seg = el('div', 'segmented ob-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', T.language);
    for (const c of langs) {
      const b = button('', '', () => {
        this.host.setLanguage(c.language)
          .then(changed)
          .catch((err) => console.error('Failed to switch language', err));
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(c.language === ctx.language));
      b.append(...withFlag(c.language, c.name));
      seg.append(b);
    }
    field.append(seg);
    card.append(field);
  }

  // --- First visit: the placement test only ---

  private renderQuick(card: HTMLElement): void {
    const head = el('div', 'ob-head ob-head-quick');
    head.append(button(T.quickSkip, 'link-btn ob-skip', () => this.skip()));
    card.append(head);
    // The opening line, before a key is pressed: the language can still change, and an account can be brought in.
    const opening = this.test !== null && this.prior.length === 0 && this.test.events.length === 0;
    if (opening && !this.host.signedIn()) {
      const words = el('div');
      words.append(el('b', '', T.haveAccountQuestion), el('p', '', T.haveAccountText));
      card.append(this.accountBox(words, T.haveAccountAction, () => this.host.openAccount('signin')));
    }
    if (this.test) this.renderTest(card, opening ? () => this.languageField(card, () => this.startTest()) : undefined);
    else if (this.placement) this.renderPlacement(card);
    this.root.replaceChildren(card);
    card.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  /** After a line of the quick setup: type the rest of the placement test, or place the learner. */
  private afterLine(): void {
    const { wpm, accuracy } = placementResult(this.prior);
    const left = PLACEMENT_WORDS - wordsTyped(this.prior);
    if (canSkipAhead(wpm, accuracy) && left >= MIN_MORE_WORDS) return this.startTest();
    const ctx = this.host.context();
    this.placement = placeFromTest(this.prior, getCorpus(ctx.language), ctx);
    // Only the landing page's line, and it said lesson 1 comes next: no need to say it again.
    if (!this.typedHere && !this.placement.skipped) return this.close(this.placement.state);
    this.render();
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

    this.languageField(card, () => this.render());

    // The layout: shown as found, with a clear yes. Finding another one only
    // opens on request ("No / not sure").
    const box = el('div', 'ob-layout');
    const source = this.host.layoutSource();
    const head = el('div', 'ob-layout-head');
    head.append(
      el('span', 'ob-label', source === 'guessed' ? T.layoutGuessed : source === 'user' ? T.layoutChosen : T.layoutDetected),
      el('b', 'ob-layout-name', layoutName(ctx.layout)),
    );
    box.append(head);

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
    box.append(kb);
    card.append(box);

    const confirm = () => {
      // Going on with a layout confirms it.
      if (this.host.layoutSource() !== 'user') {
        this.host.setLayout(this.host.context().layout, 'user').catch((err) => console.error('Failed to update layout', err));
      }
      // Coming back to this step shows the confirmed layout, not the list or the check.
      this.kbMode = 'confirm';
      this.go(1);
    };
    const mode = (m: KeyboardMode) => () => {
      this.kbMode = m;
      this.render();
    };

    if (this.kbMode === 'confirm') {
      box.append(el('p', 'ob-question', T.confirmQuestion));
      const actions = el('div', 'ob-actions');
      const yes = button(T.confirmYes, 'primary', confirm);
      yes.dataset.autofocus = '';
      actions.append(yes, button(T.confirmNo, '', mode('find')));
      box.append(actions);
      return;
    }

    // Finding the layout: typing the top row recognises it; the list is the fallback for those who know it.
    const check = el('label', 'ob-field ob-find');
    check.append(el('span', 'ob-label-plain', T.checkLabel));
    const input = el('input', 'ob-check');
    Object.assign(input, { type: 'text', placeholder: T.checkPlaceholder, autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'off');
    input.dataset.autofocus = '';
    const status = el('span', 'ob-note ob-status');
    status.setAttribute('aria-live', 'polite');
    input.addEventListener('keydown', (e) => {
      this.observer.observe(e);
      keys.get(e.code)?.classList.add('ob-hit');
    });
    input.addEventListener('input', () => {
      const d = detectLayout(this.observer.observations(), this.locales);
      const current = this.host.context().layout;
      if (!d.layout) status.textContent = input.value ? T.checkNone : '';
      else if (d.candidates.includes(current)) {
        status.textContent = d.confidence === 'high' ? T.checkMatch(layoutName(current)) : T.checkFits(layoutName(current));
        status.classList.add('ok');
      } else {
        // The keys contradict the shown layout: switch, and keep what was typed.
        const typed = input.value;
        this.host.setLayout(d.layout, 'detected').then(() => {
          this.render();
          const again = this.root.querySelector<HTMLInputElement>('.ob-check');
          const note = this.root.querySelector<HTMLElement>('.ob-status');
          if (again && note) {
            again.value = typed;
            note.textContent = T.checkSwitched(layoutName(d.layout!));
            note.classList.add('ok');
            again.focus();
          }
        }).catch((err) => console.error('Failed to update layout', err));
      }
    });
    check.append(input, status);
    box.append(check);

    const list = el('details', 'ob-list');
    list.open = this.listOpen;
    list.addEventListener('toggle', () => { this.listOpen = list.open; });
    list.append(el('summary', '', T.useList));
    const select = el('select', 'ob-select');
    select.setAttribute('aria-label', T.useList);
    for (const l of LAYOUTS) select.append(new Option(layoutName(l.id), l.id, false, l.id === ctx.layout));
    select.addEventListener('change', () => {
      this.host.setLayout(select.value, 'user').then(() => {
        this.render();
        this.root.querySelector<HTMLElement>('.ob-select')?.focus();
      }).catch((err) => console.error('Failed to update layout', err));
    });
    list.append(select);
    card.append(list);

    const foot = el('div', 'ob-foot');
    const next = button(T.next, 'primary', confirm);
    foot.append(button(T.back, 'ob-back', mode('confirm')), next);
    card.append(foot);
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
      const words = el('span', 'ob-option-text');
      words.append(el('b', '', title), el('span', '', text));
      b.append(stairMark(id === 'new' ? 1 : id === 'test' ? 2 : 3));
      b.append(words);
      b.addEventListener('dblclick', () => next.click());
      options.append(b);
    }
    card.append(options);
    if (hasLessons) {
      const ctx = this.host.context();
      const lang = availableLanguages().find((c) => c.language === ctx.language)?.name ?? ctx.language;
      card.append(el('p', 'ob-note', T.replaceNote(lang, layoutName(ctx.layout))));
    }
    const next = button(T.next, '', () => {
      if (this.choice === 'test') this.startTest();
      else this.go(2);
    });
    card.append(this.footer(next, () => this.go(0)));
  }

  private startTest(): void {
    const ctx = this.host.context();
    const corpus = getCorpus(ctx.language);
    const text = !this.quick ? placementText(corpus, ctx.layout)
      : this.prior.length === 0 ? quickText(corpus, ctx.layout, QUICK_WORDS)
      // The rest of the test: the letters the first line left out come first (see placementText).
      : placementText(corpus, ctx.layout, Math.random, { ...DEFAULT_PLACEMENT_PARAMS, words: PLACEMENT_WORDS - wordsTyped(this.prior) },
        this.prior.filter((e) => e.correct).map((e) => e.expected).join(''));
    this.placement = null;
    this.test = { session: new TypingSession(text, ctx), events: [], writes: [] };
    this.render();
  }

  private renderTest(card: HTMLElement, beforeText?: () => void): void {
    const test = this.test!;
    const words = test.session.text.split(' ').length;
    if (!this.quick) card.append(el('h2', '', T.testTitleRun), el('p', 'ob-intro', T.testIntro));
    else if (this.prior.length === 0) card.append(el('h2', '', T.quickTitle), el('p', 'ob-intro', T.quickIntro));
    else card.append(el('h2', '', T.moreTitle), el('p', 'ob-intro', T.moreIntro(words)));
    beforeText?.();
    const textEl = el('div', 'text ob-text');
    textEl.setAttribute('aria-hidden', 'true');
    const input = el('textarea', 'typing-input');
    input.setAttribute('aria-label', T.testTitleRun);
    for (const a of ['autocomplete', 'autocapitalize', 'autocorrect']) input.setAttribute(a, 'off');
    input.spellcheck = false;
    const hint = el('p', 'type-hint', T.testHint);
    const progress = el('p', 'ob-note ob-progress');

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
      this.observer.observe(e);
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
    if (this.quick) return;
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
    Promise.all(test.writes).then(() => this.quick ? this.useObservedLayout() : undefined).finally(() => {
      if (this.test !== test) return;
      this.test = null;
      if (this.quick) {
        this.prior.push(...test.events);
        this.typedHere = true;
        return this.afterLine();
      }
      this.placement = placeFromTest(test.events, getCorpus(ctx.language), ctx);
      this.render();
    });
  }

  /** Quick setup: the keys pressed so far show the layout better than the browser language did. */
  private async useObservedLayout(): Promise<void> {
    if (this.host.layoutSource() === 'user') return;
    const d = detectLayout(this.observer.observations(), this.locales);
    if (d.layout && !d.candidates.includes(this.host.context().layout)) {
      await this.host.setLayout(d.layout, d.confidence === 'high' ? 'detected' : 'guessed');
    }
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
    nums.append(tile(num(p.wpm), T.wpm), tile(pct(p.accuracy), T.accuracy));
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
    const foot = this.quick
      ? this.footer(button(T.start, '', () => this.close(p.state)))
      : this.footer(button(T.next, '', () => this.go(2)));
    foot.prepend(button(T.retry, 'link-btn ob-retry', () => {
      this.prior = [];
      this.startTest();
    }));
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
    if (!this.host.signedIn()) {
      // The same points as in the account dialog, so the offer reads the same everywhere.
      card.append(this.accountBox(benefits(), T.accountCreate, () => {
        this.close(this.lessons());
        this.host.openAccount('signup');
      }));
    }
    card.append(this.footer(button(T.start, '', () => this.close(this.lessons())), () => this.go(1)));
  }

  /** A tinted box offering the account: what it is for and a button. */
  private accountBox(content: HTMLElement, action: string, go: () => void): HTMLElement {
    const box = el('div', 'ob-account');
    box.append(content, button(action, 'ob-account-btn', go));
    return box;
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
