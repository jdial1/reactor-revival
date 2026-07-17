const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";

function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let req;
      try {
        req = fn(store);
      } catch (err) {
        reject(err);
        db.close();
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve(req === undefined ? undefined : req.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

export function get(key) {
  return withStore("readonly", (store) => store.get(key));
}

export function set(key, value) {
  return withStore("readwrite", (store) => store.put(value, key));
}

export function del(key) {
  return withStore("readwrite", (store) => store.delete(key));
}

export function clear() {
  return withStore("readwrite", (store) => store.clear());
}
