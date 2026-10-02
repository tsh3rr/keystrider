import { num, t } from './i18n';

/**
 * The card that pops up when a drill is finished: the headline numbers,
 * what changed in the curriculum (unlocks, level, accuracy recovery), which
 * keys got better or worse, and an Enter key to go on. Pure display.
 */

export type Tone = 'win' | 'good' | 'warn' | 'info';

export interface ResultData {
  /** Name of the drill just typed, e.g. "Drill 2" or "Warm-up". */
  drillName: string;
  wpm: number;
  /** First-try accuracy, 0–1. */
  accuracy: number;
  errors: number;
  paceWpm: number;
  /** Speed is not judged in accuracy recovery. */
  recovery: boolean;
  /** Curriculum news, each with how it should feel. */
  news: { tone: Tone; text: string }[];
  /** Keys and letter pairs that got better or worse, as shown on screen. */
  improved: string[];
  slipped: string[];
  /** Name of the drill Enter starts; null if not known (e.g. after a language switch). */
  next: string | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const ICONS: Record<Tone, string> = { win: '★', good: '✓', warn: '!', info: 'i' };

/** How the drill went in one word or two, from first-try accuracy. */
export function verdict(accuracy: number): { tone: Tone; text: string } {
  if (accuracy >= 0.96) return { tone: 'good', text: t('verdict.clean') };
  if (accuracy >= 0.92) return { tone: 'info', text: t('verdict.solid') };
  return { tone: 'warn', text: t('verdict.slow') };
}

export function renderResult(root: HTMLElement, d: ResultData, onNext: () => void): void {
  const card = el('div', 'rc');

  const head = el('div', 'rc-head');
  const title = el('div', 'rc-title');
  title.append(el('span', 'rc-check', '✓'), el('h2', '', t('result.done', { name: d.drillName })));
  const v = verdict(d.accuracy);
  head.append(title, el('span', `rc-pill ${v.tone}`, v.text));
  card.append(head);

  const nums = el('div', 'rc-nums');
  const tile = (value: string, unit: string, sub: string, tone?: Tone) => {
    const t = el('div', 'rc-tile');
    const big = el('div', 'rc-big');
    big.append(value, el('small', '', unit));
    t.append(big, el('span', `rc-sub${tone ? ` ${tone}` : ''}`, sub));
    return t;
  };
  const wpm = Math.round(d.wpm);
  const pace = Math.round(d.paceWpm);
  const speedSub = d.recovery ? t('result.speedRecovery')
    : wpm >= pace ? t('result.over', { d: wpm - pace, pace }) : t('result.under', { d: pace - wpm, pace });
  const speedTone: Tone | undefined = d.recovery ? undefined : wpm >= pace ? 'good' : 'info';
  nums.append(
    tile(String(wpm), t('result.wpm'), speedSub, speedTone),
    tile(num(d.accuracy * 100, 1), '%', t('result.firstTry'), v.tone === 'warn' ? 'warn' : undefined),
    tile(String(d.errors), t('result.slips', { n: d.errors }), d.errors === 0 ? t('result.noSlips') : t('result.corrected')),
  );
  card.append(nums);

  if (d.news.length) {
    const news = el('ul', 'rc-news');
    for (const n of d.news) {
      const li = el('li', n.tone);
      li.append(el('span', 'rc-icon', ICONS[n.tone]), el('span', '', n.text));
      news.append(li);
    }
    card.append(news);
  }

  const cols = el('div', 'rc-cols');
  const col = (heading: string, items: string[], cls: 'up' | 'down', empty: string) => {
    const c = el('div', `rc-col ${cls}`);
    c.append(el('h3', '', heading));
    if (items.length) {
      const list = el('div', 'rc-chips');
      for (const it of items) list.append(el('kbd', '', it));
      c.append(list);
    } else {
      c.append(el('p', '', empty));
    }
    return c;
  };
  cols.append(
    col(t('result.better'), d.improved, 'up', t('result.noBetter')),
    col(t('result.worse'), d.slipped, 'down', t('result.noWorse')),
  );
  card.append(cols);

  const foot = el('div', 'rc-foot');
  foot.append(el('span', 'rc-next', d.next ? t('result.next', { name: d.next }) : t('result.nextDrill')));
  const go = el('button', 'rc-go');
  go.type = 'button';
  go.append(t('result.continue'), el('kbd', 'rc-enter', t('result.enter')));
  go.addEventListener('click', onNext);
  foot.append(go);
  card.append(foot);

  root.replaceChildren(card);
  root.hidden = false;
}
