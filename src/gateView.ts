import { pct, t, tNodes } from './i18n';

/**
 * What holds up the next unlock, in plain numbers: which keys need fewer
 * errors (with their error rate), which need more speed, which need more
 * tries. Shown above the practice text and on the result card, so the
 * learner sees why no new key comes. Pure display; main.ts gathers the data.
 */

export interface GateData {
  /** Key cap or stage name of the next unlock. */
  next: string;
  /** Highest error rate per key the unlock bar allows, 0–1. */
  maxError: number;
  errors: { label: string; errorRate: number }[];
  slow: { label: string; ms: number; targetMs: number }[];
  few: string[];
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** An error rate with a decimal below 10 %, so 4.4 % does not read as the 4 % bar. */
const rate = (r: number) => pct(r, r < 0.1 ? 1 : 0);

export const gateEmpty = (g: GateData) => g.errors.length + g.slow.length + g.few.length === 0;

/** A key cap with its number next to it, e.g. "E 9 %". */
function chip(label: string, value?: string): HTMLElement {
  const c = el('span', 'gate-key');
  c.append(el('kbd', '', label));
  if (value) c.append(el('small', '', value));
  return c;
}

function chips(items: HTMLElement[]): HTMLElement {
  const span = el('span', 'gate-keys');
  span.append(...items);
  return span;
}

/**
 * One part per reason, worst reason first. `limit` caps the keys shown per
 * reason; the rest is counted as "+n".
 */
export function gateParts(g: GateData, limit = Infinity): HTMLElement[] {
  const parts: HTMLElement[] = [];
  const cut = <T>(items: T[], make: (it: T) => HTMLElement) => {
    const shown = items.slice(0, limit).map(make);
    if (items.length > limit) shown.push(el('span', 'gate-more', `+${items.length - limit}`));
    return chips(shown);
  };
  const part = (cls: string, nodes: (Node | string)[]) => {
    const p = el('span', `gate-part ${cls}`);
    p.append(...nodes);
    parts.push(p);
  };
  if (g.errors.length) {
    part('errors', tNodes('gate.errors', {
      keys: cut(g.errors, (k) => chip(k.label, rate(k.errorRate))),
      max: pct(g.maxError),
    }));
  }
  if (g.slow.length) {
    const target = Math.round(Math.min(...g.slow.map((k) => k.targetMs)));
    part('slow', tNodes('gate.slow', {
      keys: cut(g.slow, (k) => chip(k.label, t('gate.ms', { ms: Math.round(k.ms) }))),
      ms: target,
    }));
  }
  if (g.few.length) part('few', tNodes('gate.few', { keys: cut(g.few, (k) => chip(k)) }));
  return parts;
}

/** The line above the practice text: what the next unlock waits on. */
export function renderGateLine(root: HTMLElement, g: GateData | null): void {
  if (!g || gateEmpty(g)) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;
  root.replaceChildren(el('b', 'gate-lead', t('gate.lead', { next: g.next })), ...gateParts(g, 3));
}
