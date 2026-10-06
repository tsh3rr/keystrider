import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { KeystrokeStore } from './store';
import type { KeystrokeEvent } from './types';

const key = (sessionId: string, timestamp: number, over: Partial<KeystrokeEvent> = {}): KeystrokeEvent => ({
  sessionId, language: 'en', layout: 'qwerty-us', timestamp, position: 0, expected: 'a', actual: 'a',
  code: 'KeyA', prevExpected: null, prevActual: null, latencyMs: 100, correct: true, ...over,
});

const ids = (events: KeystrokeEvent[]) => events.map((e) => `${e.sessionId}@${e.timestamp}`);

/** Lets a BroadcastChannel message arrive. */
const tick = () => new Promise((r) => setTimeout(r, 20));

describe('KeystrokeStore cache', () => {
  it('serves writes made after the first read', async () => {
    const store = await KeystrokeStore.open(new IDBFactory());
    await store.add(key('s1', 1));
    expect(ids(await store.all())).toEqual(['s1@1']);
    await store.add(key('s1', 2));
    await store.add(key('s2', 3, { language: 'de' }));
    expect(ids(await store.all())).toEqual(['s1@1', 's1@2', 's2@3']);
    expect(ids(await store.forLanguage('de'))).toEqual(['s2@3']);
    expect(ids(await store.since(2))).toEqual(['s1@2', 's2@3']);
    expect(await store.count()).toBe(3);
    store.close();
  });

  it('hands out copies, so callers cannot change the cache', async () => {
    const store = await KeystrokeStore.open(new IDBFactory());
    await store.add(key('s1', 1));
    (await store.all()).length = 0;
    expect(await store.count()).toBe(1);
    store.close();
  });

  it('keeps relabels, replaced and deleted rounds and clearing in step with the database', async () => {
    const factory = new IDBFactory();
    const store = await KeystrokeStore.open(factory);
    for (const [s, t] of [['a', 1], ['a', 2], ['b', 3], ['c', 4]] as const) await store.add(key(s, t));
    await store.all();
    await store.relabelSessions(new Map([['a', 'qwertz-de']]));
    await store.replaceSessions([key('b', 30), key('b', 31)]);
    await store.deleteSessions(['c']);
    const cached = await store.all();
    store.close();

    const fresh = await KeystrokeStore.open(factory);
    const stored = await fresh.all();
    expect(cached).toEqual(stored);
    expect(stored.map((e) => e.layout)).toEqual(['qwertz-de', 'qwertz-de', 'qwerty-us', 'qwerty-us']);
    expect(ids(stored)).toEqual(['a@1', 'a@2', 'b@30', 'b@31']);
    await fresh.clear();
    expect(await fresh.all()).toEqual([]);
    fresh.close();
  });

  it('reads again when another tab wrote', async () => {
    const factory = new IDBFactory();
    const tab1 = await KeystrokeStore.open(factory);
    const tab2 = await KeystrokeStore.open(factory);
    await tab1.all();
    await tab2.add(key('s1', 1));
    await tick();
    expect(ids(await tab1.all())).toEqual(['s1@1']);
    tab1.close();
    tab2.close();
  });
});

describe('KeystrokeStore keyboards', () => {
  it('finds the rounds typed on a keyboard', async () => {
    const store = await KeystrokeStore.open(new IDBFactory());
    await store.add(key('s1', 1));
    await store.add(key('s2', 2, { keyboard: 'k1' }));
    await store.add(key('s2', 3, { keyboard: 'k1' }));
    await store.add(key('s3', 4, { keyboard: 'k2' }));
    expect(await store.sessionsOnKeyboard('k1')).toEqual(['s2']);
    await store.deleteSessions(await store.sessionsOnKeyboard('k1'));
    expect(ids(await store.all())).toEqual(['s1@1', 's3@4']);
    store.close();
  });
});
