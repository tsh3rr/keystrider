import { num, pct as fmtPct, t, uiLanguage, type MessageKey } from './i18n';
import { ROWS, keyLabel } from './layouts';
import {
  dailyModels, errorRateTrend, keyHeat, periodTotals, sessionSummaries, startOfDay, streak, weakest, weeklyTotals, weeklyTrend,
  type PeriodTotals, type SessionSummary, type Streak, type WeekTotals,
} from './progress';
import type { KeystrokeEvent, PracticeContext } from './types';
import type { BigramStats, KeyStats, WeaknessModel } from './weakness';
import type { CoachData, ProgressTarget } from './coachView';

/**
 * The Progress tab: where you are on the path, speed and accuracy over time,
 * a per-key heatmap, and the weakest keys and pairs, each in its own card.
 */

const DAY_MS = 86_400_000;
const TREND_DAYS = 14;
/** Calendar weeks in the week-by-week card. */
const WEEKS = 8;
/** Error-rate bin edges for the heatmap; below the first is the model's 2% target. */
const HEAT_BINS = [0.02, 0.05, 0.08, 0.12];

export type Range = 7 | 30 | 'all';
/** Cards the coach bubbles link to. */
export type ProgressSection = ProgressTarget;
type Metric = 'wpm' | 'acc';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svgNS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const pct = (x: number, digits = 1) => fmtPct(x, digits);
/** Bar widths in CSS percent. */
const width = (x: number) => `${Math.round(x * 100)}%`;
const showChars = (s: string) => s.replace(/ /g, '␣');
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(uiLanguage(), { day: 'numeric', month: 'short' });
const fmtShortDate = (ms: number) => new Date(ms).toLocaleDateString(uiLanguage(), { day: 'numeric', month: 'numeric' });
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString(uiLanguage(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 60 ? t('progress.minutes', { m: min }) : t('progress.hours', { h: Math.floor(min / 60), m: min % 60 });
}

// --- Tooltip (one shared element) ---

function showTip(lines: string[], x: number, y: number): void {
  const tip = $('progress-tip');
  tip.replaceChildren(...lines.map((l, i) => el('div', i === 0 ? 'tip-title' : undefined, l)));
  tip.hidden = false;
  const { width, height } = tip.getBoundingClientRect();
  const left = Math.min(x + 12, window.innerWidth - width - 8);
  const top = y - height - 12 < 8 ? y + 16 : y - height - 12;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${top}px`;
}

function hideTip(): void {
  $('progress-tip').hidden = true;
}

function tipOnHover(target: HTMLElement | SVGElement, lines: () => string[]): void {
  target.addEventListener('pointerenter', (e) => showTip(lines(), (e as PointerEvent).clientX, (e as PointerEvent).clientY));
  target.addEventListener('pointermove', (e) => showTip(lines(), (e as PointerEvent).clientX, (e as PointerEvent).clientY));
  target.addEventListener('pointerleave', hideTip);
  target.addEventListener('focus', () => {
    const r = target.getBoundingClientRect();
    showTip(lines(), r.left + r.width / 2, r.top);
  });
  target.addEventListener('blur', hideTip);
}

// --- Stat tiles ---

function tile(label: string, value: string, unit?: string, delta?: string, good?: boolean): HTMLElement {
  const t = el('div', 'pg-tile');
  const big = el('div', 'pg-big', value);
  if (unit) big.append(el('small', undefined, unit));
  t.append(el('div', 'pg-label', label), big);
  t.append(el('div', `pg-delta ${good === undefined ? '' : good ? 'good' : 'bad'}`, delta ?? '\u00a0'));
  return t;
}

/** `days` is the period length, or 0 for all time. */
function renderTiles(cur: PeriodTotals, prev: PeriodTotals | null, days: number): void {
  const vs = prev && prev.sessions > 0;
  const change = (a: number | null, b: number | null, fmt: (d: number) => string) => {
    if (!vs || a === null || b === null) return {};
    const d = a - b;
    return { delta: t('progress.delta', { arrow: d >= 0 ? '▲' : '▼', d: fmt(Math.abs(d)), n: days }), good: d >= 0 };
  };
  const wpm = change(cur.wpm, prev?.wpm ?? null, (d) => t('progress.wpm', { n: num(d, 1) }));
  const acc = change(cur.accuracy, prev?.accuracy ?? null, (d) => t('progress.pts', { n: num(d * 100, 1) }));
  $('progress-tiles').replaceChildren(
    tile(t('progress.tileSpeed'), cur.wpm === null ? '–' : num(cur.wpm), cur.wpm === null ? undefined : t('now.wpm'), wpm.delta, wpm.good),
    tile(t('progress.tileAccuracy'), cur.accuracy === null ? '–' : pct(cur.accuracy), undefined, acc.delta, acc.good),
    tile(t('progress.tileTime'), fmtDuration(cur.activeMs), undefined, days === 0 ? t('progress.allTime') : t('progress.inLastDays', { n: days })),
    tile(t('progress.tileSessions'), num(cur.sessions)),
  );
}

// --- Line chart ---

interface ChartOptions {
  yMin: number;
  yMax: number;
  ticks: number[];
  format: (y: number) => string;
  tip: (i: number) => string[];
}

/** One series, one y-axis: a 2px line through every session, with a crosshair that snaps to the nearest one. */
function lineChart(host: HTMLElement, sessions: readonly SessionSummary[], ys: number[], o: ChartOptions): void {
  // Drawn at the container's width so text stays readable on phones.
  const W = Math.max(300, Math.round(host.clientWidth) || 720);
  const H = W < 500 ? 180 : 200;
  const m = { l: 44, r: 12, t: 10, b: 24 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = ys.length;
  const x = (i: number) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => m.t + ih - ((v - o.yMin) / (o.yMax - o.yMin)) * ih;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  for (const t of o.ticks) {
    root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: 'grid' }));
    const label = svg('text', { x: m.l - 6, y: y(t) + 4, class: 'axis', 'text-anchor': 'end' });
    label.textContent = o.format(t);
    root.append(label);
  }
  // Date labels at the ends; sessions are evenly spaced, not to scale in time.
  const dates: [number, string][] = n > 1 ? [[0, 'start'], [n - 1, 'end']] : [[0, 'middle']];
  for (const [i, anchor] of dates) {
    const label = svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': anchor });
    label.textContent = fmtDate(sessions[i].start);
    root.append(label);
  }
  const points = ys.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  if (n > 1) root.append(svg('polygon', { points: `${x(0)},${m.t + ih} ${points} ${x(n - 1)},${m.t + ih}`, class: 'area' }));
  root.append(svg('polyline', { points, class: 'line' }));
  root.append(svg('circle', { cx: x(n - 1), cy: y(ys[n - 1]), r: 5, class: 'dot last' }));

  const cross = svg('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
  const focus = svg('circle', { r: 5, class: 'dot focus', visibility: 'hidden' });
  root.append(cross, focus);
  const hit = svg('rect', { x: m.l, y: 0, width: iw, height: H, fill: 'transparent' });
  root.append(hit);
  hit.addEventListener('pointermove', (e) => {
    const box = root.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', String(x(i)));
    focus.setAttribute('cy', String(y(ys[i])));
    focus.setAttribute('visibility', 'visible');
    showTip(o.tip(i), e.clientX, e.clientY);
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    focus.setAttribute('visibility', 'hidden');
    hideTip();
  });
  host.replaceChildren(root);
}

function niceMax(v: number, step: number): number {
  return Math.max(step, Math.ceil(v / step) * step);
}

let chartSessions: readonly SessionSummary[] = [];
let metric: Metric = 'wpm';

const CHART_CAPTIONS: Record<Metric, MessageKey> = {
  wpm: 'progress.captionWpm',
  acc: 'progress.captionAcc',
};

/** Draws the chart for the picked metric; the other one stays hidden so it is drawn at the right width when picked. */
function renderChart(): void {
  const sessions = chartSessions;
  if (sessions.length === 0) return;
  $('chart-wpm').hidden = metric !== 'wpm';
  $('chart-acc').hidden = metric !== 'acc';
  $('chart-caption').textContent = t(CHART_CAPTIONS[metric]);
  document.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.metric === metric)));
  const tip = (i: number) => {
    const s = sessions[i];
    return [
      fmtDateTime(s.start), t('progress.wpm', { n: num(s.wpm, 1) }),
      t('progress.tipAccuracy', { acc: pct(s.accuracy) }), t('progress.tipChars', { n: num(s.chars) }),
    ];
  };
  if (metric === 'wpm') {
    const wpmMax = niceMax(Math.max(...sessions.map((s) => s.wpm)) * 1.1, 10);
    const wpmStep = wpmMax <= 40 ? 10 : wpmMax <= 100 ? 20 : 40;
    lineChart($('chart-wpm'), sessions, sessions.map((s) => s.wpm), {
      yMin: 0,
      yMax: niceMax(wpmMax, wpmStep),
      ticks: Array.from({ length: niceMax(wpmMax, wpmStep) / wpmStep + 1 }, (_, i) => i * wpmStep),
      format: (v) => String(v),
      tip,
    });
    return;
  }
  // Accuracy lives near the top, so zoom in on the range the user actually covers.
  const accMin = Math.min(0.9, Math.floor(Math.min(...sessions.map((s) => s.accuracy)) * 20) / 20);
  const accStep = 1 - accMin > 0.2 ? 0.1 : 0.05;
  const accTicks: number[] = [];
  for (let i = 0; 1 - i * accStep >= accMin - 1e-9; i++) accTicks.push(1 - i * accStep);
  lineChart($('chart-acc'), sessions, sessions.map((s) => s.accuracy), {
    yMin: accMin,
    yMax: 1,
    ticks: accTicks,
    format: (v) => fmtPct(v),
    tip,
  });
}

function renderCharts(sessions: readonly SessionSummary[]): void {
  chartSessions = sessions;
  renderChart();
  const rows = [...sessions].reverse().map((s) => {
    const tr = el('tr');
    for (const c of [fmtDateTime(s.start), num(s.wpm, 1), pct(s.accuracy), num(s.chars)]) tr.append(el('td', undefined, c));
    return tr;
  });
  $('sessions-rows').replaceChildren(...rows);
}

document.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach((b) =>
  b.addEventListener('click', () => {
    metric = b.dataset.metric as Metric;
    renderChart();
  }),
);

// --- Keyboard heatmap ---

/** Ordinal bin 0 (on target) to 4 (12% or more), or -1 when the key was never typed. */
function heatBin(errorRate: number | undefined): number {
  if (errorRate === undefined) return -1;
  return HEAT_BINS.filter((edge) => errorRate >= edge).length;
}

function renderKeyboard(model: WeaknessModel): void {
  const heat = keyHeat(model);
  const kb = el('div', 'kb');
  const keyEl = (code: string, label: string, cls = '') => {
    const h = heat.get(code);
    const bin = heatBin(h?.errorRate);
    const k = el('div', `kb-key heat-${bin < 0 ? 'none' : bin} ${cls}`, label);
    k.tabIndex = 0;
    const lines = () =>
      h
        ? [
          t('progress.keyTitle', { label }), t('progress.keyErrors', { pct: pct(h.errorRate) }),
          t('progress.keyTries', { n: num(h.attempts), chars: h.chars.map(showChars).join(' ') }),
        ]
        : [t('progress.keyTitle', { label }), t('progress.keyNotTyped')];
    k.setAttribute('aria-label', lines().join(', '));
    tipOnHover(k, lines);
    return k;
  };
  ROWS.forEach((row, r) => {
    const rowEl = el('div', `kb-row kb-row-${r}`);
    for (const code of row) {
      const label = keyLabel(model.context.layout, code);
      // Keys this layout lacks (e.g. no ISO key on US) are left out.
      if (label === code) continue;
      rowEl.append(keyEl(code, label));
    }
    kb.append(rowEl);
  });
  const space = el('div', 'kb-row kb-row-space');
  space.append(keyEl('Space', t('key.space'), 'kb-space'));
  kb.append(space);
  $('keyboard-heat').replaceChildren(kb);
}

// --- Weakest keys and pairs ---

function sparkline(values: (number | null)[]): SVGSVGElement {
  const W = 60;
  const H = 22;
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'spark' });
  const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (known.length === 0) return s;
  const max = Math.max(0.05, ...known.map(([, v]) => v));
  const x = (i: number) => 2 + (i / (values.length - 1)) * (W - 4);
  const y = (v: number) => 2 + (1 - v / max) * (H - 4);
  s.append(svg('polyline', { points: known.map(([i, v]) => `${x(i)},${y(v)}`).join(' '), class: 'spark-line' }));
  const [li, lv] = known[known.length - 1];
  s.append(svg('circle', { cx: x(li), cy: y(lv), r: 2.5, class: 'spark-dot' }));
  return s;
}

function trendText(values: (number | null)[]): string {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return t('progress.trendNew');
  const d = known[known.length - 1] - known[0];
  if (Math.abs(d) < 0.005) return t('progress.trendSteady');
  return d < 0 ? t('progress.trendBetter', { d: num(Math.abs(d) * 100, 1) }) : t('progress.trendWorse', { d: num(d * 100, 1) });
}

/** Fewer tries than this and the model's rate is mostly its prior, so it is left out of rankings and trends. */
const minTries = { key: 10, bigram: 5 } as const;

function renderWeakTable(
  tbody: HTMLElement,
  items: readonly (KeyStats | BigramStats)[],
  models: readonly WeaknessModel[],
  empty: string,
): void {
  if (items.length === 0) {
    const tr = el('tr');
    const td = el('td', 'muted', empty);
    td.colSpan = 4;
    tr.append(td);
    tbody.replaceChildren(tr);
    return;
  }
  const maxRate = Math.max(0.05, ...items.map((it) => it.errorRate));
  tbody.replaceChildren(
    ...items.map((it) => {
      const tr = el('tr');
      tr.title = t('progress.tries', { n: num(it.attempts) });
      const name = it.kind === 'key' ? (it.item === ' ' ? t('key.space') : it.label) : showChars(it.item);
      const nameTd = el('td', 'item');
      nameTd.append(el('kbd', undefined, name));
      if (it.kind === 'key' && it.confusions.length > 0) {
        tr.title += '. ' + t('progress.confusions', { list: it.confusions.slice(0, 3).map((c) => showChars(c.typed)).join(', ') });
      }
      const errTd = el('td', 'num');
      const bar = el('span', 'bar');
      const fill = el('i');
      fill.style.width = width(it.errorRate / maxRate);
      bar.append(fill);
      const errWrap = el('span', 'err-cell');
      errWrap.append(bar, el('span', undefined, pct(it.errorRate)));
      errTd.append(errWrap);
      const trend = errorRateTrend(models, it.kind, it.item, minTries[it.kind]);
      const trendTd = el('td', 'trend');
      const text = trendText(trend);
      trendTd.append(sparkline(trend), el('span', text.startsWith('▼') ? 'good' : text.startsWith('▲') ? 'bad' : 'muted', text));
      trendTd.title = t('progress.trendTitle', { days: TREND_DAYS, n: minTries[it.kind] });
      tr.append(nameTd, errTd, el('td', 'num', `${num(it.latencyMs)} ms`), trendTd);
      return tr;
    }),
  );
}

// --- Week by week ---

function renderStreak(st: Streak): void {
  const big = $('week-streak');
  big.replaceChildren(num(st.current));
  big.append(el('small', undefined, t('week.days', { n: st.current })));
  const note = $('week-streak-note');
  note.className = 'pg-delta';
  if (st.current > 0 && !st.today) {
    note.textContent = t('week.keepGoing');
    note.classList.add('good');
  } else {
    note.textContent = t('week.best', { n: st.best });
  }
}

function renderWeekDays(week: WeekTotals, now: number): void {
  const fmt = new Intl.DateTimeFormat(uiLanguage(), { weekday: 'narrow' });
  const long = new Intl.DateTimeFormat(uiLanguage(), { weekday: 'long' });
  const todayIdx = Math.round((startOfDay(now) - week.start) / DAY_MS);
  $('week-days').replaceChildren(
    ...week.activeDays.map((active, i) => {
      const day = new Date(week.start);
      day.setDate(day.getDate() + i);
      const li = el('li', [active ? 'on' : '', i === todayIdx ? 'today' : '', i > todayIdx ? 'future' : ''].join(' ').trim());
      li.append(el('i'), el('span', undefined, fmt.format(day)));
      li.title = `${long.format(day)}: ${active ? t('week.practised') : t('week.notPractised')}`;
      li.setAttribute('aria-label', li.title);
      return li;
    }),
  );
}

/** Average speed per calendar week as columns; weeks without practice keep their slot so gaps show. */
function weekChart(host: HTMLElement, weeks: readonly WeekTotals[]): void {
  const W = Math.max(300, Math.round(host.clientWidth) || 720);
  const H = W < 500 ? 150 : 170;
  const m = { l: 8, r: 8, t: 22, b: 24 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const slot = iw / weeks.length;
  const bw = Math.min(56, slot * 0.62);
  const max = niceMax(Math.max(10, ...weeks.map((w) => w.wpm ?? 0)) * 1.1, 10);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  root.setAttribute('aria-label', t('week.chartLabel'));
  root.append(svg('line', { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, class: 'grid' }));
  weeks.forEach((w, i) => {
    const cx = m.l + slot * (i + 0.5);
    const current = i === weeks.length - 1;
    const g = svg('g', { class: `wk-col${current ? ' current' : ''}`, tabindex: 0 });
    if (w.wpm !== null) {
      const h = Math.max(3, (w.wpm / max) * ih);
      g.append(svg('rect', { x: cx - bw / 2, y: m.t + ih - h, width: bw, height: h, rx: 4, class: 'wk-bar' }));
      const v = svg('text', { x: cx, y: m.t + ih - h - 6, class: 'wk-value', 'text-anchor': 'middle' });
      v.textContent = num(w.wpm);
      g.append(v);
    } else {
      g.append(svg('rect', { x: cx - bw / 2, y: m.t + ih - 2, width: bw, height: 2, rx: 1, class: 'wk-none' }));
    }
    const label = svg('text', { x: cx, y: H - 6, class: 'axis', 'text-anchor': 'middle' });
    // Narrow slots get numeric dates, so eight labels fit side by side on a phone.
    label.textContent = slot < 80 ? fmtShortDate(w.start) : current ? t('week.now') : fmtDate(w.start);
    g.append(label);
    g.append(svg('rect', { x: cx - slot / 2, y: 0, width: slot, height: H, fill: 'transparent' }));
    const end = new Date(w.start);
    end.setDate(end.getDate() + 6);
    const lines = () => [
      t('week.range', { from: fmtDate(w.start), to: fmtDate(end.getTime()) }),
      ...(w.wpm === null || w.accuracy === null
        ? [t('week.noPractice')]
        : [
          t('progress.wpm', { n: num(w.wpm, 1) }), t('progress.tipAccuracy', { acc: pct(w.accuracy) }),
          t('week.tipTime', { time: fmtDuration(w.activeMs), n: w.activeDays.filter(Boolean).length }),
        ]),
    ];
    g.setAttribute('aria-label', lines().join(', '));
    tipOnHover(g, lines);
    root.append(g);
  });
  const trend = weeklyTrend(weeks);
  if (trend) {
    const known = weeks.flatMap((w, i) => (w.wpm === null ? [] : [i]));
    const [a, b] = [known[0], known[known.length - 1]];
    const y = (i: number) => m.t + ih - (Math.max(0, trend.intercept + trend.slope * i) / max) * ih;
    const xAt = (i: number) => m.l + slot * (i + 0.5);
    // Drawn above the columns but never catches the pointer, so tooltips still work.
    root.append(svg('line', { x1: xAt(a), y1: y(a), x2: xAt(b), y2: y(b), class: 'wk-trend' }));
  }
  host.replaceChildren(root);
}

/** The streak counts practice in any language; speeds are for the current language and layout only. */
function renderWeeks(weeks: readonly WeekTotals[], allSessions: readonly SessionSummary[], now: number): void {
  renderStreak(streak(allSessions, now));
  renderWeekDays(weeks[weeks.length - 1], now);
  weekChart($('week-chart'), weeks);
  const [prev, cur] = weeks.slice(-2);
  const speed = $('week-speed');
  speed.replaceChildren(cur.wpm === null ? '–' : num(cur.wpm));
  if (cur.wpm !== null) speed.append(el('small', undefined, t('now.wpm')));
  const note = $('week-speed-note');
  note.className = 'pg-delta';
  if (cur.wpm !== null && prev.wpm !== null) {
    const d = cur.wpm - prev.wpm;
    note.textContent = t('week.vsLast', { arrow: d >= 0 ? '▲' : '▼', d: t('progress.wpm', { n: num(Math.abs(d), 1) }) });
    note.classList.add(d >= 0 ? 'good' : 'bad');
  } else {
    note.textContent = cur.wpm === null ? t('week.noPractice') : '\u00a0';
  }
  const trend = weeklyTrend(weeks);
  const trendText = trend
    ? `${t('week.trend', { arrow: trend.slope >= 0 ? '▲' : '▼', d: t('progress.wpm', { n: num(Math.abs(trend.slope), 1) }) })} `
    : '';
  $('week-caption').textContent = trendText + t('week.caption');
}

// --- Path ---

/** The path card mirrors the Path chip's bubble, with room for every stage. */
function renderPath(path: CoachData['path'] | null): void {
  $('progress-path').hidden = path === null;
  if (!path) return;
  $('path-stages').replaceChildren(
    ...path.stages.map((st) => {
      const li = el('li', st.state);
      const bar = el('i');
      const fill = el('b');
      fill.style.width = width(st.state === 'done' ? 1 : st.total ? st.done / st.total : 0);
      bar.append(fill);
      const state = st.state === 'done' ? t('progress.stageDone') : st.state === 'locked' ? t('progress.stageLocked')
        : t('progress.stageOf', { done: st.done, total: st.total });
      li.append(el('span', 'pg-stage-name', st.name), el('span', 'pg-stage-state', state), bar);
      return li;
    }),
  );
  $('path-about').textContent = path.about;
}

// --- Entry point ---

export interface ProgressOptions {
  range: Range;
  /** What the context line shows, e.g. "English · German (QWERTZ)". */
  contextName: string;
  /** The coach's path summary, when practice has loaded one. */
  path?: CoachData['path'] | null;
  now?: number;
}

export async function renderProgress(
  store: { forLanguage(language: string, layout?: string): Promise<KeystrokeEvent[]>; all(): Promise<KeystrokeEvent[]> },
  context: PracticeContext,
  { range, contextName, path = null, now = Date.now() }: ProgressOptions,
): Promise<void> {
  const events = await store.forLanguage(context.language, context.layout);
  $('progress-context').textContent = contextName;
  document.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.range === String(range))));
  const all = sessionSummaries(events);
  const from = range === 'all' ? -Infinity : startOfDay(now) - (range - 1) * DAY_MS;
  const sessions = all.filter((s) => s.start >= from);

  const empty = all.length === 0;
  $('progress-empty').hidden = !empty;
  $('progress-body').hidden = empty;
  if (empty) return;

  const prev = range === 'all' ? null : periodTotals(all, from - range * DAY_MS, from);
  renderTiles(periodTotals(sessions, from, Infinity), prev, range === 'all' ? 0 : range);
  const everywhere = sessionSummaries(await store.all());
  renderWeeks(weeklyTotals(all, { weeks: WEEKS, now }), everywhere, now);
  renderPath(path);
  $('progress-speed').hidden = sessions.length === 0;
  $('progress-no-sessions').hidden = sessions.length > 0;
  if (sessions.length > 0) renderCharts(sessions);

  const models = dailyModels(events, context, { days: TREND_DAYS, now });
  const model = models[models.length - 1];
  renderKeyboard(model);
  renderWeakTable($('weak-keys'), weakest(model.keys, minTries.key, 8), models, t('progress.emptyKeys'));
  renderWeakTable($('weak-bigrams'), weakest(model.bigrams, minTries.bigram, 8), models, t('progress.emptyPairs'));
}

/** Scrolls a card into view and outlines it for a moment, so a link from a coach bubble shows where it landed. */
export function revealSection(section: ProgressSection): void {
  const card = $(`progress-${section}`);
  if (!card || card.hidden || card.offsetParent === null) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  card.classList.remove('pg-flash');
  void card.offsetWidth;
  card.classList.add('pg-flash');
}
