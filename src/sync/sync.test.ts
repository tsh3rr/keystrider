import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { KeystrokeStore } from '../store';
import { TypingSession } from '../session';
import type { KeystrokeEvent } from '../types';
import type { CurriculumState } from '../drill';
import { decodeSession, encodeSession, rowSignature, signature } from './codec';
import { mergeCurricula, pendingUploads, planSync } from './plan';

const CTX = { language: 'en', layout: 'qwerty-us' };

function typed(text: string, presses: string, id: string, start = 1_700_000_000_000): KeystrokeEvent[] {
  const s = new TypingSession(text, CTX, id);
  let t = start;
  return [...presses].map((c, i) => s.press(c, (t += 150 + i), i % 2 ? 'KeyX' : null)!);
}

describe('codec', () => {
  it('round-trips a practice round exactly', () => {
    const events = typed('the cat', 'thw e cat', 'a');
    const row = encodeSession(events);
    expect(row.keystroke_count).toBe(events.length);
    expect(decodeSession(JSON.parse(JSON.stringify(row)))).toEqual(events);
    expect(rowSignature(row)).toBe(signature(events));
  });

  it('keeps per-keystroke layouts when a round was relabelled half way', () => {
    const events = typed('abcd', 'abcd', 'b').map((e, i) => (i < 2 ? e : { ...e, layout: 'qwertz-de' }));
    const row = encodeSession(events);
    expect(row.layouts).toBe('qwerty-us,qwertz-de');
    expect(decodeSession(row)).toEqual(events);
  });
});

describe('codec keyboard tag', () => {
  it('keeps the keyboard a round was typed on, and leaves the main keyboard untagged', () => {
    const work = typed('ab', 'ab', 'w').map((e) => ({ ...e, keyboard: 'k1' }));
    const row = encodeSession(work);
    expect(row.data.kb).toBe('k1');
    expect(decodeSession(JSON.parse(JSON.stringify(row)))).toEqual(work);
    const plain = encodeSession(typed('ab', 'ab', 'p'));
    expect(plain.data.kb).toBeUndefined();
    expect(decodeSession(plain).every((e) => !('keyboard' in e))).toBe(true);
  });
});

describe('planSync', () => {
  const m = (o: Record<string, string>) => new Map(Object.entries(o));

  it('uploads new rounds and downloads missing ones', () => {
    const plan = planSync(m({ a: '5|x', b: '3|x' }), m({ b: '3|x', c: '4|x' }), m({ b: '3|x' }));
    expect(plan).toEqual({ upload: ['a'], download: ['c'], deleteLocal: [] });
  });

  it('deletes here what was deleted on the server, but never the reverse', () => {
    const plan = planSync(m({ a: '5|x' }), m({ b: '3|x' }), m({ a: '5|x', b: '3|x' }));
    expect(plan).toEqual({ upload: [], download: ['b'], deleteLocal: ['a'] });
  });

  it('lets the side that changed win, and the longer copy when both did', () => {
    const synced = m({ a: '5|x', b: '5|x', c: '5|x' });
    const plan = planSync(m({ a: '5|y', b: '5|x', c: '6|x' }), m({ a: '5|x', b: '5|y', c: '8|x' }), synced);
    expect(plan).toEqual({ upload: ['a'], download: ['b', 'c'], deleteLocal: [] });
  });

  it('uploads everything practised before the account existed on its first sync', () => {
    const plan = planSync(m({ a: '5|x', b: '3|x' }), m({}), m({}));
    expect(plan).toEqual({ upload: ['a', 'b'], download: [], deleteLocal: [] });
  });

  it('pushes only rounds new or changed since the last sync', () => {
    expect(pendingUploads(m({ a: '5|x', b: '6|x', c: '1|x' }), m({ a: '5|x', b: '5|x' }))).toEqual(['b', 'c']);
  });
});

describe('mergeCurricula', () => {
  const cur = (layout: string, coreDrills: number, unlocked = 6) =>
    ({ version: 1, language: 'en', layout, coreDrills, unlocked: Array(unlocked).fill('a') }) as unknown as CurriculumState;

  it('keeps the curriculum with more practice per language and layout', () => {
    const local = { 'en.a': cur('a', 10), 'en.b': cur('b', 2), 'en.c': cur('c', 1) };
    const remote = { 'en.a': cur('a', 4), 'en.b': cur('b', 7), 'en.d': cur('d', 3) };
    const { merged, takeRemote, pushRemote } = mergeCurricula(local, remote);
    expect(merged).toEqual({ 'en.a': local['en.a'], 'en.b': remote['en.b'], 'en.c': local['en.c'], 'en.d': remote['en.d'] });
    expect(takeRemote.sort()).toEqual(['en.b', 'en.d']);
    expect(pushRemote).toBe(true);
  });

  it('takes this browser\'s lessons into a new account', () => {
    const local = { 'en.a': cur('a', 5) };
    expect(mergeCurricula(local, {})).toEqual({ merged: local, takeRemote: [], pushRemote: true });
  });

  it('has nothing to do when both sides agree', () => {
    const both = { 'en.a': cur('a', 3) };
    expect(mergeCurricula(both, structuredClone(both))).toMatchObject({ takeRemote: [], pushRemote: false });
  });
});

describe('KeystrokeStore sync helpers', () => {
  it('replaces and deletes whole rounds', async () => {
    const store = await KeystrokeStore.open(new IDBFactory());
    for (const e of [...typed('ab', 'ab', 'r1'), ...typed('cd', 'cd', 'r2')]) await store.add(e);
    const remote = typed('xyz', 'xyz', 'r1', 1_800_000_000_000);
    await store.replaceSessions(remote);
    const sigs = await store.sessionSignatures();
    expect(sigs).toEqual(new Map([['r1', '3|qwerty-us'], ['r2', '2|qwerty-us']]));
    const r1 = (await store.sessions(['r1'])).get('r1')!.map(({ id: _, ...e }) => e);
    expect(r1).toEqual(remote);
    await store.deleteSessions(['r1']);
    expect([...(await store.sessionSignatures()).keys()]).toEqual(['r2']);
  });
});
