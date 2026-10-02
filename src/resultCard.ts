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
  if (accuracy >= 0.96) return { tone: 'good', text: 'Clean drill' };
  if (accuracy >= 0.92) return { tone: 'info', text: 'Solid' };
  return { tone: 'warn', text: 'Slow down a little' };
}

export function renderResult(root: HTMLElement, d: ResultData, onNext: () => void): void {
  const card = el('div', 'rc');

  const head = el('div', 'rc-head');
  const title = el('div', 'rc-title');
  title.append(el('span', 'rc-check', '✓'), el('h2', '', `${d.drillName} done`));
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
  const speedSub = d.recovery ? 'speed does not count right now'
    : wpm >= pace ? `▲ ${wpm - pace} over your target of ${pace}` : `▼ ${pace - wpm} under your target of ${pace}`;
  const speedTone: Tone | undefined = d.recovery ? undefined : wpm >= pace ? 'good' : 'info';
  nums.append(
    tile(String(wpm), 'WPM', speedSub, speedTone),
    tile(`${(d.accuracy * 100).toFixed(1)}`, '%', 'right on the first try', v.tone === 'warn' ? 'warn' : undefined),
    tile(String(d.errors), d.errors === 1 ? 'slip' : 'slips', d.errors === 0 ? 'not a single wrong key' : 'wrong keys you corrected'),
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
    col('Got better', d.improved, 'up', 'Nothing clearly better this time.'),
    col('Needs more work', d.slipped, 'down', 'Nothing got worse.'),
  );
  card.append(cols);

  const foot = el('div', 'rc-foot');
  foot.append(el('span', 'rc-next', d.next ? `Next: ${d.next}` : 'Next drill'));
  const go = el('button', 'rc-go');
  go.type = 'button';
  go.append('Continue', el('kbd', 'rc-enter', '⏎ Enter'));
  go.addEventListener('click', onNext);
  foot.append(go);
  card.append(foot);

  root.replaceChildren(card);
  root.hidden = false;
}
