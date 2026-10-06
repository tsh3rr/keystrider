import { describe, expect, it } from 'vitest';
import {
  MAIN_KEYBOARD, activeKeyboard, forKeyboard, keyboardWithLayout, loadKeyboardSettings, loadKeyboards, mainKeyboard, mergeKeyboards,
  saveKeyboards, visibleKeyboards, type KeyboardProfile,
} from './keyboards';

const kb = (id: string, at: number, over: Partial<KeyboardProfile> = {}): KeyboardProfile =>
  ({ id, name: id, layout: 'qwerty-us', created: at, at, ...over });

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

describe('keyboard profiles', () => {
  const events = [{ keyboard: undefined }, { keyboard: 'k1' }, { keyboard: 'k1' }, { keyboard: 'k2' }];

  it('gives untagged keystrokes to the main keyboard, and everything when profiles are off', () => {
    expect(forKeyboard(events, null)).toHaveLength(4);
    expect(forKeyboard(events, MAIN_KEYBOARD)).toEqual([{ keyboard: undefined }]);
    expect(forKeyboard(events, 'k1')).toHaveLength(2);
  });

  it('falls back to every keyboard while one has too little of its own', () => {
    expect(forKeyboard(events, 'k2', 2)).toHaveLength(4);
    expect(forKeyboard(events, 'k1', 2)).toHaveLength(2);
  });

  it('lists the main keyboard first and leaves removed ones out', () => {
    const list = { b: kb('b', 20), a: kb('a', 10), gone: kb('gone', 5, { deleted: true }) };
    expect(visibleKeyboards(list).map((k) => k.id)).toEqual([MAIN_KEYBOARD, 'a', 'b']);
  });

  it('falls back to the main keyboard when the picked one was removed', () => {
    const list = { [MAIN_KEYBOARD]: mainKeyboard(1), k1: kb('k1', 2, { deleted: true }) };
    expect(activeKeyboard({ enabled: false, active: 'k1' }, list)).toBeNull();
    expect(activeKeyboard({ enabled: true, active: 'k1' }, list)).toBe(MAIN_KEYBOARD);
    expect(activeKeyboard({ enabled: true, active: 'nope' }, list)).toBe(MAIN_KEYBOARD);
  });

  it('finds another keyboard set to a layout', () => {
    const list = { [MAIN_KEYBOARD]: mainKeyboard(1, 'qwertz-de'), k1: kb('k1', 2) };
    expect(keyboardWithLayout(list, 'qwerty-us', MAIN_KEYBOARD)?.id).toBe('k1');
    expect(keyboardWithLayout(list, 'qwerty-us', 'k1')).toBeNull();
  });

  it('merges per keyboard, the newer copy winning', () => {
    const local = { a: kb('a', 10, { name: 'Laptop' }), b: kb('b', 5) };
    const remote = { a: kb('a', 20, { name: 'Notebook' }), c: kb('c', 7), b: kb('b', 9, { deleted: true }) };
    const { merged, localChanged, pushRemote } = mergeKeyboards(local, remote);
    expect(merged.a.name).toBe('Notebook');
    expect(merged.b.deleted).toBe(true);
    expect(merged.c).toBeDefined();
    expect(localChanged).toBe(true);
    expect(pushRemote).toBe(false);
    expect(mergeKeyboards(merged, merged)).toMatchObject({ localChanged: false, pushRemote: false });
    expect(mergeKeyboards({ ...merged, d: kb('d', 30) }, merged).pushRemote).toBe(true);
  });

  it('ignores malformed entries from the server and from storage', () => {
    const { merged } = mergeKeyboards({}, { x: { id: 'x' } as unknown as KeyboardProfile });
    expect(merged).toEqual({});
    const storage = memoryStorage();
    storage.setItem('typing-trainer.keyboards', JSON.stringify({ a: kb('a', 1), b: { id: 'zzz' } }));
    expect(Object.keys(loadKeyboards(storage))).toEqual(['a']);
    saveKeyboards({ a: kb('a', 1) }, storage);
    expect(loadKeyboards(storage).a.name).toBe('a');
    expect(loadKeyboardSettings(storage)).toEqual({ enabled: false, active: MAIN_KEYBOARD });
  });
});
