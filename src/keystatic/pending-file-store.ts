/**
 * IndexedDB-backed store for files pending upload in Keystatic create mode.
 *
 * When a user drops a file in create mode (before saving), the file is held
 * here rather than uploaded immediately (the destination slug doesn't exist
 * on disk yet). After Keystatic saves and navigates to the edit URL, the
 * consuming component retrieves the pending file, uploads it, and deletes
 * the record.
 *
 * Key format: `{collection}/{slug}/{filename}` — e.g. `works/my-piece/thumbnail.jpg`
 */

const DB_NAME = 'keystatic-pending-files'
const DB_VERSION = 1
const STORE_NAME = 'files'

interface PendingFileRecord {
  key: string
  blob: Blob
  fileName: string
  timestamp: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function storePendingFile(key: string, file: File): Promise<void> {
  const db = await openDb()
  const record: PendingFileRecord = {
    key,
    blob: file,
    fileName: file.name,
    timestamp: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPendingFile(key: string): Promise<{ blob: Blob; fileName: string } | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => {
      const record = req.result as PendingFileRecord | undefined
      resolve(record ? { blob: record.blob, fileName: record.fileName } : null)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deletePendingFile(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Retrieve all pending files whose key starts with the given prefix.
 * Used to recover pending files after navigating from create → edit page.
 */
export async function getAllPendingFiles(
  prefix: string,
): Promise<Array<{ key: string; blob: Blob; fileName: string }>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => {
      const records = (req.result as PendingFileRecord[]) || []
      resolve(
        records
          .filter((r) => r.key.startsWith(prefix))
          .map(({ key, blob, fileName }) => ({ key, blob, fileName })),
      )
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Remove records older than maxAgeMs (default 1 hour).
 * Called on mount of preview components to prevent IndexedDB bloat from
 * abandoned create flows.
 */
export async function cleanupStaleFiles(maxAgeMs = 3_600_000): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      const now = Date.now()
      for (const record of req.result as PendingFileRecord[]) {
        if (now - record.timestamp > maxAgeMs) {
          store.delete(record.key)
        }
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Re-key a pending file record (e.g. when the user changes the slug in create mode).
 * Deletes the old key and stores under the new key, preserving blob and timestamp.
 */
export async function rekeyPendingFile(oldKey: string, newKey: string): Promise<void> {
  if (oldKey === newKey) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(oldKey)
    req.onsuccess = () => {
      const record = req.result as PendingFileRecord | undefined
      if (record) {
        store.delete(oldKey)
        store.put({ ...record, key: newKey })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
