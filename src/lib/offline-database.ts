/** Owns IndexedDB lifetime and commits each cache update in one transaction. */
export class OfflineDatabase {
  private connection?: Promise<IDBDatabase>;
  private readonly name: string;

  constructor(name: string) { this.name = name; }

  private open() {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore("drafts", { keyPath: "operation_id" });
        request.result.createObjectStore("data");
      };
      request.onblocked = () => {
        abandoned = true;
        reject(new Error("סגרו כרטיסיות ישנות של האפליקציה ונסו שוב."));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (abandoned) { database.close(); return; }
        database.onclose = () => { this.connection = undefined; };
        database.onversionchange = () => { database.close(); this.connection = undefined; };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => { this.connection = undefined; throw error; });
    return this.connection;
  }

  async access<T>(store: "drafts" | "data", mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(store, mode);
      const request = run(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("לא ניתן לשמור במכשיר."));
    });
  }

  /** Read and write inside the same transaction; concurrent tabs cannot lose updates. */
  async update<T>(key: string, transform: (previous: T | undefined) => T | undefined, extra?: { key: string; value: unknown }) {
    const database = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("data", "readwrite");
      const store = transaction.objectStore("data");
      const request = store.get(key);
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const value = transform(request.result as T | undefined);
          if (value !== undefined) store.put(value, key);
          if (extra) store.put(extra.value, extra.key);
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("לא ניתן לשמור במכשיר."));
    });
  }
}
