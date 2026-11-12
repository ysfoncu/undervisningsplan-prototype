import { useEffect, useState } from "react";

/**
 * Photos and videos attached to observation notes.
 *
 * Prototype storage: the files live in this browser's IndexedDB (localStorage
 * is far too small for video); notes keep only a reference. Tabs of the same
 * browser share it. A real system uploads to private object storage with
 * access limited to the student and the observers, and a retention period.
 */

const DB = "undervisningsplan-media";
const STORE = "files";
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putMedia = (id: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, id));
export const getMedia = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteMedia = (id: string) => tx("readwrite", (s) => s.delete(id));
export const clearMedia = () => tx("readwrite", (s) => s.clear());

/** Phone photos are several MB; scale to at most 1600 px and re-encode as JPEG. */
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

/** Object URL for a stored file; revoked when the component unmounts. */
export function useMediaUrl(id: string): string | null | "missing" {
  const [url, setUrl] = useState<string | null | "missing">(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    getMedia(id)
      .then((b) => {
        if (!alive) return;
        if (!b) return setUrl("missing");
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => alive && setUrl("missing"));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

export function fmtBytes(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;
}
