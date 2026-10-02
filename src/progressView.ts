import { ROWS, keyLabel } from './layouts';
import {
  dailyModels, errorRateTrend, keyHeat, periodTotals, sessionSummaries, startOfDay, weakest,
  type PeriodTotals, type SessionSummary,
} from './progress';
import type { KeystrokeEvent, PracticeContext } from './types';
import type { BigramStats, KeyStats, WeaknessModel } from './weakness';

/** The Progress tab: speed and accuracy over time, a per-key heatmap, and the weakest keys and pairs. */

const DAY_MS = 86_400_000;
const TREND_DAYS = 14;
/** Error-rate bin edges for the heatmap; below the first is the model's 2% target. */
const HEAT_BINS = [0.02, 0.05, 0.08, 0.12];

export type Range = 7 | 30 | 'all';

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

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const showChars = (s: string) => s.replace(/ /g, '␣');
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
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

function tile(label: string, value: string, delta?: string, good?: boolean): HTMLElement {
  const t = el('div', 'tile');
  t.append(el('div', 'tile-label', label), el('div', 'tile-value', value));
  if (delta) t.append(el('div', `tile-delta ${good === undefined ? '' : good ? 'good' : 'bad'}`, delta));
  return t;
}

function renderTiles(cur: PeriodTotals, prev: PeriodTotals | null, rangeText: string): void {
  const vs = prev && prev.sessions > 0;
  const change = (a: number | null, b: number | null, fmt: (d: number) => string) => {
    if (!vs || a === null || b === null) return {};
    const d = a - b;
    return { delta: `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} vs ${rangeText.replace('last', 'previous')}`, good: d >= 0 };
  };
  const wpm = change(cur.wpm, prev?.wpm ?? null, (d) => `${d.toFixed(1)} WPM`);
  const acc = change(cur.accuracy, prev?.accuracy ?? null, (d) => `${(d * 100).toFixed(1)} pts`);
  $('progress-tiles').replaceChildren(
    tile('Speed', cur.wpm === null ? '–' : `${cur.wpm.toFixed(0)} WPM`, wpm.delta, wpm.good),
    tile('First-try accuracy', cur.accuracy === null ? '–' : pct(cur.accuracy), acc.delta, acc.good),
    tile('Practice time', fmtDuration(cur.activeMs)),
    tile('Sessions', String(cur.sessions)),
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
  root.append(svg('polyline', { points: ys.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'line' }));
  if (n <= 60) for (let i = 0; i < n; i++) root.append(svg('circle', { cx: x(i), cy: y(ys[i]), r: 3.5, class: 'dot' }));

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

function renderCharts(sessions: readonly SessionSummary[]): void {
  const tip = (i: number) => {
    const s = sessions[i];
    return [fmtDateTime(s.start), `${s.wpm.toFixed(1)} WPM`, `${pct(s.accuracy)} first-try accuracy`, `${s.chars} characters`];
  };
  const wpmMax = niceMax(Math.max(...sessions.map((s) => s.wpm)) * 1.1, 10);
  const wpmStep = wpmMax <= 40 ? 10 : wpmMax <= 100 ? 20 : 40;
  lineChart($('chart-wpm'), sessions, sessions.map((s) => s.wpm), {
    yMin: 0,
    yMax: niceMax(wpmMax, wpmStep),
    ticks: Array.from({ length: niceMax(wpmMax, wpmStep) / wpmStep + 1 }, (_, i) => i * wpmStep),
    format: (v) => String(v),
    tip,
  });
  // Accuracy lives near the top, so zoom in on the range the user actually covers.
  const accMin = Math.min(0.9, Math.floor(Math.min(...sessions.map((s) => s.accuracy)) * 20) / 20);
  const accStep = 1 - accMin > 0.2 ? 0.1 : 0.05;
  const accTicks: number[] = [];
  for (let i = 0; 1 - i * accStep >= accMin - 1e-9; i++) accTicks.push(1 - i * accStep);
  lineChart($('chart-acc'), sessions, sessions.map((s) => s.accuracy), {
    yMin: accMin,
    yMax: 1,
    ticks: accTicks,
    format: (v) => `${Math.round(v * 100)}%`,
    tip,
  });

  const rows = [...sessions].reverse().map((s) => {
    const tr = el('tr');
    for (const c of [fmtDateTime(s.start), s.wpm.toFixed(1), pct(s.accuracy), String(s.chars)]) tr.append(el('td', undefined, c));
    return tr;
  });
  $('sessions-rows').replaceChildren(...rows);
}

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
        ? [`${label} key`, `${pct(h.errorRate)} first-try errors`, `${h.attempts} tries (${h.chars.map(showChars).join(' ')})`]
        : [`${label} key`, 'Not typed yet'];
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
  space.append(keyEl('Space', 'Space', 'kb-space'));
  kb.append(space);
  $('keyboard-heat').replaceChildren(kb);
}

// --- Weakest keys and pairs ---

function sparkline(values: (number | null)[]): SVGSVGElement {
  const W = 84;
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
  if (known.length < 2) return 'New';
  const d = known[known.length - 1] - known[0];
  if (Math.abs(d) < 0.005) return 'Steady';
  return d < 0 ? `▼ ${(Math.abs(d) * 100).toFixed(1)} pts better` : `▲ ${(d * 100).toFixed(1)} pts worse`;
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
    td.colSpan = 5;
    tr.append(td);
    tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren(
    ...items.map((it) => {
      const tr = el('tr');
      const name = it.kind === 'key' ? it.label : showChars(it.item);
      const nameTd = el('td', 'item', name);
      if (it.kind === 'key' && it.confusions.length > 0) {
        nameTd.title = `Often typed instead: ${it.confusions.slice(0, 3).map((c) => showChars(c.typed)).join(', ')}`;
      }
      const trend = errorRateTrend(models, it.kind, it.item, minTries[it.kind]);
      const trendTd = el('td', 'trend');
      const text = trendText(trend);
      trendTd.append(sparkline(trend), el('span', text.startsWith('▼') ? 'good' : text.startsWith('▲') ? 'bad' : 'muted', text));
      trendTd.title = `First-try error rate over the last ${TREND_DAYS} days, from when it had ${minTries[it.kind]} tries`;
      tr.append(nameTd, el('td', 'num', pct(it.errorRate)), el('td', 'num', `${Math.round(it.latencyMs)} ms`), trendTd, el('td', 'num', String(it.attempts)));
      return tr;
    }),
  );
}

// --- Entry point ---

export async function renderProgress(
  store: { forLanguage(language: string, layout?: string): Promise<KeystrokeEvent[]> },
  context: PracticeContext,
  range: Range,
  layoutName: string,
  now = Date.now(),
): Promise<void> {
  const events = await store.forLanguage(context.language, context.layout);
  $('progress-context').textContent = `${context.language.toUpperCase()} · ${layoutName}`;
  const all = sessionSummaries(events);
  const from = range === 'all' ? -Infinity : startOfDay(now) - (range - 1) * DAY_MS;
  const sessions = all.filter((s) => s.start >= from);

  const empty = all.length === 0;
  $('progress-empty').hidden = !empty;
  $('progress-body').hidden = empty;
  if (empty) return;

  const prev = range === 'all' ? null : periodTotals(all, from - range * DAY_MS, from);
  renderTiles(periodTotals(sessions, from, Infinity), prev, range === 'all' ? 'all time' : `last ${range} days`);
  $('progress-charts').hidden = sessions.length === 0;
  $('progress-no-sessions').hidden = sessions.length > 0;
  if (sessions.length > 0) renderCharts(sessions);

  const models = dailyModels(events, context, { days: TREND_DAYS, now });
  const model = models[models.length - 1];
  renderKeyboard(model);
  renderWeakTable($('weak-keys'), weakest(model.keys, minTries.key, 8), models, 'Type a bit more to see your weakest keys.');
  renderWeakTable($('weak-bigrams'), weakest(model.bigrams, minTries.bigram, 8), models, 'Type a bit more to see your weakest letter pairs.');
}
