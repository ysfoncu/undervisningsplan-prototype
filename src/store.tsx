import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { deleteDoc, isResetting, resetAll, setStartTemplate } from "./collab";
import { seed, TEMPLATES, type TemplateId } from "./data";
import { fmtOffset, nowIso, uid } from "./format";
import { fill, L } from "./labels";
import type { Access, MediaRef, Note, NoteKind, Plan, PlanInfo, State, User } from "./types";
import { deleteMedia } from "./media";

export const STORAGE_KEY = "undervisningsplan-proto-v6";
const ME_KEY = "undervisningsplan-proto-me";
const EXAMPLE_IDS = ["p-brok", "p-dikt", "p-vann"];

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      // The example plans were removed from the prototype; drop stored copies.
      return { ...s, plans: s.plans.filter((p) => !EXAMPLE_IDS.includes(p.id)) };
    }
  } catch {
    /* storage blocked or corrupt: fall back to seed */
  }
  return seed();
}
function persist(s: State) {
  if (isResetting()) return;
  try {
    const json = JSON.stringify(s);
    // Skip identical writes so tabs do not echo each other's changes.
    if (localStorage.getItem(STORAGE_KEY) !== json) localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
}

// ─── Reducer ────────────────────────────────────────────────────────────────
type Action = { type: "reset" } | { type: "replace"; state: State } | { type: "createPlan"; plan: Plan } | { type: "deletePlan"; id: string } | { type: "updatePlan"; id: string; fn: (p: Plan) => Plan };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return seed();
    case "replace":
      return a.state;
    case "createPlan":
      return { ...state, plans: [a.plan, ...state.plans] };
    case "deletePlan":
      return { ...state, plans: state.plans.filter((p) => p.id !== a.id) };
    case "updatePlan":
      return { ...state, plans: state.plans.map((p) => (p.id === a.id ? { ...a.fn(p), updatedAt: nowIso() } : p)) };
  }
}

const logged = (p: Plan, text: string): Plan => ({ ...p, log: [...p.log, { at: nowIso(), text }] });

// ─── Derived state ──────────────────────────────────────────────────────────
export type StatusKey = keyof typeof L.status;

export function statusOf(p: Plan): StatusKey {
  if (p.phase === "done") return "done";
  if (p.observations.some((o) => !o.endedAt)) return "observing";
  if (p.phase === "observe") return p.summary?.sharedAt ? "summaryReady" : "awaitingSummary";
  return p.participants.length > 0 ? "published" : "draft";
}

/** Photos and video from the classroom: only the student and the observers. */
export function canSeeMedia(p: Plan, userId: string): boolean {
  const a = accessOf(p, userId);
  return a === "owner" || a === "observator";
}

/** Everyone in the plan can react to and comment on shared notes until it is completed. */
export function canReactOn(p: Plan, userId: string): boolean {
  return p.phase !== "done" && accessOf(p, userId) !== null;
}

/** Change one note, but only in an ended (shared) observation. */
function mapSharedNote(p: Plan, noteId: string, fn: (n: Note) => Note): Plan {
  return {
    ...p,
    observations: p.observations.map((o) => (o.endedAt && o.notes.some((n) => n.id === noteId) ? { ...o, notes: o.notes.map((n) => (n.id === noteId ? fn(n) : n)) } : o)),
  };
}

export function accessOf(p: Plan, userId: string): Access | "owner" | null {
  if (p.ownerId === userId) return "owner";
  return p.participants.find((x) => x.userId === userId)?.access ?? null;
}

/**
 * Who writes the final feedback: the first observer who is a supervisor,
 * otherwise the first observer.
 */
export function summaryAuthorOf(p: Plan, users: User[]): User | null {
  const obs = p.participants.filter((x) => x.access === "observator").map((x) => users.find((u) => u.id === x.userId)!);
  return obs.find((u) => u.role === "veileder") ?? obs[0] ?? null;
}

/** A new plan starts empty: the student sets date, time and duration. */
export function emptyInfo(): PlanInfo {
  return { title: "", className: "", subject: "", date: "", startTime: "" };
}

/** What is still missing before the plan can be shared: only a name (date and time are optional). */
export function missingForShare(p: Plan): { title: boolean } {
  return { title: !p.info.title.trim() };
}


// ─── Context ────────────────────────────────────────────────────────────────
interface Store {
  state: State;
  me: User;
  setMe: (id: string) => void;
  user: (id: string) => User;
  toast: string | null;
  showToast: (msg: string) => void;
  reset: () => void;
  createPlan: () => string;
  /** Owner picks the starting text of a new plan: a template, or null for "Tom plan". */
  chooseTemplate: (planId: string, templateId: TemplateId | null) => void;
  /** Owner only: removes the plan, its document and its photos for everyone. */
  deletePlan: (planId: string) => void;
  saveInfo: (planId: string, info: PlanInfo) => void;
  /** The tab that edited reports plain text + open-annotation count; logs one "edited" line per person per session. */
  saveBody: (planId: string, text: string, openCount: number) => void;
  /** History line for an action that is not an edit (accept/dismiss a suggestion, …). */
  logEvent: (planId: string, text: string) => void;
  addComment: (planId: string, text: string) => void;
  editComment: (planId: string, commentId: string, text: string) => void;
  deleteComment: (planId: string, commentId: string) => void;
  invite: (planId: string, userId: string, access: Access) => void;
  setAccess: (planId: string, userId: string, access: Access) => void;
  removeParticipant: (planId: string, userId: string) => void;
  markSeen: (planId: string) => void;
  startObservation: (planId: string) => void;
  addNote: (planId: string, note: { kind: NoteKind; text: string; media?: MediaRef[] }) => void;
  deleteNote: (planId: string, noteId: string) => void;
  /** Own notes only, until the plan is completed. Removed files are deleted. */
  updateNote: (planId: string, noteId: string, patch: { kind: NoteKind; text: string; media?: MediaRef[] }) => void;
  endObservation: (planId: string) => void;
  /** Observer resumes their ended observation; the lesson clock continues where it stopped. */
  restartObservation: (planId: string) => void;
  fastForward: (planId: string, sec: number) => void;
  saveSummary: (planId: string, feedback: string, nextSteps: string, share: boolean) => void;
  /** Optional closing comment from the student, shown in the report. */
  markDone: (planId: string, finalNote?: string) => void;
  /** Anyone in the plan, on notes of ended observations, until completed. */
  toggleReaction: (planId: string, noteId: string, emoji: string) => void;
  addNoteReply: (planId: string, noteId: string, text: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [meId, setMeId] = useState<string>(() => {
    try {
      // Per tab, so two tabs can be two different people editing together.
      return sessionStorage.getItem(ME_KEY) || localStorage.getItem(ME_KEY) || "u-ingrid";
    } catch {
      return "u-ingrid";
    }
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => persist(state), [state]);
  // Another tab changed the shared state: take it over.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        dispatch({ type: "replace", state: JSON.parse(e.newValue) as State });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const user = useCallback((id: string) => state.users.find((u) => u.id === id) ?? state.users[0], [state.users]);
  const me = user(meId);
  const upd = (id: string, fn: (p: Plan) => Plan) => dispatch({ type: "updatePlan", id, fn });

  const store = useMemo<Store>(
    () => ({
      state,
      me,
      user,
      toast,
      showToast: setToast,
      setMe: (id) => {
        setMeId(id);
        try {
          sessionStorage.setItem(ME_KEY, id);
          localStorage.setItem(ME_KEY, id);
        } catch {
          /* ignore */
        }
      },
      reset: () => resetAll(),
      createPlan: () => {
        const id = "p-" + uid();
        const t = nowIso();
        dispatch({
          type: "createPlan",
          plan: {
            id,
            ownerId: me.id,
            phase: "plan",
            info: emptyInfo(),
            body: "",
            editedBy: [],
            openCount: 0,
            comments: [],
            participants: [],
            observations: [],
            summary: null,
            log: [{ at: t, text: L.hCreated }],
            createdAt: t,
            updatedAt: t,
            doneAt: null,
            templatePending: true,
          },
        });
        return id;
      },
      chooseTemplate: (planId, templateId) => {
        const t = TEMPLATES.find((x) => x.id === templateId);
        if (t) setStartTemplate(planId, t.doc);
        upd(planId, (p) => (p.templatePending ? logged({ ...p, templatePending: false }, t ? fill(L.hTemplate, { name: L.templates[t.id].name }) : L.hNoTemplate) : p));
      },
      deletePlan: (planId) => {
        const p = state.plans.find((x) => x.id === planId);
        if (!p || p.ownerId !== me.id) return;
        p.observations.flatMap((o) => o.notes).flatMap((n) => n.media ?? []).forEach((m) => void deleteMedia(m.id));
        deleteDoc(planId);
        dispatch({ type: "deletePlan", id: planId });
      },
      saveInfo: (planId, info) => upd(planId, (p) => ({ ...p, info })),
      saveBody: (planId, text, openCount) =>
        upd(planId, (p) => {
          if (p.body === text && p.openCount === openCount) return p;
          const next = { ...p, body: text, openCount };
          if (p.body === text) return next;
          // One history line per person per editing session (10 min).
          const line = fill(L.hEdited, { name: me.name });
          const last = [...p.log].reverse().find((e) => e.text === line);
          if (last && Date.now() - new Date(last.at).getTime() < 10 * 60_000) return next;
          return logged({ ...next, editedBy: p.editedBy.includes(me.id) ? p.editedBy : [...p.editedBy, me.id] }, line);
        }),
      logEvent: (planId, text) => upd(planId, (p) => logged(p, text)),
      addComment: (planId, text) =>
        upd(planId, (p) => ({
          ...p,
          comments: [...p.comments, { id: uid(), authorId: me.id, text, createdAt: nowIso(), editedAt: null }],
        })),
      editComment: (planId, commentId, text) =>
        upd(planId, (p) => ({ ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, text, editedAt: nowIso() } : c)) })),
      deleteComment: (planId, commentId) => upd(planId, (p) => ({ ...p, comments: p.comments.filter((c) => c.id !== commentId) })),
      invite: (planId, userId, access) =>
        upd(planId, (p) =>
          // No sharing without a name.
          missingForShare(p).title || p.participants.some((x) => x.userId === userId)
            ? p
            : logged(
                { ...p, participants: [...p.participants, { userId, access, invitedAt: nowIso(), seenAt: null }] },
                fill(L.hInvited, { name: user(userId).name, access: L.access[access] }),
              ),
        ),
      setAccess: (planId, userId, access) =>
        upd(planId, (p) => ({ ...p, participants: p.participants.map((x) => (x.userId === userId ? { ...x, access } : x)) })),
      removeParticipant: (planId, userId) => upd(planId, (p) => ({ ...p, participants: p.participants.filter((x) => x.userId !== userId) })),
      markSeen: (planId) =>
        upd(planId, (p) => ({
          ...p,
          participants: p.participants.map((x) => (x.userId === me.id && !x.seenAt ? { ...x, seenAt: nowIso() } : x)),
        })),
      startObservation: (planId) =>
        upd(planId, (p) =>
          // Only invited observers observe; the owner cannot observe their own plan.
          accessOf(p, me.id) !== "observator" || p.observations.some((o) => o.observerId === me.id)
            ? p
            : logged(
                {
                  ...p,
                  phase: "observe",
                  // Join the lesson clock of anyone already observing, so all
                  // observers' notes line up in time.
                  observations: [
                    ...p.observations,
                    {
                      observerId: me.id,
                      startedAt:
                        p.observations
                          .filter((o) => !o.endedAt)
                          .map((o) => o.startedAt)
                          .sort()[0] ?? nowIso(),
                      endedAt: null,
                      notes: [],
                    },
                  ],
                },
                fill(L.hObsStart, { name: me.name }),
              ),
        ),
      addNote: (planId, note) =>
        upd(planId, (p) => ({
          ...p,
          observations: p.observations.map((o) => {
            if (o.observerId !== me.id || o.endedAt) return o;
            const offsetSec = (Date.now() - new Date(o.startedAt).getTime()) / 1000;
            return { ...o, notes: [...o.notes, { id: uid(), offsetSec, ...note }] };
          }),
        })),
      deleteNote: (planId, noteId) =>
        upd(planId, (p) => {
          const mine = p.observations.find((o) => o.observerId === me.id);
          const note = mine?.notes.find((n) => n.id === noteId);
          if (!mine || !note || p.phase === "done") return p;
          // Remove the note's files too.
          note.media?.forEach((m) => void deleteMedia(m.id));
          const next = {
            ...p,
            observations: p.observations.map((o) => (o === mine ? { ...o, notes: o.notes.filter((n) => n.id !== noteId) } : o)),
          };
          // Notes are hidden while observing; only log changes others could already see.
          return mine.endedAt ? logged(next, fill(L.hNoteDeleted, { name: me.name, t: fmtOffset(note.offsetSec) })) : next;
        }),
      updateNote: (planId, noteId, patch) =>
        upd(planId, (p) => {
          const mine = p.observations.find((o) => o.observerId === me.id);
          const note = mine?.notes.find((n) => n.id === noteId);
          if (!mine || !note || p.phase === "done") return p;
          const media = patch.media && patch.media.length ? patch.media : undefined;
          note.media?.filter((m) => !media?.some((k) => k.id === m.id)).forEach((m) => void deleteMedia(m.id));
          const next = {
            ...p,
            observations: p.observations.map((o) =>
              o === mine ? { ...o, notes: o.notes.map((n) => (n.id === noteId ? { ...n, kind: patch.kind, text: patch.text, media, editedAt: nowIso() } : n)) } : o,
            ),
          };
          return mine.endedAt ? logged(next, fill(L.hNoteEdited, { name: me.name, t: fmtOffset(note.offsetSec) })) : next;
        }),
      endObservation: (planId) =>
        upd(planId, (p) =>
          logged(
            { ...p, observations: p.observations.map((o) => (o.observerId === me.id ? { ...o, endedAt: nowIso() } : o)) },
            fill(L.hObsEnd, { name: me.name }),
          ),
        ),
      restartObservation: (planId) =>
        upd(planId, (p) => {
          const o = p.observations.find((x) => x.observerId === me.id);
          if (!o?.endedAt || p.phase === "done" || accessOf(p, me.id) !== "observator") return p;
          // Shift the start by the pause, so offsets of old and new notes stay on one lesson clock.
          const pauseMs = Date.now() - new Date(o.endedAt).getTime();
          const startedAt = new Date(new Date(o.startedAt).getTime() + pauseMs).toISOString();
          return logged(
            {
              ...p,
              phase: "observe",
              observations: p.observations.map((x) => (x.observerId === me.id ? { ...x, startedAt, endedAt: null } : x)),
            },
            fill(L.hObsRestart, { name: me.name }),
          );
        }),
      fastForward: (planId, sec) =>
        upd(planId, (p) => ({
          ...p,
          observations: p.observations.map((o) =>
            !o.endedAt ? { ...o, startedAt: new Date(new Date(o.startedAt).getTime() - sec * 1000).toISOString() } : o,
          ),
        })),
      saveSummary: (planId, feedback, nextSteps, share) =>
        upd(planId, (p) => {
          const next: Plan = {
            ...p,
            summary: {
              authorId: me.id,
              feedback,
              nextSteps,
              sharedAt: share ? nowIso() : p.summary?.sharedAt ?? null,
              replies: p.summary?.replies ?? [],
            },
          };
          return share ? logged(next, L.hSummary) : next;
        }),
      markDone: (planId, finalNote) =>
        upd(planId, (p) =>
          logged({ ...p, phase: "done", doneAt: nowIso(), finalNote: finalNote?.trim() ? { text: finalNote.trim(), at: nowIso() } : null }, L.hDone),
        ),
      toggleReaction: (planId, noteId, emoji) =>
        upd(planId, (p) =>
          canReactOn(p, me.id)
            ? mapSharedNote(p, noteId, (n) => {
                const who = n.reactions?.[emoji] ?? [];
                const nextWho = who.includes(me.id) ? who.filter((x) => x !== me.id) : [...who, me.id];
                const reactions = { ...n.reactions, [emoji]: nextWho };
                if (!nextWho.length) delete reactions[emoji];
                return { ...n, reactions };
              })
            : p,
        ),
      addNoteReply: (planId, noteId, text) =>
        upd(planId, (p) =>
          canReactOn(p, me.id) ? mapSharedNote(p, noteId, (n) => ({ ...n, replies: [...(n.replies ?? []), { id: uid(), authorId: me.id, text, at: nowIso() }] })) : p,
        ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, me, toast, user],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
