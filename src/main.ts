import { TypingSession } from './session';
import { KeystrokeStore, toCsv } from './store';
import { DEFAULT_LANGUAGE, getCorpus } from './corpus';
import { clearCurriculum, loadCurriculum, saveCurriculum } from './curriculum-store';
import {
  CAPITALS, DEFAULT_DRILL_PARAMS, afterDrill, drillFeedback, drillResult, initialCurriculum, isNewSession, meetsBar, modelOptions, needsShift,
  nextDrill, nextKind, sentencesReady, tierTargetMs, tierWpm, unlockSteps,
  type CurriculumChange, type CurriculumState, type Drill, type ItemChange,
} from './drill';
import { loadWeaknessModel, type WeaknessModel } from './weakness';
import {
  KeyObserver, LAYOUTS, browserLayoutMap, charLabel, detectLayout, getLayout, guessFromLocale, keyLabel, relabelPlan,
} from './layouts';
import { FingerGuide } from './fingerGuide';
import { DEFAULT_FATIGUE_PARAMS, FatigueTracker, type FatigueSignal } from './fatigue';
import { learningPath, sessionPlan, type StageId } from './path';
import { renderProgress, type Range } from './progressView';
import {
  backfillDone, loadBreakRemindersSetting, loadFingerGuideSetting, loadGuideFadeSetting, loadLayoutSetting, loadShowKeysSetting, loadWordFilterSetting,
  markBackfillDone, saveBreakRemindersSetting, saveFingerGuideSetting, saveGuideFadeSetting, saveLayoutSetting, saveShowKeysSetting, saveWordFilterSetting,
  type LayoutSetting,
} from './settings';
import type { KeystrokeEvent, PracticeContext } from './types';
import { setWordFilterEnabled } from './wordfilter';

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

// Replaced by the first drill once the keystroke log is open.
let session = new TypingSession('', context);
let store: KeystrokeStore;

// The row of every key, unlocked or not; the learning-path panel covers the same ground, so it is optional.
const keysToggle = $<HTMLInputElement>('keys-toggle');
keysToggle.checked = loadShowKeysSetting();
$('drill-keys').hidden = !keysToggle.checked;
keysToggle.addEventListener('change', () => {
  $('drill-keys').hidden = !keysToggle.checked;
  saveShowKeysSetting(keysToggle.checked);
  inputEl.focus();
});

// On-screen keyboard showing the next key and which finger types it.
const fingerGuide = new FingerGuide($('finger-guide'));
const fingerGuideToggle = $<HTMLInputElement>('finger-guide-toggle');
fingerGuide.setLayout(context.layout);
fingerGuideToggle.checked = loadFingerGuideSetting();
fingerGuide.hidden = !fingerGuideToggle.checked;
fingerGuideToggle.addEventListener('change', () => {
  fingerGuide.hidden = !fingerGuideToggle.checked;
  saveFingerGuideSetting(fingerGuideToggle.checked);
  inputEl.focus();
});

// Faded guidance: for keys that already meet the unlock bar the guide stays
// dim, so the learner recalls the finger instead of reading it, and lights
// up only after a slip or a pause on the current character.
const guideFadeToggle = $<HTMLInputElement>('guide-fade-toggle');
guideFadeToggle.checked = loadGuideFadeSetting();
guideFadeToggle.addEventListener('change', () => {
  saveGuideFadeSetting(guideFadeToggle.checked);
  renderText();
  inputEl.focus();
});
/** Keys that meet the unlock bar, refreshed at the start of each drill. */
let knownKeys = new Set<string>();
/** Position of the latest wrong keystroke, so the guide lights up until it is fixed. */
let slipAt = -1;
let hesitationTimer: ReturnType<typeof setTimeout> | undefined;

function updateFingerGuide(): void {
  clearTimeout(hesitationTimer);
  const ch = session.done ? undefined : [...session.text][session.position];
  const revealed = ch === undefined || !guideFadeToggle.checked || slipAt === session.position ||
    !knownKeys.has(ch.toLowerCase());
  fingerGuide.show(ch, revealed);
  if (!revealed) {
    // A pause of a few typical keystrokes (at least a second) counts as being stuck.
    const wait = Math.max(1000, 3 * (model?.baseline.latencyMs ?? 0));
    hesitationTimer = setTimeout(() => fingerGuide.reveal(), wait);
  }
}

// Offensive-word filter for drills; a new drill starts so the change shows at once.
const wordFilterToggle = $<HTMLInputElement>('word-filter-toggle');
wordFilterToggle.checked = loadWordFilterSetting();
setWordFilterEnabled(wordFilterToggle.checked);
wordFilterToggle.addEventListener('change', () => {
  setWordFilterEnabled(wordFilterToggle.checked);
  saveWordFilterSetting(wordFilterToggle.checked);
  if (!finishing) startDrill('core').catch((err) => console.error('Failed to start drill', err));
  inputEl.focus();
});

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
  updateFingerGuide();
}

function renderStats(): void {
  // Once the drill is done, finishDrill writes the summary.
  if (session.done) return;
  const wpm = session.wpm().toFixed(0);
  const acc = (session.accuracy() * 100).toFixed(1);
  // In accuracy recovery the live speed is hidden so the learner is not tempted to chase it.
  const speed = curriculum?.recovery ? '' : `${wpm} WPM · `;
  statsEl.textContent = `${speed}${acc}% accuracy · ${session.errors} errors`;
}

function flashError(): void {
  const cur = textEl.querySelector('.current');
  cur?.classList.remove('error');
  void (cur as HTMLElement | null)?.offsetWidth; // restart animation
  cur?.classList.add('error');
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
    if (session.done && !finishing && drill && breakEndsAt === null) {
      startDrill().catch((err) => console.error('Failed to start drill', err));
    }
    return;
  }
  // A dead key only starts a composition; the key that completes it is the one logged.
  if (e.key !== 'Dead') lastCode = e.code || null;
  observer.observe(e);
});

function handleChar(ch: string): void {
  const event = session.press(ch, Date.now(), lastCode);
  if (!event) return;
  drillEvents.push(event);
  pendingWrites.push(store.add(event).catch((err) => console.error('Failed to log keystroke', err)));
  if (!event.correct) {
    slipAt = event.position;
    flashError();
  }
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
  if (session.done && !finishing) finishDrill().catch((err) => console.error('Failed to finish drill', err));
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

$('new-text').addEventListener('click', () => {
  if (!finishing) startDrill('core').catch((err) => console.error('Failed to start drill', err));
});

// --- Drills ---
//
// Each drill is written by the adaptive generator (drill.ts) from the
// weakness model. When it is typed, the model is rebuilt and the curriculum
// rules decide on unlocks, tier and pace; the summary shows what changed.

const drillKeysEl = $('drill-keys');
const drillInfoEl = $('drill-info');
const drillCueEl = $('drill-cue');
const feedbackEl = $('drill-feedback');

let curriculum: CurriculumState | null = null;
let model: WeaknessModel | null = null;
let drill: Drill | null = null;
let drillEvents: KeystrokeEvent[] = [];
let pendingWrites: Promise<unknown>[] = [];
/** Set while a finished drill is being scored, so Enter and Skip wait for it. */
let finishing = false;
/** When the last drill was finished; null until one is, so the first drill of a visit opens a session. */
let lastDrillAt: number | null = null;

const corpus = () => getCorpus(context.language);

/** The key's label on the user's layout (from layouts.ts): letters as key caps, capitals as ⇧X, marks and digits as themselves. */
function keyCap(ch: string): string {
  if (ch === ' ') return '␣';
  if (ch === CAPITALS) return '⇧Aa';
  if ([...ch].length > 1) return [...ch].join(' ');
  return charLabel(context.layout, ch);
}

/** The unlock message for a step: a letter, capitals, a mark or a digit. */
function unlockMessage(step: string): string {
  if (step === CAPITALS) {
    return 'Capitals unlocked: hold Shift with the little finger of the other hand, then press the letter. Sentences now start with a capital.';
  }
  const shift = needsShift(step, context.layout) ? ' (with Shift)' : '';
  const what = /^\p{L}$/u.test(step) ? 'letter' : /^\p{Nd}$/u.test(step) ? 'digit' : 'punctuation key';
  return `New ${what} unlocked: ${keyCap(step)}${shift}. Drills lean on it until it is up to speed.`;
}

const showItem = (item: string) => [...item].map((c) => (c === ' ' ? '␣' : c)).join('');

/** The curriculum for the current language and layout, created (with placement from history) on first use. */
async function currentCurriculum(): Promise<CurriculumState> {
  if (curriculum && curriculum.language === context.language && curriculum.layout === context.layout) return curriculum;
  curriculum = loadCurriculum(context);
  if (!curriculum) {
    curriculum = initialCurriculum(corpus(), context, await loadWeaknessModel(store, context));
    saveCurriculum(curriculum);
  }
  return curriculum;
}

async function buildModel(state: CurriculumState): Promise<WeaknessModel> {
  return loadWeaknessModel(store, context, modelOptions(state, corpus()));
}

function renderDrillBar(): void {
  if (!curriculum) return;
  const unlocked = new Set(curriculum.unlocked);
  const frag = document.createDocumentFragment();
  for (const ch of unlockSteps(corpus(), context.layout)) {
    const span = document.createElement('span');
    span.textContent = keyCap(ch);
    span.className = 'key' + (unlocked.has(ch) ? '' : ' locked') + (ch === curriculum.focusKey ? ' focus' : '');
    span.title = ch === curriculum.focusKey ? 'Focus key' : unlocked.has(ch) ? 'Unlocked' : 'Locked';
    frag.append(span);
  }
  drillKeysEl.replaceChildren(frag);
  drillInfoEl.textContent =
    `Level ${curriculum.tier} (${tierWpm(curriculum.tier)} WPM) · target pace ${Math.round(curriculum.paceWpm)} WPM`;
  drillCueEl.hidden = !curriculum.recovery;
  renderPath();
}

// --- Learning path ---
//
// Read-only view of the curriculum: which stage of unlocks you are in, what
// the next unlock waits on, and where this drill sits in the round of drills.

const STAGE_NAMES: Record<StageId, string> = {
  letters: 'Letters', capitals: 'Capitals', punctuation: 'Punctuation', digits: 'Numbers',
};
const PLAN_NAMES = { warmup: 'Warm-up', core: 'Drill', focus: 'Focus burst', sentence: 'Sentences' } as const;
/** Whether this session opened with a warm-up, so the round shows it. */
let warmedUp = false;

/** A chip whose explanation shows on hover or keyboard focus. */
function chip(text: string, cls: string, tip: string): HTMLLIElement {
  const el = Object.assign(document.createElement('li'), { textContent: text, className: cls, tabIndex: 0 });
  el.dataset.tip = tip;
  el.setAttribute('aria-label', `${text}. ${tip}`);
  return el;
}

function renderPath(): void {
  if (!curriculum || !drill) return;
  const path = learningPath(curriculum, corpus(), model);

  // What the next unlock waits on, shown on the current stage.
  let nextTip: string;
  if (path.next === null) {
    nextTip = `Everything is unlocked. Level ${curriculum.tier + 1} comes once your drills average ${tierWpm(curriculum.tier)} WPM at 96% accuracy.`;
  } else {
    const what = path.next === CAPITALS ? 'Capitals unlock' : `Next up: ${keyCap(path.next)}. It unlocks`;
    const bar = `under ${Math.round(DEFAULT_DRILL_PARAMS.unlockMaxErrorRate * 100)}% errors and ${Math.round(tierTargetMs(curriculum.tier))} ms per key or faster`;
    nextTip = `${what} once every key you have is ${bar}. Ready: ${path.ready} of ${path.unlocked}.`;
    if (path.blocking.length > 0) {
      nextTip += ` Still practising: ${path.blocking.slice(0, 8).map(keyCap).join(' ')}${path.blocking.length > 8 ? ' …' : ''}`;
    }
  }
  const stageAbout: Record<StageId, string> = {
    letters: 'Letters unlock a few at a time, most common first.',
    capitals: 'Capitals: Shift plus a letter, practised in short sentences.',
    punctuation: 'Punctuation marks, one at a time, most common first.',
    digits: 'Numbers, one digit at a time.',
  };
  $('path-stages').replaceChildren(...path.stages.map((s) => {
    const count = s.total > 1 ? ` ${s.done}/${s.total}` : '';
    const tip = s.state === 'current' ? `${stageAbout[s.id]} ${nextTip}`
      : s.state === 'done' ? `${stageAbout[s.id]} Done.`
      : `${stageAbout[s.id]} Comes later.`;
    return chip(STAGE_NAMES[s.id] + count, s.state, tip);
  }));

  // Once a drill is done, the round shows the one Enter starts next.
  const kind = session.done ? nextKind(curriculum, drill.kind, { sentences: path.sentencesOpen }) : drill.kind;
  const plan = sessionPlan(curriculum, kind, { warmedUp, sentencesOpen: path.sentencesOpen });
  const focus = curriculum.focusKey === null ? 'your newest key' : keyCap(curriculum.focusKey);
  const about = {
    warmup: 'Easy, common words with keys you have not practised for a while. Does not count toward unlocks or your level.',
    core: 'Built from your weakest keys and letter pairs. Counts toward the next unlock and your level.',
    focus: `A short drill on ${focus} and the letter pairs around it.`,
    sentence: 'Real sentences, so your practice carries over to everyday typing. Adjusts your pace, but not unlocks or level.',
  };
  const status = { done: 'Done.', current: session.done ? 'Up next.' : 'You are here.', upcoming: 'Coming up.' };
  let core = 0;
  $('session-plan').replaceChildren(...plan.map((step) => {
    const name = step.kind === 'core' ? `${PLAN_NAMES.core} ${++core}` : PLAN_NAMES[step.kind];
    const tip = step.state === 'locked'
      ? `${about[step.kind]} Opens at ${path.sentenceLetters} letters (you have ${path.letters}).`
      : `${status[step.state]} ${about[step.kind]}`;
    return chip(name, step.state, tip);
  }));
}

/** Starts a drill of the given kind, or of the kind that comes next in the session. */
async function startDrill(kind?: Drill['kind']): Promise<void> {
  const state = await currentCurriculum();
  const newSession = isNewSession(lastDrillAt, Date.now());
  if (newSession) warmedUp = false;
  kind ??= nextKind(state, drill?.kind ?? null, { newSession, sentences: sentencesReady(state, corpus()) });
  if (kind === 'warmup') warmedUp = true;
  slowOnPurpose = state.recovery;
  hideBreakCard();
  model = await buildModel(state);
  knownKeys = new Set(model.keys.filter((k) => meetsBar(k, state)).map((k) => k.item));
  slipAt = -1;
  drill = nextDrill(model, state, corpus(), kind, Date.now() >>> 0);
  session = new TypingSession(drill.text, context);
  drillEvents = [];
  pendingWrites = [];
  feedbackEl.hidden = true;
  renderDrillBar();
  renderText();
  renderStats();
  inputEl.focus();
}

function describeChange(c: CurriculumChange): string {
  switch (c.type) {
    case 'unlock': return unlockMessage(c.key);
    case 'focus-met': return `${keyCap(c.key)} is up to speed.`;
    case 'stuck': return `${keyCap(c.key)} has been holding you back, so its speed bar is a little lower and it gets extra practice.`;
    case 'tier': return `Level up: level ${c.tier}, aiming for ${tierWpm(c.tier)} WPM.`;
    case 'recovery': return c.on
      ? 'Two drills in a row under 92% accuracy: slow down until you are typing cleanly again.'
      : 'Accuracy is back. Speed is shown again.';
  }
}

function itemList(label: string, items: ItemChange[]): HTMLElement | null {
  if (items.length === 0) return null;
  const p = document.createElement('p');
  p.append(`${label}: `);
  items.forEach((it, i) => {
    if (i) p.append(', ');
    const span = document.createElement('span');
    span.className = 'item';
    span.textContent = it.kind === 'key' ? keyCap(it.item) : showItem(it.item);
    p.append(span);
  });
  return p;
}

async function finishDrill(): Promise<void> {
  if (!drill || !curriculum) return;
  finishing = true;
  try {
    await Promise.all(pendingWrites);
    lastDrillAt = Date.now();
    const result = drillResult(drillEvents);
    const head = `Done: ${result.wpm.toFixed(0)} WPM, ${(result.accuracy * 100).toFixed(1)}% accuracy` +
      ` (target pace ${Math.round(drill.paceWpm)} WPM). Press Enter for the next drill.`;
    statsEl.textContent = head;
    // A layout switch mid-drill moved these keystrokes to another curriculum; just start fresh.
    if (curriculum.layout !== context.layout || curriculum.language !== context.language) return;

    const before = model;
    if (before) {
      fatigue.addDrill(drillEvents, before, drill.kind, slowOnPurpose);
      const signal = fatigue.check();
      if (signal && breakToggle.checked) showBreakCard(signal);
    }
    const after = await buildModel(curriculum);
    const { state, changes } = afterDrill(after, curriculum, corpus(), drill, result);
    curriculum = state;
    saveCurriculum(state);
    model = after;

    const lines: HTMLElement[] = changes.map((c) => Object.assign(document.createElement('p'), { textContent: describeChange(c) }));
    if (before) {
      const { improved, slipped } = drillFeedback(before, after, drill);
      for (const el of [itemList('Improved', improved), itemList('Slipped', slipped)]) if (el) lines.push(el);
    }
    feedbackEl.replaceChildren(...lines);
    feedbackEl.hidden = lines.length === 0;
    renderDrillBar();
  } finally {
    finishing = false;
  }
}

$('reset-lessons').addEventListener('click', () => {
  if (!confirm('Start the lessons over from the first six letters? Your keystroke log is kept.')) return;
  clearCurriculum(context);
  curriculum = initialCurriculum(corpus(), context);
  saveCurriculum(curriculum);
  startDrill('core').catch((err) => console.error('Failed to start drill', err));
});

// --- Break reminders ---
//
// fatigue.ts compares each drill with what the weakness model expects and
// flags a drop against earlier in the same stretch, or a long stretch. The
// suggestion shows under the drill summary; the learner can take the break
// (a countdown) or keep going, which quiets it for a few drills.

const breakToggle = $<HTMLInputElement>('break-toggle');
const breakCard = $('break-card');
const breakText = $('break-text');
const breakTimer = $('break-timer');
const breakStart = $('break-start');
const breakBack = $('break-back');
const breakSkip = $('break-skip');
const fatigue = new FatigueTracker();
/** Whether the current drill was typed in accuracy recovery, where slowing down is the point. */
let slowOnPurpose = false;
/** When the running break ends; null when not on a break. */
let breakEndsAt: number | null = null;
let breakTick: ReturnType<typeof setInterval> | undefined;

breakToggle.checked = loadBreakRemindersSetting();
breakToggle.addEventListener('change', () => {
  saveBreakRemindersSetting(breakToggle.checked);
  if (!breakToggle.checked && breakEndsAt === null) hideBreakCard();
  inputEl.focus();
});

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const BREAK_ADVICE = 'Stand up, shake out your hands and look at something far away.';

function breakMessage(s: FatigueSignal): string {
  switch (s.type) {
    case 'accuracy':
      return `Your accuracy has dropped from ${pct(s.accuracyBefore)} to ${pct(s.accuracyNow)} over the last two drills, ` +
        'measured against how you usually type these keys. That is often tiredness, and practising tired trains in mistakes. ' +
        'A short break now will help more than pushing on.';
    case 'speed':
      return `Your keystrokes are about ${pct(s.slowerBy)} slower over the last two drills than earlier in this session, ` +
        'for the same keys. That is often tiredness. A short break now will help more than pushing on.';
    case 'long':
      return `You have been typing for ${s.minutes} minutes. Short stretches with breaks build skill faster than long ones, ` +
        'so this is a good moment for a pause.';
  }
}

function showBreakCard(signal: FatigueSignal): void {
  breakText.textContent = breakMessage(signal);
  breakTimer.hidden = true;
  breakStart.hidden = false;
  breakBack.hidden = true;
  breakSkip.hidden = false;
  breakCard.hidden = false;
}

function hideBreakCard(): void {
  clearInterval(breakTick);
  breakEndsAt = null;
  breakCard.hidden = true;
}

function renderBreakTimer(): void {
  if (breakEndsAt === null) return;
  const left = Math.max(0, Math.ceil((breakEndsAt - Date.now()) / 1000));
  if (left === 0) {
    clearInterval(breakTick);
    breakTimer.textContent = 'Break over. Press Enter or click below for the next drill.';
    breakBack.textContent = 'Next drill';
    breakEndsAt = null;
    return;
  }
  breakTimer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

breakStart.addEventListener('click', () => {
  breakEndsAt = Date.now() + DEFAULT_FATIGUE_PARAMS.breakMinutes * 60_000;
  breakText.textContent = BREAK_ADVICE;
  breakTimer.hidden = false;
  breakStart.hidden = true;
  breakSkip.hidden = true;
  breakBack.hidden = false;
  breakBack.textContent = "I'm back";
  renderBreakTimer();
  breakTick = setInterval(renderBreakTimer, 1000);
});
breakBack.addEventListener('click', () => {
  // The break counts if it was long enough to rest; a quick return is the same as keeping going.
  const rested = breakEndsAt === null ||
    breakEndsAt - Date.now() <= (DEFAULT_FATIGUE_PARAMS.breakMinutes - DEFAULT_FATIGUE_PARAMS.restMinutes) * 60_000;
  if (rested) fatigue.reset();
  else fatigue.snooze();
  hideBreakCard();
  if (!finishing) startDrill().catch((err) => console.error('Failed to start drill', err));
});
breakSkip.addEventListener('click', () => {
  fatigue.snooze();
  hideBreakCard();
  inputEl.focus();
});

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
  fingerGuide.setLayout(layout);
  renderText();
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
  startDrill().catch((err) => console.error('Failed to start drill', err));
  detectFromBrowser()
    .then(backfillLegacyLog)
    .catch((err) => console.error('Layout detection failed', err));
});
