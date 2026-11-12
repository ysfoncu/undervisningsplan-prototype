import { useEffect, useState } from "react";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import type { Provider } from "@lexical/yjs";
import type { Annotation } from "./types";
import { clearMedia } from "./media";

/**
 * Prototype transport for live co-editing.
 *
 * One Y.Doc per plan holds everything that must change together:
 *   - "root"         the Lexical document (text + annotation MarkNodes)
 *   - "annotations"  Y.Map id → Annotation (what each mark means)
 * Tabs talk over BroadcastChannel; the doc is kept in localStorage. A real
 * system swaps this file for a Yjs WebSocket server with auth per plan.
 *
 * Fixes from the design review: a join handshake (state vectors) so a tab with
 * a stale copy catches up, merge-before-save so no tab overwrites updates it
 * has not seen, and annotation data inside the doc so it travels in order
 * with the edits.
 */

/**
 * Demo reset generation. Keys and channels include it, so a tab left over
 * from before a reset (e.g. a throttled background tab) can never talk to or
 * save into the new session; it reloads as soon as it notices.
 */
const GEN_KEY = "undervisningsplan-gen";
const GEN = (() => {
  try {
    return localStorage.getItem(GEN_KEY) ?? "0";
  } catch {
    return "0";
  }
})();
const DOC_KEY = (id: string) => `undervisningsplan-ydoc-v1-${GEN}-${id}`;
const CHANNEL = (id: string) => `undervisningsplan-yjs-${GEN}-${id}`;

/** True if a reset happened in another tab since this page loaded. */
export function isStale(): boolean {
  try {
    return (localStorage.getItem(GEN_KEY) ?? "0") !== GEN;
  } catch {
    return false;
  }
}
const RESET_CHANNEL = "undervisningsplan-reset";
const REMOTE = "remote";
const STORAGE = "storage";

type Msg =
  | { t: "hello"; sv: Uint8Array } // I joined: here is what I have
  | { t: "diff"; u: Uint8Array; sv?: Uint8Array } // updates you lacked (+ my state, so you can answer)
  | { t: "u"; u: Uint8Array } // live update
  | { t: "a"; u: Uint8Array } // awareness (presence, cursors)
  | { t: "a?" }; // please send your awareness

interface View {
  doc: Y.Doc;
  awareness: Awareness;
}

interface Entry {
  /** The tab's hub copy: stored, shared with other tabs, holds annotations/meta. */
  doc: Y.Doc;
  /** Presence of everyone (other tabs and this tab's editors), for avatars. */
  awareness: Awareness;
  channel: BroadcastChannel;
  /** Editors mounted in this tab; each binds to its own view doc. */
  views: Set<View>;
  /** True when this tab found no stored copy and may seed the document. */
  fresh: boolean;
}

const entries = new Map<string, Entry>();
/** Set during a demo reset so unloading tabs do not write old docs back. */
let resetting = false;

function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function readStored(id: string): Uint8Array | null {
  try {
    const s = localStorage.getItem(DOC_KEY(id));
    return s ? unb64(s) : null;
  } catch {
    return null;
  }
}

/** Merge with what is stored, so a tab missing updates never overwrites them. */
function persist(id: string, doc: Y.Doc) {
  if (resetting || isStale()) return;
  try {
    const stored = readStored(id);
    const local = Y.encodeStateAsUpdate(doc);
    localStorage.setItem(DOC_KEY(id), b64(stored ? Y.mergeUpdates([stored, local]) : local));
  } catch {
    /* storage full or blocked: the live session still works */
  }
}

export function getEntry(id: string): Entry {
  const existing = entries.get(id);
  if (existing) return existing;

  const doc = new Y.Doc();
  const stored = readStored(id);
  if (stored) Y.applyUpdate(doc, stored, STORAGE);
  const awareness = new Awareness(doc);
  awareness.setLocalState(null); // the editor plugin sets name/colour/cursor
  const channel = new BroadcastChannel(CHANNEL(id));
  const entry: Entry = { doc, awareness, channel, views: new Set(), fresh: !stored };
  entries.set(id, entry);

  const post = (m: Msg) => channel.postMessage(m);
  let saveTimer = 0;
  doc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || origin === STORAGE) return;
    post({ t: "u", u });
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => persist(id, doc), 250);
  });
  awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === REMOTE) return;
    post({ t: "a", u: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]) });
  });
  channel.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.t === "u") Y.applyUpdate(doc, m.u, REMOTE);
    else if (m.t === "hello") {
      post({ t: "diff", u: Y.encodeStateAsUpdate(doc, m.sv), sv: Y.encodeStateVector(doc) });
      post({ t: "a", u: encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]) });
    } else if (m.t === "diff") {
      Y.applyUpdate(doc, m.u, REMOTE);
      // Send back anything the other tab lacks (both sides converge).
      if (m.sv) post({ t: "u", u: Y.encodeStateAsUpdate(doc, m.sv) });
    } else if (m.t === "a") {
      applyAwarenessUpdate(awareness, m.u, REMOTE);
      entry.views.forEach((v) => applyAwarenessUpdate(v.awareness, m.u, REMOTE));
    }
    else if (m.t === "a?") post({ t: "a", u: encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]) });
  };
  post({ t: "hello", sv: Y.encodeStateVector(doc) });
  post({ t: "a?" });

  const leave = () => {
    removeAwarenessStates(awareness, [doc.clientID], "local");
    persist(id, doc);
  };
  window.addEventListener("pagehide", leave);
  return entry;
}

const HUB = "hub";

/**
 * Lexical CollaborationPlugin provider.
 *
 * Lexical's v1 binding only reacts to Yjs change events; it never loads what
 * is already in a doc when it attaches. So each editor gets a fresh view doc,
 * and on connect the hub's full state is replayed into it as an update. After
 * that, updates flow both ways between view and hub. Each editor also has its
 * own Awareness on its view doc, so its own cursor is never drawn as remote.
 *
 * "synced" is reported after a short wait for other tabs to answer the hello,
 * so a tab opening a plan that is open elsewhere never seeds it a second time.
 */
export function createProvider(id: string, yjsDocMap: Map<string, Y.Doc>): Provider {
  const entry = getEntry(id);
  const viewDoc = new Y.Doc();
  const view: View = { doc: viewDoc, awareness: new Awareness(viewDoc) };
  view.awareness.setLocalState(null);
  yjsDocMap.set(id, viewDoc);

  const handlers: Record<string, Set<(arg: never) => void>> = {};
  const emit = (type: string, arg: unknown) => handlers[type]?.forEach((cb) => (cb as (a: unknown) => void)(arg));
  const fromHub = (u: Uint8Array, origin: unknown) => {
    if (origin !== viewDoc) Y.applyUpdate(viewDoc, u, HUB);
  };
  const toHub = (u: Uint8Array, origin: unknown) => {
    if (origin !== HUB) Y.applyUpdate(entry.doc, u, viewDoc);
  };
  const awarenessOut = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === REMOTE) return;
    const u = encodeAwarenessUpdate(view.awareness, [...added, ...updated, ...removed]);
    applyAwarenessUpdate(entry.awareness, u, REMOTE); // this tab's presence list
    entry.views.forEach((v) => v !== view && applyAwarenessUpdate(v.awareness, u, REMOTE));
    entry.channel.postMessage({ t: "a", u } satisfies Msg);
  };
  let timer = 0;
  let connected = false;

  const provider = {
    awareness: view.awareness,
    connect() {
      if (connected) return;
      connected = true;
      entry.views.add(view);
      // Replay the hub into the (empty) view doc so the binding sees it as changes.
      Y.applyUpdate(viewDoc, Y.encodeStateAsUpdate(entry.doc), HUB);
      entry.doc.on("update", fromHub);
      viewDoc.on("update", toHub);
      // Everyone already present (other tabs).
      const known = [...entry.awareness.getStates().keys()];
      if (known.length) applyAwarenessUpdate(view.awareness, encodeAwarenessUpdate(entry.awareness, known), REMOTE);
      view.awareness.on("update", awarenessOut);
      // The plugin sets name/colour just before connect(); announce it now.
      if (view.awareness.getLocalState()) awarenessOut({ added: [viewDoc.clientID], updated: [], removed: [] }, "local");
      emit("status", { status: "connected" });
      timer = window.setTimeout(() => emit("sync", true), entry.fresh ? 200 : 30);
    },
    disconnect() {
      if (!connected) return;
      connected = false;
      window.clearTimeout(timer);
      removeAwarenessStates(view.awareness, [viewDoc.clientID], "local");
      view.awareness.off("update", awarenessOut);
      entry.doc.off("update", fromHub);
      viewDoc.off("update", toHub);
      entry.views.delete(view);
    },
    on(type: string, cb: (arg: never) => void) {
      (handlers[type] ??= new Set()).add(cb);
    },
    off(type: string, cb: (arg: never) => void) {
      handlers[type]?.delete(cb);
    },
  };
  window.addEventListener("pagehide", () => provider.disconnect());
  return provider as unknown as Provider;
}

// The template the owner picked for a new plan in this tab; the editor seeds the
// empty document with it once (see TEMPLATES in data.ts).
const chosenTemplates = new Map<string, string>();
export function setStartTemplate(id: string, docJson: string) {
  chosenTemplates.set(id, docJson);
}
export function getStartTemplate(id: string): string | undefined {
  return chosenTemplates.get(id);
}
/** Forget a deleted plan's document. */
export function deleteDoc(id: string) {
  try {
    localStorage.removeItem(DOC_KEY(id));
  } catch {
    /* ignore */
  }
}

/** True if this tab may seed the Lexical root (no stored copy existed). */
export function mayBootstrap(id: string): boolean {
  return getEntry(id).fresh;
}

// ─── Annotation records (inside the doc) ────────────────────────────────────

function annMap(id: string) {
  return getEntry(id).doc.getMap<Annotation>("annotations");
}

export function setAnnotation(planId: string, a: Annotation) {
  annMap(planId).set(a.id, a);
}
export function patchAnnotation(planId: string, annId: string, patch: Partial<Annotation>) {
  const m = annMap(planId);
  const cur = m.get(annId);
  if (cur) m.set(annId, { ...cur, ...patch });
}
export function deleteAnnotationRecord(planId: string, annId: string) {
  annMap(planId).delete(annId);
}
export function getAnnotation(planId: string, annId: string): Annotation | undefined {
  return annMap(planId).get(annId);
}

/** Live list of annotation records for a plan. */
export function useAnnotations(planId: string): Annotation[] {
  const m = annMap(planId);
  const [list, setList] = useState<Annotation[]>(() => [...m.values()]);
  useEffect(() => {
    const on = () => setList([...m.values()]);
    on();
    m.observe(on);
    return () => m.unobserve(on);
  }, [m]);
  return list;
}

// ─── Presence ───────────────────────────────────────────────────────────────

export interface Present {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  focusing: boolean;
}

export function usePresence(planId: string): Present[] {
  const { awareness, doc } = getEntry(planId);
  const read = () =>
    [...awareness.getStates().entries()]
      .filter(([c, s]) => c !== doc.clientID && s && (s as { awarenessData?: { userId?: string } }).awarenessData?.userId)
      .map(([clientId, s]) => {
        const st = s as { name: string; color: string; focusing: boolean; awarenessData: { userId: string } };
        return { clientId, userId: st.awarenessData.userId, name: st.name, color: st.color, focusing: st.focusing };
      });
  const [list, setList] = useState<Present[]>(read);
  useEffect(() => {
    const on = () => setList(read());
    on();
    awareness.on("change", on);
    return () => awareness.off("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareness]);
  return list;
}

// ─── Reset (demo) ───────────────────────────────────────────────────────────

/** Remove all stored demo data (plans and docs) and reload every open tab. */
export function resetAll() {
  resetting = true;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("undervisningsplan-") && !k.endsWith("-me"))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(GEN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  new BroadcastChannel(RESET_CHANNEL).postMessage("reset");
  // Photos/videos live in IndexedDB; clear them before reloading.
  void clearMedia()
    .catch(() => undefined)
    .finally(() => window.location.reload());
}

new BroadcastChannel(RESET_CHANNEL).onmessage = () => {
  resetting = true;
  window.location.reload();
};

/** True while the page is reloading for a reset, or the page is from before one (the store must not save). */
export function isResetting() {
  return resetting || isStale();
}

// A reset in another tab: reload as soon as we notice (storage event or tab focus).
window.addEventListener("storage", (e) => {
  if (e.key === GEN_KEY && isStale()) {
    resetting = true;
    window.location.reload();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isStale()) {
    resetting = true;
    window.location.reload();
  }
});
