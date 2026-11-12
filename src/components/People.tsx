import { useEffect, useMemo, useRef, useState } from "react";
import { fill, L } from "../labels";
import { missingForShare, useStore } from "../store";
import type { Access, Plan, Role, User } from "../types";
import { Person, When } from "./ui";

const ACCESS: Access[] = ["leser", "redaktor", "observator"];

/** Suggested access when inviting: supervisors observe, fellow students edit. */
function suggestedAccess(u: User): Access {
  return u.role === "veileder" ? "observator" : "redaktor";
}

/**
 * Sharing: one search field, then "Har tilgang" (owner + invited, each with an
 * access menu) and "Inviter fra <group>" (each person with a pre-set access
 * menu and an Inviter button). Who → what → invite, in one row. Only the
 * owner's practice group can be invited (F14.3); every row has a text status
 * (F15.2) and labelled controls.
 */
export function People({ plan, editable }: { plan: Plan; editable: boolean }) {
  const { state, user, invite, setAccess, removeParticipant, saveInfo } = useStore();
  const [name, setName] = useState("");
  const untitled = missingForShare(plan).title;
  const [q, setQ] = useState("");
  // Access chosen for people not yet invited; nothing is pre-selected.
  const [pending, setPending] = useState<Record<string, Access>>({});
  const { showToast } = useStore();

  const candidates = useMemo(() => {
    const taken = new Set([plan.ownerId, ...plan.participants.map((p) => p.userId)]);
    const order: Role[] = ["veileder", "medstudent", "student"];
    return state.group.memberIds
      .filter((id) => !taken.has(id))
      .map(user)
      .filter((u) => u.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name, "nb"));
  }, [state.group.memberIds, plan, q, user]);

  const statusText = (userId: string, seenAt: string | null) => {
    const obs = plan.observations.find((o) => o.observerId === userId);
    if (obs && !obs.endedAt) return <span className="tone-purple">{L.pObserving}</span>;
    if (obs) return <span className="tone-green">{L.pObserved}</span>;
    if (seenAt)
      return (
        <span>
          {fill(L.pSeen, { when: "" })}
          <When iso={seenAt} />
        </span>
      );
    return <span className="tone-yellow">{L.pInvited}</span>;
  };

  // A plan cannot be shared without a name: ask for it here, then show the invite list. Date and time are optional.
  const nameFirst = editable && untitled && (
    <form
      className="picker name-first"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) saveInfo(plan.id, { ...plan.info, title: name.trim() });
      }}
    >
      <label className="field-label" htmlFor="share-name">
        {L.shareNeedsName}
      </label>
      <p className="muted small">{L.shareNeedsNameHint}</p>
      <div className="row">
        <input id="share-name" autoFocus placeholder={L.fTitlePh} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          {L.shareSaveName}
        </button>
      </div>
    </form>
  );

  const match = (u: User) => u.name.toLowerCase().includes(q.trim().toLowerCase());
  const invited = plan.participants.filter((p) => match(user(p.userId)));

  // Read-only view (not the owner, or the plan is completed): who has which access.
  if (!editable)
    return (
      <div className="people-panel">
        <h3 className="people-h">{L.peopleWithAccess}</h3>
        <div className="people-list">
          <Person user={user(plan.ownerId)} sub={L.owner} />
          {plan.participants.length === 0 && <p className="muted small">{L.noOneInvited}</p>}
          {plan.participants.map((p) => (
            <div key={p.userId} className="people-row">
              <Person user={user(p.userId)} sub={statusText(p.userId, p.seenAt)} />
              <span className={`access-tag access-${p.access}`} title={L.accessHint[p.access]}>
                {L.access[p.access]}
              </span>
            </div>
          ))}
        </div>
        <AccessRights open={false} />
      </div>
    );

  return (
    <div className="people-panel share-panel">
      {nameFirst}
      {!untitled && (
        <>
          <label className="sr-only" htmlFor="invite-q">
            {fill(L.shareSearch, { group: state.group.name })}
          </label>
          <input id="invite-q" className="share-search" type="search" autoFocus placeholder={fill(L.shareSearch, { group: state.group.name })} value={q} onChange={(e) => setQ(e.target.value)} />

          <section aria-labelledby="share-has">
            <h3 id="share-has" className="people-h">
              {L.shareHasAccess} <span className="muted">· {plan.participants.length + 1}</span>
            </h3>
            <ul className="share-list">
              {match(user(plan.ownerId)) && (
                <li className="share-row">
                  <Person user={user(plan.ownerId)} sub={L.ownerYou} />
                  <span className="share-owner">{L.owner}</span>
                </li>
              )}
              {invited.map((p) => {
                const u = user(p.userId);
                return (
                  <li key={p.userId} className="share-row">
                    <Person user={u} sub={statusText(p.userId, p.seenAt)} />
                    <AccessMenu
                      value={p.access}
                      label={fill(L.accessLabel, { name: u.name })}
                      onChange={(a) => {
                        setAccess(plan.id, u.id, a);
                        showToast(fill(L.shareChanged, { name: u.name, access: L.access[a] }));
                      }}
                      onRemove={() => {
                        removeParticipant(plan.id, u.id);
                        showToast(fill(L.shareRemoved, { name: u.name }));
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="share-invite">
            <h3 id="share-invite" className="people-h">
              {fill(L.shareInviteFrom, { group: state.group.name })}
            </h3>
            {candidates.length === 0 ? (
              <p className="muted small">{fill(q.trim() ? L.noMatch : L.allInvited, { group: state.group.name })}</p>
            ) : (
              <ul className="share-list">
                {candidates.map((u) => {
                  const a: Access | undefined = pending[u.id];
                  return (
                    <li key={u.id} className="share-row">
                      <Person user={u} />
                      <AccessMenu
                        value={a}
                        suggested={suggestedAccess(u)}
                        label={fill(L.accessLabel, { name: u.name })}
                        onChange={(x) => setPending({ ...pending, [u.id]: x })}
                      />
                      <button
                        className="btn btn-primary btn-sm share-invite-btn"
                        disabled={!a}
                        title={a ? undefined : L.sharePickFirst}
                        aria-label={a ? fill(L.shareInviteAs, { name: u.name, access: L.access[a] }) : `${L.shareInvite} ${u.name}: ${L.sharePickFirst}`}
                        onClick={() => {
                          if (!a) return;
                          invite(plan.id, u.id, a);
                          setQ("");
                          showToast(fill(L.shareInvited, { name: u.name, access: L.access[a] }));
                        }}
                      >
                        {L.shareInvite}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <AccessRights open={false} />
        </>
      )}
    </div>
  );
}

/**
 * Access dropdown: shows the current level; the menu lists each level with
 * what it allows, and (for invited people) "Fjern tilgang".
 */
function AccessMenu({ value, onChange, onRemove, label, suggested }: { value?: Access; onChange: (a: Access) => void; onRemove?: () => void; label: string; suggested?: Access }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // Fixed position, so the menu is not clipped by the scrolling dialog; opens upwards when needed.
  const toggle = () => {
    if (open) return setOpen(false);
    const r = btn.current!.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    setPos(window.innerHeight - r.bottom > 300 ? { right, top: r.bottom + 4 } : { right, bottom: window.innerHeight - r.top + 4 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    document.querySelector(".dialog")?.addEventListener("scroll", close);
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", close);
      document.querySelector(".dialog")?.removeEventListener("scroll", close);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span className="access-menu" ref={box}>
      <button ref={btn} className={`access-btn ${value ? `access-${value}` : "is-empty"}`} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${value ? L.access[value] : L.sharePick}`} onClick={toggle}>
        {value ? L.access[value] : L.sharePick} <span aria-hidden="true">▾</span>
      </button>
      {open && pos && (
        <div className="access-pop" role="menu" aria-label={label} style={pos}>
          {ACCESS.map((a) => (
            <button
              key={a}
              role="menuitemradio"
              aria-checked={a === value}
              className={`access-opt ${a === value ? "is-on" : ""}`}
              onClick={() => {
                setOpen(false);
                if (a !== value) onChange(a);
              }}
            >
              <span className="access-check" aria-hidden="true">
                {a === value ? "✓" : ""}
              </span>
              <span>
                <span className="access-opt-name">
                  {L.access[a]}
                  {a === suggested && <span className="access-suggest">{L.shareSuggested}</span>}
                </span>
                <span className="access-opt-desc">{L.accessHint[a]}</span>
              </span>
            </button>
          ))}
          {onRemove && (
            <button
              role="menuitem"
              className="access-opt access-remove"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            >
              <span className="access-check" aria-hidden="true" />
              <span>{L.shareRemove}</span>
            </button>
          )}
        </div>
      )}
    </span>
  );
}

type Who = "owner" | Access;
const WHO: Who[] = ["owner", "leser", "redaktor", "observator"];
/** What each access level may do. Mirrors the checks in PlanView, ObserveView and store. */
const RIGHTS: { key: Exclude<keyof typeof L.rights, "title" | "yes" | "no" | "feedbackNote" | "after">; who: Who[] }[] = [
  { key: "read", who: ["owner", "leser", "redaktor", "observator"] },
  { key: "write", who: ["owner", "redaktor", "observator"] },
  { key: "annotate", who: ["owner", "redaktor", "observator"] },
  { key: "resolve", who: ["owner", "redaktor", "observator"] },
  { key: "observe", who: ["observator"] },
  { key: "media", who: ["owner", "observator"] },
  { key: "react", who: ["owner", "leser", "redaktor", "observator"] },
  { key: "feedback", who: ["observator"] },
  { key: "manage", who: ["owner"] },
];

/** A small table explaining Eier / Leser / Redaktør / Observatør. */
function AccessRights({ open }: { open: boolean }) {
  return (
    <details className="rights" open={open}>
      <summary>{L.rights.compare}</summary>
      <table className="rights-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">{L.rights.title}</span>
            </th>
            {WHO.map((w) => (
              <th key={w} scope="col">
                {w === "owner" ? L.owner : L.access[w]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RIGHTS.map((r) => (
            <tr key={r.key}>
              <th scope="row">
                {L.rights[r.key]}
                {r.key === "feedback" && <span className="rights-note">{L.rights.feedbackNote}</span>}
              </th>
              {WHO.map((w) => {
                const ok = r.who.includes(w);
                return (
                  <td key={w} className={ok ? "is-yes" : "is-no"}>
                    <span aria-hidden="true">{ok ? "✓" : "–"}</span>
                    <span className="sr-only">{ok ? L.rights.yes : L.rights.no}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{L.rights.after}</p>
    </details>
  );
}
