import { useEffect, useMemo, useRef, useState } from "react";
import { PlanEditor } from "../components/PlanEditor";
import { useAnnotations } from "../collab";
import { fmtDateTime, fmtOffset } from "../format";
import { fill, L } from "../labels";
import { accessOf, canReactOn, canSeeMedia, statusOf, summaryAuthorOf, useStore } from "../store";
import type { MediaRef, Note, NoteKind, Observation, Plan } from "../types";
import { Avatar, Dialog, Empty, Icon, When } from "../components/ui";
import { fmtBytes, MAX_VIDEO_BYTES, putMedia, shrinkImage, useMediaUrl } from "../media";

export const KINDS: NoteKind[] = ["styrke", "forslag", "sporsmal"];
export const KIND_ICON: Record<NoteKind, string> = { styrke: "★", forslag: "💡", sporsmal: "?" };

export function ObserveTab({ plan }: { plan: Plan }) {
  const { me, state, startObservation, restartObservation, showToast } = useStore();
  const access = accessOf(plan, me.id);
  const isOwner = access === "owner";
  const mine = plan.observations.find((o) => o.observerId === me.id);
  const active = plan.observations.filter((o) => !o.endedAt);
  const ended = plan.observations.filter((o) => o.endedAt);
  const observers = plan.participants.filter((p) => p.access === "observator");

  if (mine && !mine.endedAt) return <LiveObserver plan={plan} obs={mine} />;

  const hasText = plan.body.trim().length > 0;
  const canObserve = access === "observator" && plan.phase !== "done" && !mine && hasText;

  return (
    <div className="two-col">
      <div className="col-main">
        {plan.observations.length === 0 && (
          <section className="card center">
            <div className="big-icon" aria-hidden="true">
              👀
            </div>
            <h3>{L.obsNotStarted}</h3>
            <p className="muted">
              {!hasText ? L.obsNeedsPublish : isOwner ? (observers.length ? L.obsNotStartedStudent : L.obsNoObservers) : L.obsNotStartedObserver}
            </p>
          </section>
        )}

        {canObserve && (
          <section className="card card-accent">
            <p className="small muted">
              {plan.info.title}
              {plan.info.durationMin > 0 && <> · {fill(L.durationValue, { n: plan.info.durationMin })}</>}
            </p>
            <button className="btn btn-primary btn-lg btn-block" onClick={() => {
                startObservation(plan.id);
              }}>
              ▶ {L.obsStart}
            </button>
            <p className="small muted start-hint">{L.obsStartHint}</p>
          </section>
        )}

        {mine?.endedAt && plan.phase !== "done" && access === "observator" && (
          <section className="card restart-card">
            <p className="small muted">{fill(L.obsEndedMine, { when: fmtDateTime(mine.endedAt), n: mine.notes.length })}</p>
            <p className="small shared-note">✓ {L.obsNowVisible}</p>
            <button
              className="btn btn-lg"
              onClick={() => {
                restartObservation(plan.id);
                showToast(L.obsRestarted);
              }}
            >
              ▶ {L.obsRestart}
            </button>
          </section>
        )}

        {active.length > 0 && (
          <div className="banner banner-purple">
            <span className="pulse" aria-hidden="true" /> {active.length === 1 ? L.obsHiddenForStudentOne : fill(L.obsHiddenForStudent, { n: active.length })}
            {!isOwner && <div className="small">{L.obsHiddenForOther}</div>}
          </div>
        )}

        {ended.length > 0 && <Results plan={plan} observations={ended} />}
      </div>

      <aside className="col-side">
        {ended.length > 0 ? (
          <SummaryCard plan={plan} />
        ) : (
          statusOf(plan) !== "done" && (
            <section className="card">
              <h3>{L.summary}</h3>
              <p className="muted small">
                {L.summaryWaitingObs}
                {summaryAuthorOf(plan, state.users) && ` (${summaryAuthorOf(plan, state.users)!.name})`}
              </p>
            </section>
          )
        )}
      </aside>
    </div>
  );
}

// ─── Live observer ──────────────────────────────────────────────────────────

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function LiveObserver({ plan, obs }: { plan: Plan; obs: Observation }) {
  const { me, user, addNote, deleteNote, updateNote, endObservation, fastForward, showToast } = useStore();
  const annotations = useAnnotations(plan.id);
  const now = useNow();
  const elapsed = (now - new Date(obs.startedAt).getTime()) / 1000;
  const hasDuration = plan.info.durationMin > 0;
  const total = Math.max(1, plan.info.durationMin * 60);
  const overtime = hasDuration && elapsed > total;
  const [kind, setKind] = useState<NoteKind>("styrke");
  const [text, setText] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const canSave = (text.trim().length > 0 || pending.length > 0) && (pending.length === 0 || consent) && !saving;

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const next: Pending[] = [];
    for (const f of Array.from(files)) {
      // iPhone photos (HEIC) and some videos (MOV) can arrive without a type: fall back to the extension.
      const kind = mediaKindOf(f);
      const isVideo = kind === "video";
      if (!kind) {
        showToast(fill(L.media.unsupported, { name: f.name }));
        continue;
      }
      if (isVideo && f.size > MAX_VIDEO_BYTES) {
        showToast(fill(L.media.tooBig, { name: f.name, max: fmtBytes(MAX_VIDEO_BYTES) }));
        continue;
      }
      const blob = isVideo ? f : await shrinkImage(f);
      next.push({ id: "m-" + Math.random().toString(36).slice(2, 10), kind: isVideo ? "video" : "image", name: f.name, size: blob.size, blob, url: URL.createObjectURL(blob) });
    }
    setPending((p) => [...p, ...next]);
    if (next.length) showToast(fill(L.media.added, { n: next.length }));
    if (fileInput.current) fileInput.current.value = "";
  };
  const dropPending = (id: string) =>
    setPending((p) => {
      p.filter((x) => x.id === id).forEach((x) => URL.revokeObjectURL(x.url));
      return p.filter((x) => x.id !== id);
    });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const at = new Date().toISOString();
      for (const m of pending) await putMedia(m.id, m.blob);
      const media: MediaRef[] = pending.map((m) => ({ id: m.id, kind: m.kind, name: m.name, size: m.size, consent: { by: me.id, at } }));
      addNote(plan.id, { kind, text: text.trim(), media: media.length ? media : undefined });
      pending.forEach((m) => URL.revokeObjectURL(m.url));
      setPending([]);
      setConsent(false);
      setText("");
      ta.current?.focus();
    } catch {
      showToast(L.media.missing);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || (el instanceof HTMLElement && el.isContentEditable)) return;
      if (["1", "2", "3"].includes(e.key)) setKind(KINDS[Number(e.key) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const owner = user(plan.ownerId);

  // Reminder that notes stay hidden until the observation is ended; closable, remembered per person.
  const infoKey = `undervisningsplan-hint-obs-${me.id}`;
  const [showInfo, setShowInfo] = useState(() => {
    try {
      return localStorage.getItem(infoKey) !== "closed";
    } catch {
      return true;
    }
  });
  const closeInfo = () => {
    setShowInfo(false);
    try {
      localStorage.setItem(infoKey, "closed");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="live">
      <div className="live-bar">
        <span className="live-dot" aria-hidden="true" /> {L.live}
        <span className="live-timer" aria-label="Tid siden start">
          {fmtOffset(elapsed)}
        </span>
        {overtime ? (
          <span className="live-over">{fill(L.liveOvertimeBy, { t: fmtOffset(elapsed - total) })}</span>
        ) : (
          <span className="live-of">{hasDuration ? fill(L.liveOf, { n: plan.info.durationMin }) : L.liveNoDuration}</span>
        )}
        <button className="demo-btn demo-btn-dark" title={L.demoForwardHint} onClick={() => fastForward(plan.id, 300)}>
          {L.demoForward}
        </button>
        <button
          className="live-end-btn"
          onClick={() => {
            // No confirmation: ending can be undone with "Start observasjonen igjen".
            endObservation(plan.id);
            showToast(fill(L.obsEnded, { name: owner.name }));
          }}
        >
          ■ {L.obsEnd}
        </button>
        {/* Progress of the lesson. Past the planned time the planned part stays
            blue, the extra time is amber, and a tick marks the planned end. */}
        {hasDuration && <div className="live-progress" aria-hidden="true">
          {overtime ? (
            <>
              <span className="lp-planned" style={{ width: `${(total / elapsed) * 100}%` }} />
              <span className="lp-over" style={{ width: `${(1 - total / elapsed) * 100}%` }} />
              <i className="lp-mark" style={{ left: `${(total / elapsed) * 100}%` }} />
            </>
          ) : (
            <span className="lp-planned" style={{ width: `${(elapsed / total) * 100}%` }} />
          )}
        </div>}
      </div>

      {showInfo && (
        <div className="info-box" role="note">
          <span className="info-icon" aria-hidden="true">
            i
          </span>
          <div>
            <strong>{L.obsInfoTitle}</strong>
            <p>{L.obsInfoBody}</p>
          </div>
          <button className="info-close" aria-label={L.obsInfoClose} title={L.obsInfoClose} onClick={closeInfo}>
            ✕
          </button>
        </div>
      )}

      <div className="live-grid">
        <section
          className={`card composer-card ${dragging ? "is-dragging" : ""}`}
          aria-label="Nytt notat"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
        >
          <div className="seg" role="radiogroup" aria-label={L.noteKindHint}>
            {KINDS.map((k, i) => (
              <button key={k} role="radio" aria-checked={kind === k} className={`seg-btn kind-${k} ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
                <span aria-hidden="true">{KIND_ICON[k]}</span> {L.noteKind[k]}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="note-text">
            {L.notePh}
          </label>
          <textarea
            id="note-text"
            ref={ta}
            autoFocus
            rows={3}
            placeholder={L.notePh}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void save();
              }
            }}
          />
          {pending.length > 0 && (
            <div className="media-pending">
              <ul className="media-grid">
                {pending.map((m) => (
                  <li key={m.id} className="media-tile">
                    {m.kind === "image" ? <img src={m.url} alt={m.name} /> : <video src={m.url} muted playsInline preload="metadata" />}
                    <span className="media-badge">{m.kind === "video" ? `▶ ${fmtBytes(m.size)}` : fmtBytes(m.size)}</span>
                    <button className="media-remove" aria-label={fill(L.media.remove, { name: m.name })} title={fill(L.media.remove, { name: m.name })} onClick={() => dropPending(m.id)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <label className="media-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{L.media.consent}</span>
              </label>
              <p className="muted small">{fill(L.media.privacy, { owner: owner.name })}</p>
            </div>
          )}
          <div className="row between wrap">
            <div className="row">
              {/* Hidden input opened by a real button: more reliable in Safari than a label pointing at a clipped input. */}
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*,.heic,.heif,.mov,.mp4,.m4v"
                multiple
                hidden
                id="note-media"
                onChange={(e) => void addFiles(e.target.files)}
              />
              <button type="button" className="btn" title={L.media.addHint} onClick={() => fileInput.current?.click()}>
                📷 {L.media.add}
              </button>
              <button type="button" className="demo-btn" title={L.media.demoHint} onClick={() => void sampleImage().then((f) => addFiles([f]))}>
                {L.media.demo}
              </button>
            </div>
            <button className="btn btn-primary" disabled={!canSave} title={pending.length && !consent ? L.media.consentNeeded : `${L.noteSave} (${L.noteSaveHint})`} onClick={() => void save()}>
              {L.noteSave}
            </button>
          </div>
          <button className="link-btn" aria-expanded={showPlan} onClick={() => setShowPlan((s) => !s)}>
            {showPlan ? "▾" : "▸"} {L.planAside}
          </button>
          {showPlan && (
            <div className="plan-aside">
              <PlanEditor planId={plan.id} me={me} editable={false} canAnnotate={false} annotations={annotations} toast={showToast} compact />
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="mine-h">
          <h3 id="mine-h">{fill(L.myNotes, { n: obs.notes.length })}</h3>
          {obs.notes.length === 0 && <Empty>{L.noNotesYet}</Empty>}
          <ul className="notes">
            {[...obs.notes].reverse().map((n) => (
              <NoteItem
                key={n.id}
                note={n}
                onSave={(patch) => {
                  updateNote(plan.id, n.id, patch);
                  showToast(L.noteSaved);
                }}
                onDelete={() => {
                  deleteNote(plan.id, n.id);
                  showToast(L.noteDeletedToast);
                }}
              />
            ))}
          </ul>
        </section>
      </div>


    </div>
  );
}

type NotePatch = { kind: NoteKind; text: string; media?: MediaRef[] };

/**
 * One observation note. With onSave/onDelete (the observer's own notes, until
 * the plan is completed) it can be edited in place or deleted after an inline
 * confirmation; no pop-up.
 */
export function NoteItem({
  note,
  author,
  onSave,
  onDelete,
  hideMedia = false,
  social,
}: {
  note: Note;
  author?: string;
  onSave?: (patch: NotePatch) => void;
  onDelete?: () => void;
  hideMedia?: boolean;
  /** Show reactions and comments; canInteract lets the viewer add their own. */
  social?: { planId: string; canInteract: boolean };
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [kind, setKind] = useState<NoteKind>(note.kind);
  const [text, setText] = useState(note.text);
  const [media, setMedia] = useState<MediaRef[]>(note.media ?? []);
  const empty = !text.trim() && media.length === 0;

  const startEdit = () => {
    setKind(note.kind);
    setText(note.text);
    setMedia(note.media ?? []);
    setMode("edit");
  };
  const save = () => {
    if (empty) return;
    onSave?.({ kind, text: text.trim(), media });
    setMode("view");
  };

  if (mode === "edit") {
    return (
      <li className={`note note-editing kind-${kind}`}>
        <div className="note-body">
          <div className="note-meta">
            <span className="mono">{fmtOffset(note.offsetSec)}</span>
          </div>
          <div className="seg seg-sm" role="radiogroup" aria-label={L.editNote}>
            {KINDS.map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} className={`seg-btn kind-${k} ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
                <span aria-hidden="true">{KIND_ICON[k]}</span> {L.noteKind[k]}
              </button>
            ))}
          </div>
          <textarea
            className="note-edit-text"
            value={text}
            autoFocus
            rows={3}
            aria-label={L.editNote}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              if (e.key === "Escape") setMode("view");
            }}
          />
          {media.length > 0 && (
            <ul className="media-grid">
              {media.map((m) => (
                <MediaTile key={m.id} m={m} onRemove={() => setMedia(media.filter((x) => x.id !== m.id))} />
              ))}
            </ul>
          )}
          {empty && <p className="small tone-red">{L.noteEmpty}</p>}
          <div className="row note-actions-edit">
            <button className="btn btn-primary btn-sm" disabled={empty} onClick={save}>
              {L.noteEditSave}
            </button>
            <button className="btn btn-sm" onClick={() => setMode("view")}>
              {L.noteCancel}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={`note kind-${note.kind}`}>
      <span className="note-kind" aria-label={L.noteKind[note.kind]}>
        {KIND_ICON[note.kind]}
      </span>
      <div className="note-body">
        <div className="note-meta">
          <span className="mono">{fmtOffset(note.offsetSec)}</span>
          <span> · {L.noteKind[note.kind]}</span>
          {author && <span> · {author}</span>}
          {note.editedAt && <span title={fmtDateTime(note.editedAt)}> · {L.noteEdited}</span>}
        </div>
        {note.text && <div>{note.text}</div>}
        {note.media && note.media.length > 0 && hideMedia && (
          <p className="muted small media-hidden">
            {[
              note.media.filter((m) => m.kind === "image").length && `📷 ${note.media.filter((m) => m.kind === "image").length} ${L.media.image.toLowerCase()}`,
              note.media.filter((m) => m.kind === "video").length && `▶ ${note.media.filter((m) => m.kind === "video").length} ${L.media.video.toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            · {L.media.hidden}
          </p>
        )}
        {note.media && note.media.length > 0 && !hideMedia && (
          <ul className="media-grid">
            {note.media.map((m) => (
              <MediaTile key={m.id} m={m} />
            ))}
          </ul>
        )}
        {social && <NoteSocial note={note} planId={social.planId} canInteract={social.canInteract} />}
        {mode === "confirm" && (
          <div className="row note-confirm" role="group" aria-label={L.noteDeleteAsk}>
            <span className="small">{L.noteDeleteAsk}</span>
            <button
              className="btn btn-danger btn-sm"
              autoFocus
              onClick={() => {
                setMode("view");
                onDelete?.();
              }}
            >
              {L.noteDeleteYes}
            </button>
            <button className="btn btn-sm" onClick={() => setMode("view")}>
              {L.noteCancel}
            </button>
          </div>
        )}
      </div>
      {(onSave || onDelete) && mode === "view" && (
        <div className="note-tools">
          {onSave && (
            <button className="icon-btn icon-edit" aria-label={L.editNote} title={L.editNote} onClick={startEdit}>
              <Icon name="edit" size={17} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" aria-label={L.deleteNote} title={L.deleteNote} onClick={() => setMode("confirm")}>
              <Icon name="trash" size={17} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export const REACTIONS = ["👍", "👏", "❤️", "💡", "🤔"];

/** Quick emoji reactions and a comment thread under a shared note. */
function NoteSocial({ note, planId, canInteract }: { note: Note; planId: string; canInteract: boolean }) {
  const { me, user, toggleReaction, addNoteReply } = useStore();
  const replies = note.replies ?? [];
  const used = REACTIONS.filter((e) => note.reactions?.[e]?.length).concat(Object.keys(note.reactions ?? {}).filter((e) => !REACTIONS.includes(e)));
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLSpanElement>(null);
  // Close the emoji picker on a click outside it or on Escape.
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => !pickerRef.current?.contains(e.target as Node) && setPicker(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicker(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker]);
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    addNoteReply(planId, note.id, text.trim());
    setText("");
  };
  if (!canInteract && !used.length && !replies.length) return null;

  return (
    <div className="note-social">
      <div className="reactions">
        {used.map((e) => {
          const who = note.reactions![e];
          const mine = who.includes(me.id);
          const names = who.map((id) => (id === me.id ? "deg" : user(id).name.split(" ")[0])).join(", ");
          return (
            <button
              key={e}
              className={`reaction ${mine ? "is-mine" : ""}`}
              aria-pressed={mine}
              disabled={!canInteract}
              title={names}
              aria-label={`${fill(L.reactWith, { emoji: e })}: ${names}`}
              onClick={() => toggleReaction(planId, note.id, e)}
            >
              <span aria-hidden="true">{e}</span> {who.length}
            </button>
          );
        })}
        {canInteract && (
          <span className="react-add" ref={pickerRef}>
            <button className="reaction reaction-add" aria-expanded={picker} aria-label={L.react} title={L.react} onClick={() => setPicker(!picker)}>
              <Icon name="smile" size={15} />+
            </button>
            {picker && (
              <span className="react-picker" role="group" aria-label={L.react}>
                {REACTIONS.map((e) => (
                  <button
                    key={e}
                    aria-label={fill(L.reactWith, { emoji: e })}
                    className={note.reactions?.[e]?.includes(me.id) ? "is-mine" : ""}
                    onClick={() => {
                      toggleReaction(planId, note.id, e);
                      setPicker(false);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
        {(canInteract || replies.length > 0) && (
          <button className="note-comment-toggle" aria-expanded={open || !canInteract} onClick={() => setOpen(!open)} disabled={!canInteract}>
            <Icon name="comment" size={14} />{" "}
            {replies.length === 0 ? L.noteComment : replies.length === 1 ? L.noteCommentsOne : fill(L.noteComments, { n: replies.length })}
          </button>
        )}
      </div>
      {(open || (!canInteract && replies.length > 0)) && (
        <div className="note-thread">
          {replies.map((r) => {
            const u = user(r.authorId);
            return (
              <div key={r.id} className="comment">
                <Avatar user={u} size={20} />
                <div>
                  <div className="comment-meta">
                    <strong>{u.name}</strong> · <When iso={r.at} />
                  </div>
                  {r.text}
                </div>
              </div>
            );
          })}
          {canInteract && (
            <div className="composer-row note-composer">
              <textarea
                rows={1}
                value={text}
                placeholder={L.noteCommentPh}
                aria-label={L.noteCommentPh}
                autoFocus
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button className={`composer-send ${text.trim() ? "is-ready" : ""}`} aria-label={L.noteCommentSend} title={L.noteCommentSend} disabled={!text.trim()} onClick={send}>
                <Icon name="send" size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const VIDEO_EXT = /\.(mov|mp4|m4v|webm|3gp)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;
function mediaKindOf(f: File): "image" | "video" | null {
  if (f.type.startsWith("video/") || (!f.type && VIDEO_EXT.test(f.name))) return "video";
  if (f.type.startsWith("image/") || (!f.type && IMAGE_EXT.test(f.name))) return "image";
  return null;
}

/** Prototype only: a drawn "whiteboard photo", for browsers/windows where no file picker opens. */
async function sampleImage(): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 900;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f5f7";
  g.fillRect(0, 0, 1200, 900);
  g.fillStyle = "#172b4d";
  g.font = "bold 72px sans-serif";
  g.fillText("1/2  >  1/3 ?", 330, 220);
  [["#0052cc", 600], ["#ff8b00", 400], ["#00875a", 300]].forEach(([col, w], i) => {
    g.fillStyle = col as string;
    g.fillRect(300, 320 + i * 150, w as number, 90);
  });
  g.fillStyle = "#6b778c";
  g.font = "36px sans-serif";
  g.fillText(`Eksempelbilde · ${new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}`, 300, 820);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
  return new File([blob], "eksempel-tavle.jpg", { type: "image/jpeg" });
}

interface Pending {
  id: string;
  kind: "image" | "video";
  name: string;
  size: number;
  blob: Blob;
  url: string;
}

/** A stored photo (click → larger) or video (inline player). */
function MediaTile({ m, onRemove }: { m: MediaRef; onRemove?: () => void }) {
  const { user } = useStore();
  const url = useMediaUrl(m.id);
  const [open, setOpen] = useState(false);
  const consent = fill(L.media.consentBy, { name: user(m.consent.by).name, when: fmtDateTime(m.consent.at) });
  const remove = onRemove && (
    <button className="media-remove" aria-label={`${L.noteRemoveFile}: ${m.name}`} title={L.noteRemoveFile} onClick={onRemove}>
      ✕
    </button>
  );
  if (url === "missing")
    return (
      <li className="media-tile is-missing">
        {L.media.missing}
        {remove}
      </li>
    );
  if (!url) return <li className="media-tile is-loading" aria-busy="true" />;
  return (
    <li className="media-tile" title={consent}>
      {m.kind === "image" ? (
        <button className="media-open" onClick={() => setOpen(true)} aria-label={`${L.media.open}: ${m.name}`}>
          <img src={url} alt={m.name} loading="lazy" />
        </button>
      ) : (
        <video src={url} controls playsInline preload="metadata" aria-label={`${L.media.video}: ${m.name}`} />
      )}
      {open && (
        <Dialog title={m.name} onClose={() => setOpen(false)} wide>
          <img className="media-full" src={url} alt={m.name} />
          <p className="muted small">{consent}</p>
        </Dialog>
      )}
      {remove}
    </li>
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

function Results({ plan, observations }: { plan: Plan; observations: Observation[] }) {
  const { user, me, updateNote, deleteNote, showToast } = useStore();
  const hideMedia = !canSeeMedia(plan, me.id);
  const canChange = (authorId: string) => authorId === me.id && plan.phase !== "done";
  const social = { planId: plan.id, canInteract: canReactOn(plan, me.id) };
  const [mode, setMode] = useState<"time" | "kind" | "observer">("time");
  const all = useMemo(
    () => observations.flatMap((o) => o.notes.map((n) => ({ ...n, author: user(o.observerId).name, authorId: o.observerId }))).sort((a, b) => a.offsetSec - b.offsetSec),
    [observations, user],
  );

  const groups =
    mode === "time"
      ? [{ key: "all", title: "", notes: all }]
      : mode === "kind"
        ? KINDS.map((k) => ({ key: k, title: `${KIND_ICON[k]} ${L.noteKind[k]}`, notes: all.filter((n) => n.kind === k) }))
        : observations.map((o) => ({ key: o.observerId, title: user(o.observerId).name, notes: all.filter((n) => n.authorId === o.observerId) }));

  const counts = KINDS.map((k) => all.filter((n) => n.kind === k).length);

  return (
    <section className="card" aria-labelledby="res-h">
      <div className="row between wrap">
        <h3 id="res-h">
          {L.resultTitle} <span className="muted small">· {all.length}</span>
        </h3>
        <div className="seg seg-sm" role="tablist">
          {(["time", "kind", "observer"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`seg-btn ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
              {m === "time" ? L.byTime : m === "kind" ? L.byKind : L.byObserver}
            </button>
          ))}
        </div>
      </div>
      <div className="kind-summary">
        {KINDS.map((k, i) => (
          <span key={k} className={`kind-pill kind-${k}`}>
            {KIND_ICON[k]} {counts[i]} {L.noteKind[k].toLowerCase()}
          </span>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.key} className="group">
          {g.title && <h4>{g.title}</h4>}
          {g.notes.length === 0 ? (
            <p className="muted small">{L.noNotes}</p>
          ) : (
            <ul className="notes">
              {g.notes.map((n) => (
                <NoteItem
                  key={n.id}
                  note={n}
                  author={n.author}
                  hideMedia={hideMedia}
                  social={social}
                  onSave={
                    canChange(n.authorId)
                      ? (patch) => {
                          updateNote(plan.id, n.id, patch);
                          showToast(L.noteSaved);
                        }
                      : undefined
                  }
                  onDelete={
                    canChange(n.authorId)
                      ? () => {
                          deleteNote(plan.id, n.id);
                          showToast(L.noteDeletedToast);
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────

function SummaryCard({ plan }: { plan: Plan }) {
  const { me, state, user, saveSummary, markDone, showToast } = useStore();
  const author = summaryAuthorOf(plan, state.users);
  const isAuthor = author?.id === me.id;
  const isOwner = plan.ownerId === me.id;
  const s = plan.summary;
  const myLive = plan.observations.some((o) => !o.endedAt && o.observerId === me.id);
  const editable = isAuthor && plan.phase !== "done" && !myLive;

  const [feedback, setFeedback] = useState(s?.feedback ?? "");
  const [next, setNext] = useState(s?.nextSteps ?? "");
  const [editing, setEditing] = useState(!s?.sharedAt);
  const [finalNote, setFinalNote] = useState("");

  if (editable && editing) {
    return (
      <section className="card card-accent" aria-labelledby="sum-h">
        <h3 id="sum-h">{L.summary}</h3>
        <p className="muted small">{L.summaryIntro}</p>
        <div className="field">
          <label htmlFor="sf-fb">{L.summaryFeedback}</label>
          <textarea id="sf-fb" rows={5} placeholder={L.summaryFeedbackPh} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sf-next">{L.summaryNext}</label>
          <textarea id="sf-next" rows={3} placeholder={L.summaryNextPh} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="stack">
          <button
            className="btn btn-primary btn-block"
            disabled={!feedback.trim()}
            onClick={() => {
              saveSummary(plan.id, feedback.trim(), next.trim(), true);
              setEditing(false);
              showToast(fill(L.summaryShared, { name: user(plan.ownerId).name }));
            }}
          >
            {L.summaryShare}
          </button>
          <button
            className="btn btn-block"
            onClick={() => {
              saveSummary(plan.id, feedback.trim(), next.trim(), false);
              showToast(L.saved);
            }}
          >
            {L.summarySaveDraft}
          </button>
        </div>
      </section>
    );
  }

  // Feedback is optional: the student can complete the plan once nobody is observing.
  const canComplete = isOwner && plan.phase === "observe" && !plan.observations.some((o) => !o.endedAt);
  const doneButton = canComplete && (
    <div className="final-note">
      <div className="field">
        <label htmlFor="final-note">{L.finalNoteLabel}</label>
        <textarea id="final-note" rows={3} placeholder={L.finalNotePh} value={finalNote} onChange={(e) => setFinalNote(e.target.value)} />
      </div>
      <button
        className="btn btn-success btn-block"
        onClick={() => {
          markDone(plan.id, finalNote);
          showToast(L.markDoneToast);
        }}
      >
        ✓ {L.markDone}
      </button>
    </div>
  );

  if (!s?.sharedAt) {
    return (
      <section className="card">
        <h3>{L.summary}</h3>
        <p className="muted small">{author ? fill(L.summaryWaiting, { name: author.name }) : L.summaryNone}</p>
        {doneButton && (
          <>
            <p className="muted small">{L.markDoneHint}</p>
            {doneButton}
          </>
        )}
      </section>
    );
  }

  const by = user(s.authorId);
  return (
    <section className="card card-accent" aria-labelledby="sum-h2">
      <div className="row between">
        <h3 id="sum-h2">{L.summary}</h3>
        {editable && (
          <button className="btn btn-subtle" onClick={() => setEditing(true)}>
            ✎ {L.edit}
          </button>
        )}
      </div>
      <p className="muted small">
        <Avatar user={by} size={16} /> {fill(L.summaryBy, { name: by.name, when: fmtDateTime(s.sharedAt) })}
      </p>
      <div className="sum-block">
        <p>{s.feedback}</p>
      </div>
      {s.nextSteps && (
        <div className="sum-block sum-next">
          <strong>{L.summaryNext}</strong>
          <p>{s.nextSteps}</p>
        </div>
      )}

      {s.replies.map((r) => {
        const u = user(r.authorId);
        return (
          <div key={r.id} className="comment">
            <Avatar user={u} size={22} />
            <div>
              <div className="comment-meta">
                <strong>{u.name}</strong> · <When iso={r.at} />
              </div>
              {r.text}
            </div>
          </div>
        );
      })}

      {doneButton}
    </section>
  );
}
