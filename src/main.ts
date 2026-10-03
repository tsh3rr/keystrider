import '@fontsource-variable/jetbrains-mono';
import { TypingSession } from './session';
import { KeystrokeStore, toCsv } from './store';
import { DEFAULT_LANGUAGE, availableLanguages, getCorpus, guessLanguage, loadCorpus } from './corpus';
import { clearCurriculum, hasAnyCurriculum, loadCurriculum, saveCurriculum } from './curriculum-store';
import {
  CAPITALS, DEFAULT_DRILL_PARAMS, afterDrill, blockingKeys, drillFeedback, drillResult, initialCurriculum, isNewSession, meetsBar, modelOptions, needsShift,
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
import { renderProgress, revealSection, type ProgressSection, type Range } from './progressView';
import { periodTotals, sessionSummaries, startOfWeek, weakest } from './progress';
import { isoDate, loadShareSpeed, pendingInvite, takeInviteFromUrl, type BuddyStats } from './sync/buddies';
import { BuddiesView, InvitePrompt, type BuddiesDeps } from './sync/buddiesView';
import {
  dailyActiveMs, freshStart, goalNews, goalStreak, loadFreshSeen, loadGoal, loadMastered, loadPlan, loadPlanSeen, newBest, newlyMastered,
  planDue, saveFreshSeen, saveGoal, saveMastered, savePlan, savePlanSeen, type FreshStart,
} from './goals';
import { CoachBar, type CoachData } from './coachView';
import { renderResult, type Tone } from './resultCard';
import { Onboarding } from './onboarding';
import {
  backfillDone, loadBreakRemindersSetting, loadOnboardedSetting, saveOnboardedSetting, loadFingerGuideSetting, loadGuideFadeSetting, loadLanguageSetting, loadLayoutSetting,
  loadShowKeysSetting, loadThemeSetting, loadWordFilterSetting, markBackfillDone, saveBreakRemindersSetting, saveFingerGuideSetting,
  saveGuideFadeSetting, saveLanguageSetting, saveLayoutSetting, saveShowKeysSetting, saveThemeSetting, saveWordFilterSetting,
  loadUiLanguageSetting, saveUiLanguageSetting,
  type LayoutSetting, type Theme,
} from './settings';
import type { KeystrokeEvent, PracticeContext } from './types';
import { setWordFilterEnabled } from './wordfilter';
import { Account } from './sync/account';
import { AccountView, benefits } from './sync/accountView';
import { ProfileView } from './sync/profileView';
import {
  UI_LANGUAGES, applyTranslations, guessUiLanguage, isUiLanguage, num, onUiLanguageChange, pct, setUiLanguage, t, tMaybe, tNodes, uiLanguage,
} from './i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const textEl = $('text');
const inputEl = $<HTMLTextAreaElement>('input');
const logRows = $('log-rows');
const logSummary = $('log-summary');

const LOG_TABLE_LIMIT = 500;

const locales = navigator.languages?.length ? navigator.languages : [navigator.language];

// Interface language: the learner's pick, else the browser's language if we have it, else English.
const savedUiLanguage = loadUiLanguageSetting();
setUiLanguage(isUiLanguage(savedUiLanguage) ? savedUiLanguage : guessUiLanguage(locales));
document.documentElement.lang = uiLanguage();
applyTranslations();
// Until a key is pressed or the browser reports the layout, guess from the browser language.
let layoutSetting: LayoutSetting = loadLayoutSetting() ?? { layout: guessFromLocale(locales), source: 'guessed' };

// The picked language; on a first visit the browser language, but a browser
// that already practised before the picker existed keeps English.
const savedLanguage = loadLanguageSetting();
const startLanguage = savedLanguage && availableLanguages().some((c) => c.language === savedLanguage)
  ? savedLanguage
  : hasAnyCurriculum() ? DEFAULT_LANGUAGE : guessLanguage(locales);
const context: PracticeContext = { language: startLanguage, layout: layoutSetting.layout };

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
  // The drill's single-key targets are underlined until typed.
  const focusKeys = new Set(drill?.targets.filter((k) => [...k].length === 1) ?? []);
  // Spread by code point so positions line up with TypingSession.position.
  [...session.text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch;
    const cls: string[] = [];
    if (i < session.position) cls.push('typed');
    else if (i === session.position) cls.push('current');
    // A wrong key holds the position, so the slip stays marked until it is fixed.
    if (i === session.position && slipAt === i) cls.push('error');
    if (i > session.position && focusKeys.has(ch.toLowerCase())) cls.push('focus');
    if (ch === ' ') cls.push('sp');
    span.className = cls.join(' ');
    frag.append(span);
  });
  textEl.replaceChildren(frag);
  if (centredText !== session.text) centreText();
  updateFingerGuide();
}

/**
 * Lines stay left-aligned, but the block shifts so the longest line sits in
 * the middle; otherwise the empty space after short lines makes it look off-centre.
 */
let centredText = '';
function centreText(): void {
  centredText = session.text;
  textEl.style.transform = '';
  const box = textEl.getBoundingClientRect();
  let left = Infinity;
  let right = -Infinity;
  for (const span of textEl.children) {
    if (span.classList.contains('sp')) continue;
    const r = span.getBoundingClientRect();
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  if (!Number.isFinite(left) || box.width === 0) return;
  const shift = (box.right - right - (left - box.left)) / 2;
  if (shift > 1) textEl.style.transform = `translateX(${shift.toFixed(1)}px)`;
}
new ResizeObserver(() => centreText()).observe(textEl.parentElement ?? textEl);

/** Live speed and accuracy for the coach bar's speed chip. */
function nowData(): CoachData['now'] {
  const started = drillEvents.length > 0;
  // In accuracy recovery the live speed is hidden so the learner is not tempted to chase it.
  const recovery = curriculum?.recovery ?? false;
  return {
    wpm: started && !recovery ? Math.round(session.wpm()) : null,
    accuracy: started ? session.accuracy() : null,
    usualWpm: model && model.baseline.attempts > 0 ? Math.round(model.baseline.wpm) : null,
    recovery,
    level: curriculum
      ? t('now.level', { tier: curriculum.tier, wpm: tierWpm(curriculum.tier), pace: Math.round(drill?.paceWpm ?? curriculum.paceWpm) })
      : '',
    weakest: model ? weakest(model.keys, 10, 5).map((k) => ({ label: keyCap(k.item), errorRate: k.errorRate })) : [],
  };
}

function renderStats(): void {
  // Once the drill is done, finishDrill writes the summary.
  if (session.done) return;
  coach.updateNow(nowData());
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
  // Esc skips the drill, unless it is closing a bubble, menu or the settings first.
  if (e.key === 'Escape' && !coach.isOpen && menus.every((m) => m.menu.hidden) && drawer.hidden) {
    if (!session.done && !finishing) startDrill('core').catch((err) => console.error('Failed to start drill', err));
    return;
  }
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
  coach.close(false);
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
// Before the first key (or after clicking away) the text is dimmed under a "click or press any key" pill.
const startPill = $('start-pill');
inputEl.addEventListener('focus', () => { textEl.classList.add('focused'); startPill.hidden = true; });
inputEl.addEventListener('blur', () => { textEl.classList.remove('focused'); startPill.hidden = false; });
textEl.addEventListener('click', () => inputEl.focus());
startPill.addEventListener('click', () => inputEl.focus());
// Any printable key starts typing: focusing the field here lets the same key land in it.
document.addEventListener('keydown', (e) => {
  if (document.activeElement !== document.body || e.ctrlKey || e.metaKey || e.altKey || [...e.key].length !== 1) return;
  if (practiceView.hidden || session.done || coach.isOpen || !drawer.hidden || menus.some((m) => !m.menu.hidden)) return;
  inputEl.focus();
});

$('new-text').addEventListener('click', () => {
  if (!finishing) startDrill('core').catch((err) => console.error('Failed to start drill', err));
});

// --- Drills ---
//
// Each drill is written by the adaptive generator (drill.ts) from the
// weakness model. When it is typed, the model is rebuilt and the curriculum
// rules decide on unlocks, tier and pace; the summary shows what changed.

const drillKeysEl = $('drill-keys');
const drillCueEl = $('drill-cue');
const drillFocusEl = $('drill-focus');
const resultEl = $('result');
const practiceView = $('practice-view');

let curriculum: CurriculumState | null = null;
let model: WeaknessModel | null = null;
let drill: Drill | null = null;
let drillEvents: KeystrokeEvent[] = [];
let pendingWrites: Promise<unknown>[] = [];
/** Set while a finished drill is being scored, so Enter and Skip wait for it. */
let finishing = false;
/** When the last drill was finished; null until one is, so the first drill of a visit opens a session. */
let lastDrillAt: number | null = null;
/** Redraws the results card on screen; null while there is none. */
let redrawResult: (() => void) | null = null;

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
  if (step === CAPITALS) return t('unlock.capitals');
  const shift = needsShift(step, context.layout);
  const what = /^\p{L}$/u.test(step) ? 'letter' : /^\p{Nd}$/u.test(step) ? 'digit' : 'mark';
  return t(`unlock.${what}${shift ? 'Shift' : ''}`, { key: keyCap(step) });
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
  const mastered = masteredSteps();
  const frag = document.createDocumentFragment();
  for (const ch of unlockSteps(corpus(), context.layout)) {
    const span = document.createElement('span');
    span.textContent = keyCap(ch);
    const star = unlocked.has(ch) && mastered.has(ch) && ch !== curriculum.focusKey;
    span.className = 'key' + (unlocked.has(ch) ? '' : ' locked') + (ch === curriculum.focusKey ? ' focus' : '') + (star ? ' mastered' : '');
    span.title = t(ch === curriculum.focusKey ? 'keys.focus' : star ? 'keys.mastered' : unlocked.has(ch) ? 'keys.unlocked' : 'keys.locked');
    frag.append(span);
  }
  drillKeysEl.replaceChildren(frag);
  fingerGuide.setUnlocked(unlocked);
  drillCueEl.hidden = !curriculum.recovery;
  renderCoach();
}

// --- Coach bar ---
//
// Read-only view of the curriculum and the session: which stage of unlocks
// you are in and what the next unlock waits on, where this drill sits in the
// round, live speed, and the break check. Each chip opens its own details.

const stageName = (id: StageId) => t(`stage.${id}`);
/** A drill in the round; core drills are numbered ("Drill 2"). */
interface RoundStep { kind: Drill['kind']; n: number }
const stepName = (step: RoundStep) => (step.kind === 'core' && step.n > 0 ? t('plan.coreN', { n: step.n }) : t(`plan.${step.kind}`));
/** Whether this session opened with a warm-up, so the round shows it. */
let warmedUp = false;
/** The drill in the round that is being typed, or that Enter starts once it is done. */
let roundStep: RoundStep | null = null;

const coach = new CoachBar(
  document.querySelector<HTMLElement>('.coach-bar')!,
  $('coach-pop'),
  (section) => showView('progress', section),
  () => inputEl.focus(),
);
/** The last path summary the coach showed; the Progress page repeats it in its path card. */
let coachPath: CoachData['path'] | null = null;

function renderCoach(): void {
  if (!curriculum || !drill) return;
  const path = learningPath(curriculum, corpus(), model);

  // What the next unlock waits on.
  let nextTip: string;
  if (path.next === null) {
    nextTip = t('path.allUnlocked', { next: curriculum.tier + 1, wpm: tierWpm(curriculum.tier), acc: pct(0.96) });
  } else {
    const bar = {
      err: pct(DEFAULT_DRILL_PARAMS.unlockMaxErrorRate),
      ms: Math.round(tierTargetMs(curriculum.tier)),
      ready: path.ready,
      unlocked: path.unlocked,
    };
    nextTip = path.next === CAPITALS ? t('path.nextCapitals', bar) : t('path.nextKey', { ...bar, key: keyCap(path.next) });
    if (path.blocking.length > 0) {
      nextTip += ' ' + t('path.blocking', {
        keys: path.blocking.slice(0, 8).map(keyCap).join(' ') + (path.blocking.length > 8 ? ' …' : ''),
      });
    }
  }
  const current = path.stages.find((st) => st.state === 'current') ?? path.stages[path.stages.length - 1];

  // Once a drill is done, the round shows the one Enter starts next.
  const kind = session.done ? nextKind(curriculum, drill.kind, { sentences: path.sentencesOpen }) : drill.kind;
  const plan = sessionPlan(curriculum, kind, { warmedUp, sentencesOpen: path.sentencesOpen });
  const focus = curriculum.focusKey === null ? t('round.newestKey') : keyCap(curriculum.focusKey);
  const about = t(`round.about.${kind}`, { focus });
  let core = 0;
  const rounds = plan.map((step) => ({ kind: step.kind, n: step.kind === 'core' ? ++core : 0 }));
  const steps = plan.map((step, i) => ({ name: stepName(rounds[i]), state: step.state }));
  const at = Math.max(0, plan.findIndex((step) => step.state === 'current'));
  roundStep = rounds[at];
  const currentStep = steps[at];
  const sentenceNote = plan.some((step) => step.kind === 'sentence' && step.state === 'locked')
    ? ' ' + t('round.sentencesLocked', { need: path.sentenceLetters, have: path.letters }) : '';

  coachPath = {
    stage: stageName(current.id),
    done: current.done,
    total: current.total,
    next: path.next === null ? null : keyCap(path.next),
    stages: path.stages.map((st) => ({ name: stageName(st.id), done: st.done, total: st.total, state: st.state })),
    about: nextTip,
  };
  // Name the drill's target keys above the text; a finished drill's next targets are not known yet.
  const leans = session.done || kind === 'warmup' || kind === 'sentence'
    ? [] : drill.targets.filter((k) => [...k].length === 1).slice(0, 3);
  // Hidden but kept in the layout, so the text below does not jump between drills.
  drillFocusEl.classList.toggle('is-empty', leans.length === 0);
  const keysEl = document.createElement('span');
  keysEl.className = 'focus-keys';
  for (const k of leans) keysEl.append(Object.assign(document.createElement('kbd'), { textContent: keyCap(k) }));
  drillFocusEl.replaceChildren(...tNodes('practice.leansOn', { keys: keysEl }));
  coach.update({
    path: coachPath,
    round: {
      steps,
      current: session.done ? t('round.next', { name: currentStep.name }) : currentStep.name,
      about: (session.done ? t('round.upNext') + ' ' : '') + about + sentenceNote,
      // Targets of the drill being typed; a finished drill's next targets are not known yet.
      focus: session.done || kind === 'warmup' || kind === 'sentence'
        ? [] : drill.targets.slice(0, 6).map((t) => ([...t].length === 1 ? keyCap(t) : showItem(t))),
    },
    now: nowData(),
    fresh: {
      enabled: breakToggle.checked,
      minutes: fatigue.practiceMinutes(),
      due: !breakCard.hidden,
      longMinutes: DEFAULT_FATIGUE_PARAMS.longStretchMinutes,
    },
  });
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
  resultEl.hidden = true;
  accountNudge.hidden = true;
  redrawResult = null;
  practiceView.classList.remove('showing-result');
  renderDrillBar();
  renderText();
  renderStats();
  // Not while the account panel is open, e.g. right after setup ended with "Create account".
  if ($('account-pop').hidden) inputEl.focus();
}

function describeChange(c: CurriculumChange): string {
  switch (c.type) {
    case 'unlock': return unlockMessage(c.key);
    case 'focus-met': return t('change.focusMet', { key: keyCap(c.key) });
    case 'stuck': return t('change.stuck', { key: keyCap(c.key) });
    case 'tier': return t('change.tier', { tier: c.tier, wpm: tierWpm(c.tier) });
    case 'recovery': return c.on ? t('change.recoveryOn', { acc: pct(0.92) }) : t('change.recoveryOff');
  }
}

function changeTone(c: CurriculumChange): Tone {
  switch (c.type) {
    case 'unlock': case 'tier': return 'win';
    case 'focus-met': return 'good';
    case 'stuck': return 'info';
    case 'recovery': return c.on ? 'warn' : 'good';
  }
}

const itemLabel = (it: ItemChange) => (it.kind === 'key' ? keyCap(it.item) : showItem(it.item));

// --- Milestones: goal reached, personal best, key mastered ---
//
// Feedback about the learner's own progress, added to the drill summary.
// No points: each line says what was achieved (see goals.ts).

interface Milestone { tone: Tone; text: () => string }

/** Steps that meet the unlock bar in `m`. */
const knownSteps = (m: WeaknessModel, state: CurriculumState) => {
  const blocking = new Set(blockingKeys(m, state));
  return state.unlocked.filter((k) => !blocking.has(k));
};

function masteredSteps(): Set<string> {
  return loadMastered(context.language, context.layout) ?? new Set();
}

async function milestones(
  before: WeaknessModel | null, after: WeaknessModel, state: CurriculumState, changes: CurriculumChange[], sessionId: string | undefined,
): Promise<Milestone[]> {
  const out: Milestone[] = [];
  try {
    const now = Date.now();
    // The weekly goal counts every language; only this week's typing is needed to see it reached.
    const week = sessionSummaries(await store.since(startOfWeek(now)));
    const g = goalNews(dailyActiveMs(week.filter((x) => x.sessionId !== sessionId)), dailyActiveMs(week), goal, now);
    if (g.weekMet) {
      const streak = goalStreak(dailyActiveMs(sessionSummaries(await store.all())), goal, now).current;
      out.push({ tone: 'win', text: () => t('goal.weekDone', { days: goal.days }) + ' ' + t('goal.streak', { n: streak }) });
    } else if (g.dayMet) {
      const st = goalStreak(dailyActiveMs(week), goal, now);
      out.push({ tone: 'good', text: () => t('goal.dayDone', { min: goal.minutes, n: st.daysThisWeek, goal: goal.days }) });
    }

    if (sessionId) {
      const best = newBest(sessionSummaries(await store.forLanguage(context.language, context.layout)), sessionId);
      if (best) {
        out.push({ tone: 'win', text: () => t('best.new', { wpm: Math.round(best.wpm), previous: Math.round(best.previous) }) });
      }
    }

    // Keys meeting the bar for the first time. The first check only records (see newlyMastered).
    let stored = loadMastered(context.language, context.layout);
    if (!stored && before) stored = newlyMastered(knownSteps(before, state), null).all;
    const { added, all } = newlyMastered(knownSteps(after, state), stored);
    saveMastered(context.language, context.layout, all);
    // The focus key already gets its own line.
    const focusMet = new Set(changes.flatMap((c) => (c.type === 'focus-met' ? [c.key] : [])));
    const shown = added.filter((k) => !focusMet.has(k));
    if (shown.length) {
      const keys = shown.slice(0, 8).map(keyCap).join(' ') + (shown.length > 8 ? ` +${shown.length - 8}` : '');
      out.push({ tone: 'win', text: () => t('milestone.mastered', { n: shown.length, keys }) });
    }
  } catch (err) {
    console.error('Failed to check milestones', err);
  }
  return out;
}

async function finishDrill(): Promise<void> {
  if (!drill || !curriculum) return;
  finishing = true;
  try {
    await Promise.all(pendingWrites);
    lastDrillAt = Date.now();
    hideFreshStart();
    const result = drillResult(drillEvents);
    const finished = drill;
    const typed: RoundStep = roundStep ?? { kind: finished.kind, n: 0 };
    const errors = session.errors;
    const recovery = curriculum.recovery;
    // Kept so a switch of interface language can redraw the card in the new language.
    const show = (
      changes: CurriculumChange[], improved: ItemChange[], slipped: ItemChange[], next: RoundStep | null, extra: Milestone[] = [],
    ) => {
      redrawResult = () => renderResult(resultEl, {
        drillName: stepName(typed), wpm: result.wpm, accuracy: result.accuracy, errors, paceWpm: finished.paceWpm,
        recovery, news: [
          ...changes.map((c) => ({ tone: changeTone(c), text: describeChange(c) })),
          ...extra.map((m) => ({ tone: m.tone, text: m.text() })),
        ],
        improved: improved.map(itemLabel), slipped: slipped.map(itemLabel), next: next && stepName(next),
        nextKey: next?.kind === 'focus' && curriculum?.focusKey ? keyCap(curriculum.focusKey) : null,
      }, () => {
        if (!finishing && breakEndsAt === null) startDrill().catch((err) => console.error('Failed to start drill', err));
      });
      redrawResult();
      practiceView.classList.add('showing-result');
    };
    // A layout switch mid-drill moved these keystrokes to another curriculum; just start fresh.
    if (curriculum.layout !== context.layout || curriculum.language !== context.language) {
      show([], [], [], null);
      return;
    }

    const before = model;
    if (before) {
      fatigue.addDrill(drillEvents, before, finished.kind, slowOnPurpose);
      const signal = fatigue.check();
      if (signal && breakToggle.checked) showBreakCard(signal);
    }
    const after = await buildModel(curriculum);
    const { state, changes } = afterDrill(after, curriculum, corpus(), finished, result);
    curriculum = state;
    saveCurriculum(state);
    model = after;

    const { improved, slipped } = before ? drillFeedback(before, after, finished) : { improved: [], slipped: [] };
    const extra = await milestones(before, after, state, changes, drillEvents[0]?.sessionId);
    renderDrillBar();
    show(changes, improved, slipped, roundStep, extra);
    account.push().catch((err) => console.error('Sync failed', err));
    if (account.inBuddyGroup) buddyDeps.stats().then((st) => account.publishBuddyStats(st)).catch((err) => console.error('Failed to update buddies', err));
    maybeNudge(state.coreDrills);
  } finally {
    finishing = false;
  }
}

$('reset-lessons').addEventListener('click', () => {
  if (!confirm(t('settings.resetConfirm'))) return;
  closeSettings(false);
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
  renderCoach();
});

/** The signal behind the break suggestion on screen, so it can be redrawn in another language. */
let breakSignal: FatigueSignal | null = null;

function breakMessage(s: FatigueSignal): string {
  switch (s.type) {
    case 'accuracy': return t('break.accuracy', { before: pct(s.accuracyBefore), now: pct(s.accuracyNow) });
    case 'speed': return t('break.speed', { slower: pct(s.slowerBy) });
    case 'long': return t('break.long', { n: s.minutes });
  }
}

/** Fills the break card's text for the step it is in: suggestion, countdown, or over. */
function renderBreakText(): void {
  breakStart.textContent = t('break.start', { n: DEFAULT_FATIGUE_PARAMS.breakMinutes });
  if (breakTimer.hidden) {
    if (breakSignal) breakText.textContent = breakMessage(breakSignal);
    return;
  }
  breakText.textContent = t('break.advice');
  if (breakEndsAt === null) {
    breakTimer.textContent = t('break.over');
    breakBack.textContent = t('break.next');
  } else {
    breakBack.textContent = t('break.back');
  }
}

function showBreakCard(signal: FatigueSignal): void {
  breakSignal = signal;
  breakText.textContent = breakMessage(signal);
  breakTimer.hidden = true;
  breakStart.hidden = false;
  breakBack.hidden = true;
  breakSkip.hidden = false;
  breakCard.hidden = false;
  renderCoach();
}

function hideBreakCard(): void {
  clearInterval(breakTick);
  breakEndsAt = null;
  breakCard.hidden = true;
  renderCoach();
}

function renderBreakTimer(): void {
  if (breakEndsAt === null) return;
  const left = Math.max(0, Math.ceil((breakEndsAt - Date.now()) / 1000));
  if (left === 0) {
    clearInterval(breakTick);
    breakEndsAt = null;
    renderBreakText();
    return;
  }
  breakTimer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

breakStart.addEventListener('click', () => {
  breakEndsAt = Date.now() + DEFAULT_FATIGUE_PARAMS.breakMinutes * 60_000;
  breakTimer.hidden = false;
  breakStart.hidden = true;
  breakSkip.hidden = true;
  breakBack.hidden = false;
  renderBreakText();
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

// --- Practice language ---
//
// Each language has its own curriculum and its own slice of the keystroke
// log (both keyed by language and layout), so switching back and forth
// keeps progress in each.

// A thin bar along the top while a language's words are fetched; only on a
// slow connection, so a quick load doesn't flash.
const loadBar = $('load-bar');
let loadsInFlight = 0;

async function withLoadBar<T>(work: Promise<T>): Promise<T> {
  loadsInFlight++;
  const show = setTimeout(() => { loadBar.hidden = false; }, 150);
  try {
    return await work;
  } finally {
    clearTimeout(show);
    if (--loadsInFlight === 0) loadBar.hidden = true;
  }
}

/** The language most recently picked, while its corpus is still being fetched. */
let pendingLanguage: string | null = null;

/**
 * Switches the practice language once its corpus is loaded (so everything
 * working in `context.language` can read it synchronously) and, unless
 * `start` is false, starts a drill in it.
 */
async function setLanguage(language: string, start = true): Promise<void> {
  // A finished drill is still being scored under the old language: keep it.
  if (finishing || language === (pendingLanguage ?? context.language)) return;
  pendingLanguage = language;
  try {
    await withLoadBar(loadCorpus(language));
  } catch (err) {
    if (pendingLanguage === language) pendingLanguage = null;
    throw err;
  }
  // A later pick wins; a drill that finished meanwhile is scored under the old language.
  if (pendingLanguage !== language || finishing) return;
  pendingLanguage = null;
  context.language = language;
  saveLanguageSetting(context.language);
  // The fatigue yardstick is a model of the old language's keys.
  fatigue.reset();
  drill = null;
  renderLanguage();
  if (start) startDrill().catch((err) => console.error('Failed to start drill', err));
}

function renderLanguage(): void {
  const lang = availableLanguages().find((c) => c.language === context.language);
  $('language-name').textContent = lang?.name ?? context.language;
  $('language-options').replaceChildren(...availableLanguages().map((c) =>
    menuItem(c.name, '', c.language === context.language, () => {
      setLanguage(c.language).catch((err) => console.error('Failed to switch language', err));
    })));
}

// --- Keyboard layout ---
//
// Three sources, strongest last: the browser language (a guess), the
// browser's Keyboard API (Chrome/Edge report the OS layout directly), and
// the keys the user actually presses (which physical key produced which
// character). The user can always override in the picker; after that,
// detection only suggests a switch instead of making it.

const layoutStatus = $('layout-status');
const suggestBox = $('layout-suggest');
const observer = new KeyObserver();
let suggested: string | null = null;
/** Suggestions the user answered "Keep mine" to, so they are not asked again this visit. */
const declined = new Set<string>();

const layoutName = (id: string) => tMaybe(`layout.${id}`) ?? getLayout(id)?.name ?? id;
/** Short name for the top bar: the letter order ("QWERTZ") when the name ends in one, else the whole name. */
const layoutShortName = (id: string) => {
  const name = layoutName(id);
  return /\b(QWERTY|QWERTZ|AZERTY)$/.exec(name)?.[1] ?? name;
};

function renderLayout(): void {
  $('layout-name').textContent = layoutShortName(layoutSetting.layout);
  $('context-btn').title = `${t('menu.practiceLanguage')} · ${t('menu.layoutTitle', { name: layoutName(layoutSetting.layout) })}`;
  $('layout-options').replaceChildren(...LAYOUTS.map((l) => menuItem(layoutName(l.id), '', l.id === layoutSetting.layout, () => {
    setLayout(l.id, 'user').catch((err) => console.error('Failed to update layout', err));
  })));
  layoutStatus.textContent = t(`layout.source.${layoutSetting.source}`);
}

function showSuggestion(id: string | null): void {
  suggested = id;
  suggestBox.hidden = id === null;
  if (id !== null) {
    $('layout-suggest-text').textContent =
      t('layout.suggest', { detected: layoutName(id), current: layoutName(layoutSetting.layout) });
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
  onboarding.layoutChanged();
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
    t('log.summary', { keys: num(events.length), errors: num(errors), sessions: num(sessions) }) +
    (events.length > LOG_TABLE_LIMIT ? ' ' + t('log.showingLatest', { n: num(LOG_TABLE_LIMIT) }) : '');

  const frag = document.createDocumentFragment();
  for (const e of events.slice(-LOG_TABLE_LIMIT).reverse()) {
    const tr = document.createElement('tr');
    if (!e.correct) tr.className = 'wrong';
    const cells = [
      new Date(e.timestamp).toLocaleTimeString(uiLanguage()),
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
  const synced = account.state.signedIn;
  if (!confirm(t(synced ? 'log.clearConfirmSynced' : 'log.clearConfirm'))) return;
  if (synced) {
    // Server first: otherwise the next sync would bring the deleted rounds back.
    try {
      await account.clearRemoteSessions();
    } catch (err) {
      console.error('Failed to clear synced keystrokes', err);
      alert(t('log.clearFailed'));
      return;
    }
  }
  await store.clear();
  await renderLog();
});

// --- Progress ---

/** Practice days a week and minutes a day; per device, like the other settings. */
let goal = loadGoal();

const RANGE_KEY = 'typing-trainer.progressRange';
let progressRange: Range = 30;
try {
  const saved = localStorage.getItem(RANGE_KEY);
  if (saved === '7' || saved === '30') progressRange = Number(saved) as Range;
  else if (saved === 'all') progressRange = 'all';
} catch { /* storage blocked: keep the default */ }

/** Renders the Progress page, then scrolls to the card a coach bubble asked for. */
async function showProgress(section?: ProgressSection): Promise<void> {
  try {
    const lang = availableLanguages().find((c) => c.language === context.language)?.name ?? context.language;
    await renderProgress(store, context, {
      range: progressRange, contextName: `${lang} · ${layoutName(context.layout)}`, path: coachPath,
      goal, onGoal: (g) => {
        goal = g;
        saveGoal(g);
        void showProgress();
      },
      plan: loadPlan(),
      onPlan: (p) => {
        savePlan(p);
        void showProgress();
      },
      mastered: masteredSteps(),
    });
    // With no practice in this language yet the rest of the page is hidden; the buddies card stays.
    const buddiesCard = $('progress-buddies');
    if ($('progress-body').hidden) $('progress-empty').after(buddiesCard);
    else $('progress-week').after(buddiesCard);
    void buddiesView.refresh();
    if (section) revealSection(section);
  } catch (err) {
    console.error('Failed to render progress', err);
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
  b.addEventListener('click', () => {
    const v = b.dataset.range!;
    progressRange = v === 'all' ? 'all' : (Number(v) as Range);
    try { localStorage.setItem(RANGE_KEY, v); } catch { /* not remembered */ }
    void showProgress();
  }),
);
$('progress-start').addEventListener('click', () => showView('practice'));

// --- Navigation, menus and settings ---

type View = 'practice' | 'progress' | 'log' | 'profile';

function showView(view: View, section?: ProgressSection): void {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  coach.close(false);
  $('practice-view').hidden = view !== 'practice';
  $('log-view').hidden = view !== 'log';
  $('progress-view').hidden = view !== 'progress';
  $('profile-view').hidden = view !== 'profile';
  if (view === 'log') renderLog();
  else if (view === 'profile') {
    profileView.render();
    profileView.focus();
  }
  else if (view === 'progress') void showProgress(section);
  else inputEl.focus();
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view as View));
});
$('log-back').addEventListener('click', () => showView('practice'));
$('profile-back').addEventListener('click', () => showView('practice'));

/** One choice in a top-bar menu, with a tick on the current one. */
function menuItem(label: string, detail: string, checked: boolean, pick: () => void): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'menu-item' });
  b.setAttribute('role', 'menuitemradio');
  b.setAttribute('aria-checked', String(checked));
  b.append(label);
  if (detail) b.append(Object.assign(document.createElement('small'), { textContent: detail }));
  b.addEventListener('click', () => {
    closeMenus();
    pick();
    inputEl.focus();
  });
  return b;
}

const menus = [
  { btn: $('context-btn'), menu: $('context-menu') },
  { btn: $('account-btn'), menu: $('account-pop') },
];

function closeMenus(): void {
  for (const m of menus) {
    m.menu.hidden = true;
    m.btn.setAttribute('aria-expanded', 'false');
  }
}

for (const m of menus) {
  m.btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = m.menu.hidden;
    closeMenus();
    coach.close(false);
    m.menu.hidden = !open;
    m.btn.setAttribute('aria-expanded', String(open));
    if (open && m.menu.id === 'account-pop') accountView.focus();
    else if (open) m.menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });
  m.menu.addEventListener('click', (e) => e.stopPropagation());
}

const drawer = $('settings-drawer');
const settingsBtn = $('settings-btn');

function openSettings(): void {
  closeMenus();
  coach.close(false);
  drawer.hidden = false;
  settingsBtn.setAttribute('aria-expanded', 'true');
  $('settings-close').focus();
}

function closeSettings(refocus = true): void {
  if (drawer.hidden) return;
  drawer.hidden = true;
  settingsBtn.setAttribute('aria-expanded', 'false');
  if (refocus) inputEl.focus();
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (drawer.hidden) openSettings();
  else closeSettings();
});
$('settings-close').addEventListener('click', () => closeSettings());
drawer.addEventListener('click', (e) => e.stopPropagation());
$('open-log').addEventListener('click', () => {
  closeSettings(false);
  showView('log');
});

document.addEventListener('click', () => {
  closeMenus();
  closeSettings(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const menuOpen = menus.some((m) => !m.menu.hidden);
  if (menuOpen) {
    closeMenus();
    inputEl.focus();
  } else closeSettings();
});

// Theme: follows the system unless the learner picks light or dark.
let theme: Theme = loadThemeSetting();

function applyTheme(): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.themeChoice === theme)));
}

document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((b) => {
  b.addEventListener('click', () => {
    theme = b.dataset.themeChoice as Theme;
    saveThemeSetting(theme);
    applyTheme();
  });
});
applyTheme();

// --- First-run setup ---
//
// Keyboard check, where to start (with an optional placement test) and how
// the method works; see onboarding.ts. Shown once on a first visit, and
// again from Settings. The top bar stays out of the way meanwhile.

const onboarding = new Onboarding($('onboarding-view'), {
  context: () => context,
  layoutSource: () => layoutSetting.source,
  hasLessons: () => loadCurriculum(context) !== null,
  setLanguage: (language) => setLanguage(language, false),
  setLayout,
  log: (event) => store.add(event),
  signedIn: () => account.state.signedIn,
  // Deferred past the click, which would otherwise reach the document and close the panel again.
  openAccount: (kind) => setTimeout(() => openAccount(kind), 0),
  finish: (lessons) => {
    saveOnboardedSetting();
    // Saved even when it was only guessed, so the next visit keeps it (see startLanguage).
    saveLanguageSetting(context.language);
    document.body.classList.remove('onboarding');
    practiceView.hidden = false;
    if (lessons) {
      saveCurriculum(lessons);
      curriculum = lessons;
    }
    startDrill(lessons ? 'core' : undefined).catch((err) => console.error('Failed to start drill', err));
  },
}, locales);

function openOnboarding(): void {
  showView('practice');
  closeSettings(false);
  practiceView.hidden = true;
  document.body.classList.add('onboarding');
  onboarding.open();
}

$('rerun-setup').addEventListener('click', openOnboarding);

// Interface language: every string on screen is redrawn in place, so a drill in progress carries on.
const uiLanguageEl = $('ui-language');

/** "auto" follows the browser language; otherwise the language the learner picked. */
let uiChoice: string = isUiLanguage(savedUiLanguage) ? savedUiLanguage : 'auto';

function renderUiLanguagePicker(): void {
  const choices = [{ id: 'auto', name: t('settings.uiAuto') }, ...UI_LANGUAGES];
  uiLanguageEl.replaceChildren(...choices.map((l) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: l.name });
    b.setAttribute('role', 'radio');
    if (isUiLanguage(l.id)) b.setAttribute('lang', l.id);
    else b.title = t('settings.uiAutoTitle');
    b.setAttribute('aria-checked', String(l.id === uiChoice));
    b.addEventListener('click', () => {
      uiChoice = l.id;
      saveUiLanguageSetting(l.id);
      setUiLanguage(isUiLanguage(l.id) ? l.id : guessUiLanguage(locales));
      // The language may not change (e.g. Automatic picks the one already shown); the choice did.
      renderUiLanguagePicker();
    });
    return b;
  }));
}
renderUiLanguagePicker();
renderBreakText();

onUiLanguageChange(() => {
  applyTranslations();
  renderUiLanguagePicker();
  renderLayout();
  if (suggested) showSuggestion(suggested);
  fingerGuide.retranslate();
  onboarding.languageChanged();
  renderDrillBar();
  renderStats();
  redrawResult?.();
  renderBreakText();
  renderBreakTimer();
  accountView.render();
  profileView.render();
  if (!accountNudge.hidden) renderNudge();
  renderFreshStart();
  buddiesView.render();
  invitePrompt.retranslate();
  if (!$('progress-view').hidden) void showProgress();
  if (!$('log-view').hidden) renderLog().catch((err) => console.error('Failed to render log', err));
});

// --- Account and sync (optional) ---
//
// Signed in, finished rounds and curricula are copied between devices; see
// sync/account.ts. Signed out, nothing here talks to a server.

const account = new Account({
  store: () => store,
  activeSession: () => (session.done ? null : session.id),
  dataChanged: () => {
    // Another device practised: pick up its curriculum and redraw what shows history.
    curriculum = loadCurriculum(context) ?? curriculum;
    // Signed in during first-run setup on a new device: the lessons came along, so the setup is done.
    if (document.body.classList.contains('onboarding') && loadCurriculum(context)) onboarding.dismiss();
    renderDrillBar();
    if (!$('progress-view').hidden) void showProgress();
    if (!$('log-view').hidden) renderLog().catch((err) => console.error('Failed to render log', err));
  },
  stateChanged: (state) => {
    accountView.update(state);
    profileView.update(state);
    // Came in through a password-reset link: the new password is chosen there.
    if (state.signedIn && state.choosePassword && $('profile-view').hidden) showView('profile');
    if (state.signedIn) accountNudge.hidden = true;
    onboarding.accountChanged();
    buddiesView.update(state);
    invitePrompt.update(state);
  },
});
// --- Training buddies ---
//
// Friends in a small group see each other's weekly goal and streak (see
// sync/buddies.ts). Only with an account, and only for people who joined
// through an invite link.

takeInviteFromUrl();
const buddyDeps: BuddiesDeps = {
  stats: async (): Promise<BuddyStats> => {
    const now = Date.now();
    const sessions = sessionSummaries(await store.all());
    const st = goalStreak(dailyActiveMs(sessions), goal, now);
    const wpm = periodTotals(sessions, startOfWeek(now), Infinity).wpm;
    return {
      week_start: isoDate(startOfWeek(now)), goal_days: goal.days, days_this_week: st.daysThisWeek,
      week_streak: st.current, met_this_week: st.metThisWeek,
      wpm: loadShareSpeed() && wpm !== null ? Math.round(wpm * 10) / 10 : null,
    };
  },
  week: () => isoDate(startOfWeek(Date.now())),
  openSignIn: (kind) => setTimeout(() => openAccount(kind), 0),
  openProfile: () => openProfile(),
  openProgress: () => showView('progress', 'buddies'),
};
const buddiesView = new BuddiesView($('progress-buddies'), account, buddyDeps);
buddiesView.render();
const invitePrompt = new InvitePrompt($('buddy-invite'), account, buddyDeps);

const accountView = new AccountView($('account'), account, $<HTMLButtonElement>('account-btn'), $('account-summary'), () => openProfile());
accountView.render();
const profileView = new ProfileView($('profile'), account, () => setTimeout(() => openAccount('signin'), 0));

/** Opens the account panel under the top-bar button; signed out, on signing in or creating an account. */
function openAccount(kind?: 'signin' | 'signup'): void {
  if (kind) accountView.show(kind);
  closeSettings(false);
  closeMenus();
  coach.close(false);
  $('account-pop').hidden = false;
  $('account-btn').setAttribute('aria-expanded', 'true');
  accountView.focus();
}
/** The profile page: username, password, sync and the account. */
function openProfile(): void {
  closeMenus();
  closeSettings(false);
  showView('profile');
}

$('open-account').addEventListener('click', (e) => {
  // Not the document click that closes menus.
  e.stopPropagation();
  if (account.state.signedIn) openProfile();
  else openAccount('signin');
});

// After a few rounds, a learner without an account is offered one once, under the round's result.
const accountNudge = $('account-nudge');
const NUDGE_KEY = 'typing-trainer.account-nudge';
const NUDGE_AFTER = 5;

function nudgeDismissed(): boolean {
  try { return localStorage.getItem(NUDGE_KEY) === 'dismissed'; } catch { return true; }
}

function maybeNudge(rounds: number): void {
  if (account.state.signedIn || rounds < NUDGE_AFTER || nudgeDismissed()) return;
  renderNudge();
  accountNudge.hidden = false;
}

function renderNudge(): void {
  const create = Object.assign(document.createElement('button'), { type: 'button', className: 'primary', textContent: t('nudge.create') });
  create.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissNudge();
    openAccount('signup');
  });
  const later = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn', textContent: t('nudge.later') });
  later.addEventListener('click', () => {
    dismissNudge();
    inputEl.focus();
  });
  const actions = Object.assign(document.createElement('div'), { className: 'account-nudge-actions' });
  actions.append(create, later);
  accountNudge.replaceChildren(benefits(), actions);
}

function dismissNudge(): void {
  accountNudge.hidden = true;
  try { localStorage.setItem(NUDGE_KEY, 'dismissed'); } catch { /* shown again next time, which is fine */ }
}
/** A full sync when the learner comes back to the tab, at most this often. */
const RESYNC_MS = 5 * 60_000;
document.addEventListener('visibilitychange', () => {
  const state = account.state;
  if (document.visibilityState === 'visible' && state.signedIn && state.sync !== 'syncing' &&
    Date.now() - (state.lastSync ?? 0) > RESYNC_MS) account.syncNow().catch((err) => console.error('Sync failed', err));
});

// --- Fresh start ---
//
// A new week, a new month or coming back after a break are natural moments
// to begin again (the "fresh start effect"). One line on the practice page
// says so, with the weekly goal; it never mentions a broken streak.

const freshEl = $('fresh-start');
/** What the line says: a fresh start, or that now is a planned practice time. */
let fresh: FreshStart | 'plan' | null = null;

function renderFreshStart(): void {
  if (!fresh) return;
  const plan = loadPlan();
  $('fresh-start-text').textContent = fresh === 'plan'
    ? plan?.cue ? t('schedule.dueCue', { min: goal.minutes, cue: plan.cue }) : t('schedule.due', { min: goal.minutes })
    : t(`restart.${fresh}`) + ' ' + t('restart.goal', { n: goal.days, min: goal.minutes });
}

function hideFreshStart(): void {
  freshEl.hidden = true;
  fresh = null;
}

async function maybeFreshStart(): Promise<void> {
  const pick = freshStart(await store.latest(), Date.now(), loadFreshSeen());
  if (!pick) return maybePlanned();
  saveFreshSeen(pick.id);
  fresh = pick.reason;
  renderFreshStart();
  freshEl.hidden = false;
}

/** Around a planned practice time, once a day, unless today's goal is already done. */
async function maybePlanned(): Promise<void> {
  const now = Date.now();
  const day = planDue(loadPlan(), now);
  if (day === null || loadPlanSeen() === day || !freshEl.hidden) return;
  const today = dailyActiveMs(sessionSummaries(await store.since(day))).get(day) ?? 0;
  if (today >= goal.minutes * 60_000) return;
  savePlanSeen(day);
  fresh = 'plan';
  renderFreshStart();
  freshEl.hidden = false;
}

// Coming back to an open tab at the planned time counts as opening the app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store) maybePlanned().catch((err) => console.error('Failed to check the plan', err));
});

$('fresh-start-close').addEventListener('click', () => {
  hideFreshStart();
  inputEl.focus();
});

// Console access for ad-hoc inspection: `await typingLog.all()`
declare global {
  interface Window {
    typingLog: { all(): Promise<KeystrokeEvent[]>; count(): Promise<number> };
  }
}

Promise.all([KeystrokeStore.open(), withLoadBar(loadCorpus(context.language))]).then(([s]) => {
  store = s;
  window.typingLog = { all: () => s.all(), count: () => s.count() };
  renderLayout();
  renderLanguage();
  // A browser that practised before the setup existed goes straight to practice.
  if (!loadOnboardedSetting() && !hasAnyCurriculum()) openOnboarding();
  else {
    startDrill().catch((err) => console.error('Failed to start drill', err));
    maybeFreshStart().catch((err) => console.error('Failed to check for a fresh start', err));
  }
  if (pendingInvite()) void invitePrompt.show();
  account.init().catch((err) => console.error('Account setup failed', err));
  detectFromBrowser()
    .then(backfillLegacyLog)
    .catch((err) => console.error('Layout detection failed', err));
});
