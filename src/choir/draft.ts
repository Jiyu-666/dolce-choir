/** Dedicated choir draft store: never overwrites the original editor/OMR draft. */
const DB = "dolce-choir", STORE = "draft", KEY = "current";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
export async function saveChoirDraft(bytes: Uint8Array): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(bytes, KEY);
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function loadChoirDraft(): Promise<Uint8Array | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly"), r = tx.objectStore(STORE).get(KEY);
      tx.oncomplete = () => resolve(r.result instanceof Uint8Array ? r.result : null);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
