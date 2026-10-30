/* A small key-value store in IndexedDB.
 *
 * The last file and the work done on it live here, so a refresh picks up where
 * you left off. A photo can be several megabytes, which is too big for
 * localStorage. Every access is guarded: in a private window, or with site
 * data blocked, the page works and simply forgets.
 */

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export function openStore(name = "nanobands"): Store {
  let db: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const t = (await open()).transaction("kv", mode), req = fn(t.objectStore("kv"));
    return new Promise((res, rej) => {
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: <T>(k: string) => run("readonly", (s) => s.get(k) as IDBRequest<T | undefined>).catch(() => undefined),
    set: (k, v) => run("readwrite", (s) => s.put(v, k)).then(() => undefined, () => undefined),
    del: (k) => run("readwrite", (s) => s.delete(k)).then(() => undefined, () => undefined),
  };
}
