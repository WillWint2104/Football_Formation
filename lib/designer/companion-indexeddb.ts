import { COMPANION_LIMITS, CompanionRepository, CompanionStorageError, type CompanionStorage, type CompanionRecord } from "./companion";

export const COMPANION_DATABASE = "football-formation.session-designer.companions.v1";
export const COMPANION_STORE = "plans";

function failure(error: unknown): CompanionStorageError {
  const name = error instanceof DOMException ? error.name : "";
  return new CompanionStorageError(name === "QuotaExceededError" ? "quota" : name === "AbortError" ? "interrupted" : "unavailable",
    name === "QuotaExceededError" ? "Browser storage quota was exceeded. The transaction was rolled back; keep your in-memory work and download." :
      name === "AbortError" ? "The companion transaction was interrupted. Reopen the plan to verify its saved version before another save." :
        "Companion storage is unavailable. Keep your work and downloads; reopen to verify before another save. No automatic retry was made.");
}
function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = factory.open(COMPANION_DATABASE, 1);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion !== 0) { request.transaction?.abort(); return; }
      request.result.createObjectStore(COMPANION_STORE, { keyPath: "documentId" });
    };
    request.onblocked = () => { settled = true; reject(new CompanionStorageError("unavailable", "Another tab blocks companion storage opening. Close that connection and reopen; no automatic retry was made.")); };
    request.onerror = () => reject(failure(request.error));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      if (db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(COMPANION_STORE)) {
        db.close(); reject(new CompanionStorageError("invalid_record", "The local companion database layout is incompatible. No upgrade or repair was attempted.")); return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

/** No localStorage access. Connections close after every operation; no async work inside the transaction. */
export function indexedDbCompanionStorage(factory?: IDBFactory): CompanionStorage {
  return {
    async transact<T>(mode: "readonly" | "readwrite", work: (records: readonly unknown[]) => { value: T; put?: CompanionRecord }): Promise<T> {
      let db: IDBDatabase;
      try { db = await open(factory ?? globalThis.indexedDB); } catch (error) { throw error instanceof CompanionStorageError ? error : failure(error); }
      try {
        return await new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(COMPANION_STORE, mode, { durability: "strict" });
          const store = transaction.objectStore(COMPANION_STORE);
          if (store.keyPath !== "documentId" || store.autoIncrement) { transaction.abort(); reject(new CompanionStorageError("invalid_record", "Incompatible local store keys. No data was changed.")); return; }
          let output: T, cause: unknown, finished = false;
          transaction.oncomplete = () => { if (!finished) { finished = true; resolve(output); } };
          transaction.onabort = () => { if (!finished) { finished = true; reject(cause instanceof CompanionStorageError ? cause : failure(cause ?? transaction.error ?? new DOMException("Aborted", "AbortError"))); } };
          const stop = (error: unknown) => { cause = error; transaction.abort(); };
          const count = store.count();
          count.onerror = () => { cause = count.error; };
          count.onsuccess = () => {
            if (count.result > COMPANION_LIMITS.documents) { stop(new CompanionStorageError("invalid_record", "The local repository exceeds its supported document count. Nothing was discarded.")); return; }
            const all = store.getAll();
            all.onerror = () => { cause = all.error; };
            all.onsuccess = () => {
              try {
                const result = work(all.result); output = result.value;
                if (result.put) {
                  if (mode !== "readwrite") throw new CompanionStorageError("invalid_record", "A read operation cannot write companion data.");
                  const put = store.put(result.put); put.onerror = () => { cause = put.error; };
                }
              } catch (error) { stop(error); }
            };
          };
        });
      } catch (error) { throw error instanceof CompanionStorageError ? error : failure(error); }
      finally { db.close(); }
    },
  };
}
/** Explicit opt-in construction; importing this module neither opens storage nor changes any draft. */
export function browserCompanionRepository(): CompanionRepository { return new CompanionRepository(indexedDbCompanionStorage()); }
