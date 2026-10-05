import { gateEmpty, gateParts, type GateData } from './gateView';
import { num, pct, t, tNodes } from './i18n';

/**
 * The card that pops up when a drill is finished: the headline numbers,
 * what changed in the curriculum (unlocks, level, accuracy recovery), where
 * this drill's errors were and what still holds up the next unlock, which
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
  /** Focus key of the next drill, when it is a focus burst; shown in the focus colour. */
  nextKey?: string | null;
  /** Keys typed wrong on the first try in this drill, most first. */
  misses?: { label: string; count: number }[];
  /** What holds up the next unlock; null when nothing does or everything is unlocked. */
  gate?: GateData | null;
  /** Highest error rate per key the unlock bar allows, 0–1; a drill with more errors gets a hint to slow down. */
  maxError?: number;
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

  const why = errorBox(d);
  if (why) card.append(why);

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
  const next = el('span', 'rc-next');
  if (d.next && d.nextKey) next.append(...tNodes('result.nextOn', { name: d.next, key: el('b', 'rc-focus', d.nextKey) }));
  else next.append(d.next ? t('result.next', { name: d.next }) : t('result.nextDrill'));
  foot.append(next);
  const go = el('button', 'rc-go');
  go.type = 'button';
  go.append(t('result.continue'), el('kbd', 'rc-enter', t('result.enter')));
  go.addEventListener('click', onNext);
  foot.append(go);
  card.append(foot);

  root.replaceChildren(card);
  root.hidden = false;
}

/**
 * Why progress may stall: a hint when the drill had more errors than the
 * unlock bar allows, the keys missed in this drill, and what the next unlock
 * waits on. Null when there is nothing to say.
 */
function errorBox(d: ResultData): HTMLElement | null {
  const misses = d.misses ?? [];
  const gate = d.gate && !gateEmpty(d.gate) ? d.gate : null;
  const tooMany = d.maxError !== undefined && 1 - d.accuracy > d.maxError;
  if (!tooMany && !misses.length && !gate) return null;
  const box = el('div', 'rc-why');
  if (tooMany) {
    const p = el('p', 'rc-precise');
    p.append(el('b', '', t('result.preciseLead')), ' ', t('result.precise', {
      err: pct(1 - d.accuracy, 1), max: pct(d.maxError!), need: pct(1 - d.maxError!),
    }));
    box.append(p);
  }
  if (misses.length) {
    const row = el('div', 'rc-why-row');
    row.append(el('span', 'rc-why-label', t('result.misses')));
    const list = el('span', 'gate-keys');
    for (const m of misses.slice(0, 8)) {
      const c = el('span', 'gate-key');
      c.append(el('kbd', '', m.label), el('small', '', `×${m.count}`));
      list.append(c);
    }
    row.append(list);
    box.append(row);
  }
  if (gate) {
    const row = el('div', 'rc-why-row');
    row.append(el('span', 'rc-why-label', t('gate.lead', { next: gate.next })));
    const parts = el('div', 'rc-why-parts');
    parts.append(...gateParts(gate, 6));
    row.append(parts);
    box.append(row);
  }
  return box;
}
