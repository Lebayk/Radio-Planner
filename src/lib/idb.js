// Petit cache IndexedDB pour les rasters de couverture du sol.
//
// Le cache MNT utilise localStorage, adapte a des milliers de petites valeurs
// numeriques mais plafonne a ~5 Mo. Un raster de clutter fait plusieurs
// centaines de kilo-octets d un bloc : IndexedDB est le bon outil, et il
// stocke les tableaux types sans passer par JSON.

const DB_NAME = 'lrp';
const DB_VERSION = 1;
const STORE = 'clutter';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/** Le cache est un confort : toute panne se solde par un recalcul, pas une erreur. */
export async function idbGet(key) {
  try {
    return await tx('readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function idbPut(key, value) {
  try {
    await tx('readwrite', (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function idbClear() {
  try {
    await tx('readwrite', (s) => s.clear());
    return true;
  } catch {
    return false;
  }
}

/** Nombre d entrees et volume approximatif, pour l affichage. */
export async function idbStats() {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        const bytes = rows.reduce(
          (n, r) => n + (r?.classes?.byteLength ?? 0) + (r?.heights?.byteLength ?? 0),
          0
        );
        resolve({ entries: rows.length, bytes });
      };
      req.onerror = () => resolve({ entries: 0, bytes: 0 });
    });
  } catch {
    return { entries: 0, bytes: 0 };
  }
}
