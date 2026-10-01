import type { KeystrokeEvent } from './types';

const DB_NAME = 'typing-trainer';
const DB_VERSION = 1;
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
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('timestamp', 'timestamp');
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
  'id', 'sessionId', 'timestamp', 'position', 'expected', 'actual',
  'prevExpected', 'prevActual', 'latencyMs', 'correct',
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
