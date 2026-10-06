import type { KeystrokeEvent } from '../types';

/**
 * One practice round as stored in the `practice_sessions` table. The
 * keystrokes go column by column (all positions, then all expected
 * characters, …), which is a fraction of the size of an array of objects
 * and compresses well in the database.
 */
export interface SessionRow {
  id: string;
  language: string;
  /** Every layout the round was typed on, sorted and comma-separated. */
  layouts: string;
  started_at: string;
  keystroke_count: number;
  data: SessionData;
}

export interface SessionData {
  v: 1;
  /** Timestamp of the first keystroke, ms since epoch. */
  t0: number;
  /** Milliseconds since `t0`. */
  t: number[];
  p: number[];
  e: string[];
  a: string[];
  c: (string | null)[];
  pe: (string | null)[];
  pa: (string | null)[];
  l: (number | null)[];
  /** "1" for a correct keystroke, "0" for a wrong one. */
  k: string;
  /** Per keystroke, only when the round mixes languages or layouts. */
  lg?: string[];
  ly?: string[];
  /** Keyboard profile the round was typed on (see keyboards.ts); absent for the main keyboard. */
  kb?: string;
}

/** What identifies a round's content for sync: its size and its layouts. A relabel changes it. */
export function signature(events: readonly Pick<KeystrokeEvent, 'layout'>[]): string {
  return `${events.length}|${layoutsOf(events)}`;
}

export function rowSignature(row: Pick<SessionRow, 'keystroke_count' | 'layouts'>): string {
  return `${row.keystroke_count}|${row.layouts}`;
}

function layoutsOf(events: readonly Pick<KeystrokeEvent, 'layout'>[]): string {
  return [...new Set(events.map((e) => e.layout))].sort().join(',');
}

/** Encodes the keystrokes of one round, in the order they were typed. */
export function encodeSession(events: readonly KeystrokeEvent[]): SessionRow {
  if (events.length === 0) throw new Error('empty session');
  const sorted = [...events].sort((x, y) => x.timestamp - y.timestamp || x.position - y.position);
  const first = sorted[0];
  const t0 = first.timestamp;
  const data: SessionData = {
    v: 1, t0,
    t: sorted.map((e) => e.timestamp - t0),
    p: sorted.map((e) => e.position),
    e: sorted.map((e) => e.expected),
    a: sorted.map((e) => e.actual),
    c: sorted.map((e) => e.code),
    pe: sorted.map((e) => e.prevExpected),
    pa: sorted.map((e) => e.prevActual),
    l: sorted.map((e) => e.latencyMs),
    k: sorted.map((e) => (e.correct ? '1' : '0')).join(''),
  };
  if (sorted.some((e) => e.language !== first.language)) data.lg = sorted.map((e) => e.language);
  if (sorted.some((e) => e.layout !== first.layout)) data.ly = sorted.map((e) => e.layout);
  if (first.keyboard !== undefined) data.kb = first.keyboard;
  return {
    id: first.sessionId,
    language: first.language,
    layouts: layoutsOf(sorted),
    started_at: new Date(t0).toISOString(),
    keystroke_count: sorted.length,
    data,
  };
}

/** Turns a stored round back into keystroke events (without local ids). */
export function decodeSession(row: Pick<SessionRow, 'id' | 'language' | 'layouts' | 'data'>): KeystrokeEvent[] {
  const d = row.data;
  if (d?.v !== 1 || !Array.isArray(d.t)) throw new Error(`unknown session format in ${row.id}`);
  const layout = row.layouts.split(',')[0];
  return d.t.map((dt, i) => ({
    sessionId: row.id,
    language: d.lg?.[i] ?? row.language,
    layout: d.ly?.[i] ?? layout,
    timestamp: d.t0 + dt,
    position: d.p[i],
    expected: d.e[i],
    actual: d.a[i],
    code: d.c[i] ?? null,
    prevExpected: d.pe[i] ?? null,
    prevActual: d.pa[i] ?? null,
    latencyMs: d.l[i] ?? null,
    correct: d.k[i] === '1',
    ...(typeof d.kb === 'string' ? { keyboard: d.kb } : {}),
  }));
}
