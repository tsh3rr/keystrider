import type { KeystrokeEvent } from './types';
import { signature } from './sync/codec';

// Keeps the pre-Keystrider name: renaming it would hide every user's saved history.
const DB_NAME = 'typing-trainer';
const DB_VERSION = 2;
const STORE = 'keystrokes';
// Tells other tabs of the app that the log changed, so they read it again.
const CHANNEL = 'typing-trainer.keystrokes';

/**
 * Keystroke log persisted in IndexedDB. IndexedDB is used instead of
 * localStorage because the log grows quickly (thousands of events per
 * practice hour) and localStorage caps out around 5 MB.
 *
 * The whole log is read from IndexedDB once and then kept in memory, with
 * every write applied to both. Reading hundreds of thousands of keystrokes
 * back from IndexedDB takes seconds, and the app needs them at startup and
 * after every drill. Callers get copies of the arrays, never the cache.
 */
export class KeystrokeStore {
  /** Every keystroke in key order, once read; null until then or after another tab wrote. */
  private cache: KeystrokeEvent[] | null = null;
  private loading: Promise<KeystrokeEvent[]> | null = null;
  /** Bumped by every write while nothing is cached, so a read already under way is not kept. */
  private generation = 0;
  private channel: BroadcastChannel | null = null;

  private constructor(private db: IDBDatabase) {
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = () => this.forget();
    // Node (tests) would otherwise keep running for the channel.
    (this.channel as { unref?: () => void }).unref?.();
  }

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

  async add(event: KeystrokeEvent): Promise<number> {
    const id = (await this.tx('readwrite', (s) => s.add(event))) as number;
    this.changed((events) => events.push({ ...event, id }));
    return id;
  }

  async all(): Promise<KeystrokeEvent[]> {
    return (await this.events()).slice();
  }

  /** Events typed at or after `from` (ms since epoch), any language, oldest first. */
  async since(from: number): Promise<KeystrokeEvent[]> {
    return (await this.events())
      .filter((e) => e.timestamp >= from)
      .sort((a, b) => a.timestamp - b.timestamp || (a.id ?? 0) - (b.id ?? 0));
  }

  /** Time of the most recent keystroke, or null with an empty log. */
  latest(): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(STORE, 'readonly').objectStore(STORE).index('timestamp').openCursor(null, 'prev');
      req.onsuccess = () => resolve(req.result ? (req.result.value as KeystrokeEvent).timestamp : null);
      req.onerror = () => reject(req.error);
    });
  }

  /** Events typed in one language, optionally narrowed to one layout. */
  async forLanguage(language: string, layout?: string): Promise<KeystrokeEvent[]> {
    return (await this.events()).filter((e) => e.language === language && (layout === undefined || e.layout === layout));
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
      tx.oncomplete = () => {
        this.changed((events) => {
          events.forEach((e, i) => {
            const layout = plan.get(e.sessionId);
            if (layout !== undefined && layout !== e.layout) events[i] = { ...e, layout };
          });
        });
        resolve(changed);
      };
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
      const added: KeystrokeEvent[] = [];
      for (const id of ids) {
        index.getAllKeys(IDBKeyRange.only(id)).onsuccess = function () {
          for (const key of this.result) store.delete(key);
          if (--pending === 0) {
            for (const { id: _, ...event } of events) {
              store.add(event).onsuccess = function () {
                added.push({ ...event, id: this.result as number });
              };
            }
          }
        };
      }
      tx.oncomplete = () => {
        this.changed((cached) => {
          const kept = cached.filter((e) => !ids.has(e.sessionId));
          cached.length = 0;
          cached.push(...kept, ...added.sort((a, b) => a.id! - b.id!));
        });
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  count(): Promise<number> {
    if (this.cache) return Promise.resolve(this.cache.length);
    return this.tx('readonly', (s) => s.count());
  }

  async clear(): Promise<undefined> {
    await this.tx('readwrite', (s) => s.clear());
    this.changed((events) => {
      events.length = 0;
    });
    return undefined;
  }

  close(): void {
    this.channel?.close();
    this.db.close();
  }

  /** The cached log, read from IndexedDB the first time. */
  private events(): Promise<KeystrokeEvent[]> {
    if (this.cache) return Promise.resolve(this.cache);
    if (!this.loading) {
      const generation = this.generation;
      const read = (this.tx('readonly', (s) => s.getAll()) as Promise<KeystrokeEvent[]>).then((events) => {
        if (generation === this.generation) this.cache = events;
        return events;
      });
      const done = () => {
        if (this.loading === read) this.loading = null;
      };
      read.then(done, done);
      this.loading = read;
    }
    return this.loading;
  }

  /** Applies a finished write to the cache, or makes the next read go to IndexedDB, and tells other tabs. */
  private changed(apply: (events: KeystrokeEvent[]) => void): void {
    if (this.cache) apply(this.cache);
    else this.forget();
    this.channel?.postMessage('changed');
  }

  private forget(): void {
    this.cache = null;
    this.loading = null;
    this.generation++;
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
