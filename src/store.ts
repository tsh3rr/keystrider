import type { KeystrokeEvent } from './types';
import { signature } from './sync/codec';

// Keeps the pre-Keystrider name: renaming it would hide every user's saved history.
const DB_NAME = 'typing-trainer';
const DB_VERSION = 2;
const STORE = 'keystrokes';

/**
 * Keystroke log persisted in IndexedDB. IndexedDB is used instead of
 * localStorage because the log grows quickly (thousands of events per
 * practice hour) and localStorage caps out around 5 MB.
 */
export class KeystrokeStore {
  private constructor(private db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<KeystrokeStore> {
    return new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const tx = req.transaction!;
        if (e.oldVersion < 1) {
          const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('sessionId', 'sessionId');
          store.createIndex('timestamp', 'timestamp');
        }
        if (e.oldVersion < 2) {
          // v2 tags events with language and layout. Everything logged before
          // that was English text on the scaffold's QWERTY default.
          const store = tx.objectStore(STORE);
          store.createIndex('language', 'language');
          store.createIndex('layout', 'layout');
          store.openCursor().onsuccess = function () {
            const cursor = this.result;
            if (!cursor) return;
            cursor.update({ language: 'en', layout: 'qwerty-us', code: null, ...cursor.value });
            cursor.continue();
          };
        }
      };
      req.onsuccess = () => resolve(new KeystrokeStore(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  add(event: KeystrokeEvent): Promise<number> {
    return this.tx('readwrite', (s) => s.add(event)) as Promise<number>;
  }

  all(): Promise<KeystrokeEvent[]> {
    return this.tx('readonly', (s) => s.getAll()) as Promise<KeystrokeEvent[]>;
  }

  /** Events typed in one language, optionally narrowed to one layout. */
  async forLanguage(language: string, layout?: string): Promise<KeystrokeEvent[]> {
    const events = (await this.tx('readonly', (s) => s.index('language').getAll(language))) as KeystrokeEvent[];
    return layout === undefined ? events : events.filter((e) => e.layout === layout);
  }

  /**
   * Retags whole practice sessions with a different keyboard layout, for
   * sessions logged under the wrong one (see `relabelPlan`). Returns how
   * many keystrokes changed.
   */
  relabelSessions(plan: ReadonlyMap<string, string>): Promise<number> {
    if (plan.size === 0) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      let changed = 0;
      tx.objectStore(STORE).openCursor().onsuccess = function () {
        const cursor = this.result;
        if (!cursor) return;
        const event = cursor.value as KeystrokeEvent;
        const layout = plan.get(event.sessionId);
        if (layout !== undefined && layout !== event.layout) {
          cursor.update({ ...event, layout });
          changed++;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(changed);
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Each practice round's sync signature (see sync/codec.ts), by session id. */
  async sessionSignatures(): Promise<Map<string, string>> {
    const bySession = groupBySession(await this.all());
    return new Map([...bySession].map(([id, events]) => [id, signature(events)]));
  }

  /** The keystrokes of the given rounds, grouped by session id. */
  async sessions(ids: readonly string[]): Promise<Map<string, KeystrokeEvent[]>> {
    const wanted = new Set(ids);
    return groupBySession((await this.all()).filter((e) => wanted.has(e.sessionId)));
  }

  /** Replaces whole rounds with the given keystrokes, in one transaction. */
  replaceSessions(events: readonly KeystrokeEvent[]): Promise<void> {
    return this.deleteAndAdd(new Set(events.map((e) => e.sessionId)), events);
  }

  deleteSessions(ids: readonly string[]): Promise<void> {
    return this.deleteAndAdd(new Set(ids), []);
  }

  private deleteAndAdd(ids: ReadonlySet<string>, events: readonly KeystrokeEvent[]): Promise<void> {
    if (ids.size === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const index = store.index('sessionId');
      // Collect every key first, so the new keystrokes are added only after the old ones are gone.
      let pending = ids.size;
      for (const id of ids) {
        index.getAllKeys(IDBKeyRange.only(id)).onsuccess = function () {
          for (const key of this.result) store.delete(key);
          if (--pending === 0) for (const { id: _, ...event } of events) store.add(event);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  count(): Promise<number> {
    return this.tx('readonly', (s) => s.count());
  }

  clear(): Promise<undefined> {
    return this.tx('readwrite', (s) => s.clear());
  }

  close(): void {
    this.db.close();
  }

  private tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = fn(this.db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

const CSV_COLUMNS: (keyof KeystrokeEvent)[] = [
  'id', 'sessionId', 'language', 'layout', 'timestamp', 'position', 'expected', 'actual',
  'code', 'prevExpected', 'prevActual', 'latencyMs', 'correct',
];

export function toCsv(events: KeystrokeEvent[]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\s]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = events.map((e) => CSV_COLUMNS.map((c) => cell(e[c])).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

function groupBySession(events: readonly KeystrokeEvent[]): Map<string, KeystrokeEvent[]> {
  const groups = new Map<string, KeystrokeEvent[]>();
  for (const e of events) {
    const group = groups.get(e.sessionId);
    if (group) group.push(e);
    else groups.set(e.sessionId, [e]);
  }
  return groups;
}
