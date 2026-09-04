// A tiny promise wrapper over IndexedDB. Holds user state only — settings,
// reading history, and bookmarks. Credentials are NEVER stored here.

import { DB_NAME, DB_VERSION, DEFAULT_CATALOG_URL } from "../config.js";

let dbPromise = null;

/** Open (and, on first run, create) the database. Cached for the session. */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("history")) {
        const s = db.createObjectStore("history", { keyPath: "id" });
        s.createIndex("by_lastViewedAt", "lastViewedAt");
      }
      if (!db.objectStoreNames.contains("bookmarks")) {
        const s = db.createObjectStore("bookmarks", { keyPath: "id" });
        s.createIndex("by_createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Wrap an IDBRequest as a promise. */
function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(store, mode) {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
}

export async function idbGet(store, key) {
  return wrap((await tx(store, "readonly")).get(key));
}

export async function idbPut(store, value) {
  return wrap((await tx(store, "readwrite")).put(value));
}

export async function idbDelete(store, key) {
  return wrap((await tx(store, "readwrite")).delete(key));
}

/**
 * Return all records in a store, optionally ordered by an index.
 * `direction` is an IDBCursor direction ("next" | "prev").
 */
export async function idbGetAll(store, { index = null, direction = "next" } = {}) {
  const os = await tx(store, "readonly");
  const source = index ? os.index(index) : os;
  if (direction === "next") return wrap(source.getAll());
  // Reverse order: walk a cursor backwards (getAll can't reverse).
  return new Promise((resolve, reject) => {
    const out = [];
    const req = source.openCursor(null, direction);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push(cursor.value);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ------------------------------------------------------------------ settings

/** Read a setting by key, returning `fallback` when unset. */
export async function getSetting(key, fallback = undefined) {
  const row = await idbGet("settings", key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await idbPut("settings", { key, value });
  return value;
}

/**
 * The configured catalog entry-point URL, seeding the default on first run so
 * later reads are stable even if the constant changes.
 */
export async function getCatalogUrl() {
  let url = await getSetting("catalogUrl");
  if (!url) url = await setSetting("catalogUrl", DEFAULT_CATALOG_URL);
  return url;
}

export async function setCatalogUrl(url) {
  return setSetting("catalogUrl", url);
}
