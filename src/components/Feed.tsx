import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fill, L } from "../labels";
import { useStore } from "../store";
import type { Annotation, Plan, PlanComment } from "../types";
import { fmtDateTime } from "../format";
import { ANN_COLOR } from "./annColors";
import { Avatar, Icon } from "./ui";

/**
 * Right-hand panel, modelled on the teacher sidebar in arbeidskrav-uit
 * ("Annotations & comments"): one chronological feed of annotations and
 * free-text comments, with the comment composer pinned to the bottom.
 * Annotations live in the shared document; resolved ones fold away under
 * "Vis løste" but are never deleted, so feedback cannot vanish silently.
 */

const COMMENT_COLOR = "#0052CC";

type Item = { kind: "ann"; data: Annotation } | { kind: "com"; data: PlanComment };

export interface FeedFocus {
  id: string;
  /** Where the click came from; the other side scrolls. */
  from: "text" | "card";
}

export interface AnnActions {
  accept: (a: Annotation) => void;
  dismiss: (a: Annotation) => void;
  editNote: (a: Annotation, note: string) => void;
  remove: (a: Annotation) => void;
}

export function Feed({
  plan,
  annotations,
  presentIds,
  focus,
  onCardClick,
  canComment,
  canResolve,
  actions,
}: {
  plan: Plan;
  annotations: Annotation[];
  /** Mark ids found in the document; null until the editor has loaded. */
  presentIds: Set<string> | null;
  focus: FeedFocus | null;
  onCardClick: (id: string) => void;
  canComment: boolean;
  canResolve: boolean;
  actions: AnnActions;
}) {
  const { me } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showResolved, setShowResolved] = useState(false);
  const resolved = annotations.filter((a) => a.outcome);
  const items: Item[] = [
    ...annotations.filter((a) => !a.outcome || showResolved).map((a) => ({ kind: "ann" as const, data: a })),
    ...plan.comments.map((c) => ({ kind: "com" as const, data: c })),
  ].sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));

  // Text → card: scroll the card into the middle of the panel.
  useEffect(() => {
    if (focus?.from !== "text") return;
    scrollRef.current?.querySelector(`[data-card="${focus.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  // New item → keep the newest card in view.
  const count = items.length;
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    prev.current = count;
  }, [count]);

  // Comments and annotations stay open until the plan is completed.
  const open = plan.phase !== "done";
  const footNote = !open ? L.feedDone : !canComment ? L.feedReadOnly : null;

  return (
    <section className="feed-panel" aria-labelledby="feed-h">
      <div className="feed-head">
        <h3 id="feed-h">{L.feedTitle}</h3>
        {resolved.length > 0 && (
          <button className="link-btn small" aria-pressed={showResolved} onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? L.hideResolved : fill(L.showResolved, { n: resolved.length })}
          </button>
        )}
      </div>
      {open && canResolve && <p className="feed-hint">{L.feedHowTo}</p>}

      <div className="feed-scroll" ref={scrollRef}>
        {items.length === 0 ? (
          <p className="feed-empty">{L.feedEmpty}</p>
        ) : (
          <ul className="feed-list">
            {items.map((it) =>
              it.kind === "ann" ? (
                <AnnCard
                  key={it.data.id}
                  a={it.data}
                  orphan={!!presentIds && !it.data.outcome && !presentIds.has(it.data.id)}
                  focused={focus?.id === it.data.id}
                  onClick={() => onCardClick(it.data.id)}
                  mine={open && it.data.authorId === me.id && !it.data.outcome}
                  canResolve={open && canResolve && !it.data.outcome}
                  actions={actions}
                />
              ) : (
                <CommentCard key={it.data.id} plan={plan} c={it.data} mine={open && it.data.authorId === me.id} />
              ),
            )}
          </ul>
        )}
      </div>

      {open && canComment ? <Composer plan={plan} /> : footNote && <p className="feed-foot muted small">{footNote}</p>}
    </section>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function CardHead({ label, color, at, edited }: { label: string; color: string; at: string; edited?: boolean }) {
  return (
    <div className="feed-card-head">
      <span className="feed-chip" style={{ color, backgroundColor: `${color}14` }}>
        {label}
      </span>
      <span className="feed-date">
        {fmtDateTime(at)}
        {edited && ` · ${L.edited}`}
      </span>
    </div>
  );
}

function CardFoot({ authorId, actions }: { authorId: string; actions?: React.ReactNode }) {
  const { user } = useStore();
  const u = user(authorId);
  return (
    <div className="feed-card-foot">
      <Avatar user={u} size={18} />
      <span className="feed-author">{u.name}</span>
      {actions && <span className="feed-actions">{actions}</span>}
    </div>
  );
}

function AnnCard({
  a,
  orphan,
  focused,
  onClick,
  mine,
  canResolve,
  actions,
}: {
  a: Annotation;
  orphan: boolean;
  focused: boolean;
  onClick: () => void;
  mine: boolean;
  canResolve: boolean;
  actions: AnnActions;
}) {
  const { user } = useStore();
  const [editing, setEditing] = useState(false);
  const color = ANN_COLOR[a.type];
  const quote = (s: string, n: number) => `«${s.slice(0, n)}${s.length > n ? "…" : ""}»`;
  const isChange = a.type !== "highlight";

  return (
    <li
      data-card={a.id}
      className={`feed-card ${focused ? "is-focused" : ""} ${a.outcome ? "is-resolved" : ""} ${orphan ? "is-orphan" : ""}`}
      style={{ borderLeftColor: color }}
      onClick={editing || a.outcome ? undefined : onClick}
      title={editing || a.outcome ? undefined : L.showInText}
    >
      <CardHead label={L.annType[a.type]} color={color} at={a.createdAt} />

      {a.type === "text" ? (
        <>
          <div className="feed-label">{L.labelOriginal}</div>
          <p className="feed-quote is-old" style={{ borderColor: `${color}40` }}>
            {quote(a.selectedText, 120)}
          </p>
          <div className="feed-label">{L.labelReplacedWith}</div>
          {editing ? (
            <EditBox initial={a.note} required onCancel={() => setEditing(false)} onSave={(t) => (actions.editNote(a, t), setEditing(false))} />
          ) : (
            <p className="feed-quote is-new" style={{ borderColor: `${color}40` }}>
              «{a.note}»
            </p>
          )}
        </>
      ) : (
        <>
          <p className={`feed-quote ${a.type === "strikeout" ? "is-struck" : ""}`} style={{ borderColor: `${color}40` }}>
            {quote(a.selectedText, 80)}
          </p>
          {editing ? (
            <EditBox initial={a.note} onCancel={() => setEditing(false)} onSave={(t) => (actions.editNote(a, t), setEditing(false))} />
          ) : (
            a.note && <p className="feed-text">{a.note}</p>
          )}
        </>
      )}

      {orphan && <p className="small tone-yellow feed-orphan">{L.annOrphan}</p>}

      <CardFoot
        authorId={a.authorId}
        actions={
          mine &&
          !editing && (
            <>
              <CardBtn label={L.edit} aria={L.annEdit} onClick={() => setEditing(true)} />
              <CardBtn label={L.delete} aria={L.annDelete} danger onClick={() => actions.remove(a)} />
            </>
          )
        }
      />

      {a.outcome ? (
        <p className={`small feed-outcome ${a.outcome === "accepted" ? "tone-green" : "muted"}`}>
          {a.outcome === "accepted" ? "✓ " : "✕ "}
          {fill(a.outcome === "accepted" ? L.annAcceptedBy : isChange ? L.annDismissedBy : L.annResolvedBy, {
            name: user(a.resolvedBy ?? "").name,
            when: fmtDateTime(a.resolvedAt ?? a.createdAt),
          })}
        </p>
      ) : (
        canResolve &&
        !editing && (
          <div className="feed-resolve" onClick={(e) => e.stopPropagation()}>
            {isChange && !orphan && (
              <button className="btn btn-primary small" onClick={() => actions.accept(a)}>
                ✓ {L.annAccept}
              </button>
            )}
            <button className="btn small" onClick={() => actions.dismiss(a)}>
              {isChange && !orphan ? L.annDismiss : L.annResolve}
            </button>
          </div>
        )
      )}
    </li>
  );
}

function CommentCard({ plan, c, mine }: { plan: Plan; c: PlanComment; mine: boolean }) {
  const { editComment, deleteComment, showToast } = useStore();
  const [editing, setEditing] = useState(false);
  return (
    <li data-card={c.id} className="feed-card is-comment" style={{ borderLeftColor: COMMENT_COLOR }}>
      <CardHead label={L.chipComment} color={COMMENT_COLOR} at={c.createdAt} edited={!!c.editedAt} />
      {editing ? (
        <EditBox initial={c.text} required onCancel={() => setEditing(false)} onSave={(t) => (editComment(plan.id, c.id, t), setEditing(false), showToast(L.toastUpdated))} />
      ) : (
        <p className="feed-text feed-comment">{c.text}</p>
      )}
      <CardFoot
        authorId={c.authorId}
        actions={
          mine &&
          !editing && (
            <>
              <CardBtn label={L.edit} aria={L.commentEdit} onClick={() => setEditing(true)} />
              <CardBtn
                label={L.delete}
                aria={L.commentDelete}
                danger
                onClick={() => {
                  deleteComment(plan.id, c.id);
                  showToast(L.toastCommentDeleted);
                }}
              />
            </>
          )
        }
      />
    </li>
  );
}

function CardBtn({ label, aria, onClick, danger }: { label: string; aria: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`card-btn ${danger ? "is-danger" : ""}`}
      aria-label={aria}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function EditBox({ initial, required, onSave, onCancel }: { initial: string; required?: boolean; onSave: (t: string) => void; onCancel: () => void }) {
  const [t, setT] = useState(initial);
  const empty = required && !t.trim();
  return (
    <div className="edit-box" onClick={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        rows={3}
        value={t}
        aria-label={L.edit}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !empty) onSave(t.trim());
        }}
      />
      <div className="row end">
        <button className="btn btn-subtle small" onClick={onCancel}>
          {L.cancel}
        </button>
        <button className="btn btn-primary small" disabled={empty} onClick={() => onSave(t.trim())}>
          {L.save}
        </button>
      </div>
    </div>
  );
}

// ─── Composer (pinned to the bottom, like the inspiration repo) ─────────────

function Composer({ plan }: { plan: Plan }) {
  const { addComment, showToast } = useStore();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const has = text.trim().length > 0;

  // Grow with the text up to a cap, shrink back after sending.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const send = () => {
    if (!has) return;
    addComment(plan.id, text.trim());
    setText("");
    showToast(L.toastComment);
  };

  return (
    <div className="feed-composer">
      <div className="composer-head">
        <Icon name="comment" size={14} />
        <span>{L.addComments}</span>
      </div>
      <div className="composer-row">
        <label className="sr-only" htmlFor="comment-input">
          {L.commentPh}
        </label>
        <textarea
          id="comment-input"
          ref={ref}
          rows={1}
          value={text}
          placeholder={L.commentPh}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className={`composer-send ${has ? "is-ready" : ""}`} onClick={send} disabled={!has} aria-label={L.commentSend} title={L.commentSend}>
          <Icon name="send" size={18} />
        </button>
      </div>
      <p className="composer-keys">{L.commentKeys}</p>
    </div>
  );
}
