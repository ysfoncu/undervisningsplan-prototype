import { useMemo, useState } from "react";
import { fill, L } from "../labels";
import { missingForShare, useStore } from "../store";
import type { Access, Plan, Role } from "../types";
import { Avatar, Person, When } from "./ui";

const ACCESS: Access[] = ["leser", "redaktor", "observator"];

/**
 * Participants and invite picker. The owner invites people from their own
 * practice group (F14.3) as Leser, Redaktør or Observatør, and can change the
 * access later. Every row has a text status (F15.2) and labelled controls.
 */
export function People({ plan, editable }: { plan: Plan; editable: boolean }) {
  const { state, user, invite, setAccess, removeParticipant, saveInfo } = useStore();
  const [name, setName] = useState("");
  const [date, setDate] = useState(plan.info.date);
  const [time, setTime] = useState(plan.info.startTime);
  const missing = missingForShare(plan);
  const untitled = missing.title || missing.when;
  const [q, setQ] = useState("");
  const [as, setAs] = useState<Access>("redaktor");

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

  // A plan cannot be shared without a name, date and start time: ask for what is missing here, then show the invite list.
  const ready = (!missing.title || name.trim()) && (!missing.when || (date && time));
  const nameFirst = editable && untitled && (
    <form
      className="picker name-first"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        saveInfo(plan.id, {
          ...plan.info,
          ...(missing.title ? { title: name.trim() } : {}),
          ...(missing.when ? { date, startTime: time } : {}),
        });
      }}
    >
      <span className="field-label">{missing.title && missing.when ? L.shareNeedsDetails : missing.title ? L.shareNeedsName : L.shareNeedsWhen}</span>
      <p className="muted small">{missing.title && missing.when ? L.shareNeedsDetailsHint : missing.title ? L.shareNeedsNameHint : L.shareNeedsWhenHint}</p>
      {missing.title && (
        <div className="field">
          <label htmlFor="share-name">{L.fTitle}</label>
          <input id="share-name" autoFocus placeholder={L.fTitlePh} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      {missing.when && (
        <div className="row share-when">
          <div className="field">
            <label htmlFor="share-date">{L.fDate}</label>
            <input id="share-date" type="date" autoFocus={!missing.title} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="share-time">{L.fTime}</label>
            <input id="share-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!ready}>
          {missing.title && !missing.when ? L.shareSaveName : L.shareSaveDetails}
        </button>
      </div>
    </form>
  );

  const picker = editable && !untitled && (
    <div className="picker">
      <span className="field-label">{L.inviteAs}</span>
      <div className="seg seg-sm" role="radiogroup" aria-label={L.inviteAs}>
        {ACCESS.map((a) => (
          <button key={a} role="radio" aria-checked={as === a} className={`seg-btn ${as === a ? "on" : ""}`} onClick={() => setAs(a)}>
            {L.access[a]}
          </button>
        ))}
      </div>
      <p className="muted small">{L.accessHint[as]}</p>
      <label className="sr-only" htmlFor="invite-q">
        {L.invitePh}
      </label>
      <input id="invite-q" autoFocus placeholder={L.invitePh} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="picker-list">
        {candidates.map((u) => (
          <li key={u.id}>
            <button
              className="picker-item"
              onClick={() => {
                invite(plan.id, u.id, as);
                setQ("");
              }}
            >
              <Avatar user={u} size={24} />
              <span className="person-name">{u.name}</span>
              <span className={`role-tag role-${u.role}`}>{L.roles[u.role]}</span>
              <span className="picker-add">+ {L.access[as]}</span>
            </button>
          </li>
        ))}
        {candidates.length === 0 && <li className="muted small picker-empty">{fill(q.trim() ? L.noMatch : L.allInvited, { group: state.group.name })}</li>}
      </ul>
      <p className="muted small">{fill(L.inviteGroupNote, { group: state.group.name })}</p>
    </div>
  );

  return (
    <div className="people-panel">
      {nameFirst}
      {picker}
      <h3 className="people-h">{L.peopleWithAccess}</h3>
      <div className="people-list">
        <Person user={user(plan.ownerId)} sub={L.owner} />
        {plan.participants.length === 0 && <p className="muted small">{L.noOneInvited}</p>}
        {plan.participants.map((p) => {
          const u = user(p.userId);
          return (
            <div key={p.userId} className="people-row">
              <Person user={u} sub={statusText(p.userId, p.seenAt)} />
              <div className="people-actions">
                {editable ? (
                  <>
                    <label className="sr-only" htmlFor={`acc-${u.id}`}>
                      {fill(L.accessLabel, { name: u.name })}
                    </label>
                    <select id={`acc-${u.id}`} className="access-select" value={p.access} onChange={(e) => setAccess(plan.id, u.id, e.target.value as Access)}>
                      {ACCESS.map((a) => (
                        <option key={a} value={a}>
                          {L.access[a]}
                        </option>
                      ))}
                    </select>
                    <button className="icon-btn" aria-label={fill(L.removePerson, { name: u.name })} title={fill(L.removePerson, { name: u.name })} onClick={() => removeParticipant(plan.id, u.id)}>
                      ✕
                    </button>
                  </>
                ) : (
                  <span className={`access-tag access-${p.access}`} title={L.accessHint[p.access]}>
                    {L.access[p.access]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
