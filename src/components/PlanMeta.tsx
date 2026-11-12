import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { fmtLesson, meetingName, normalizeMeetingUrl } from "../format";
import { fill, L } from "../labels";
import { useStore } from "../store";
import { TimeField } from "./TimeField";
import { Icon } from "./ui";
import type { Plan, PlanInfo } from "../types";

/**
 * The lesson facts ("Om timen") live in the page header: an editable title and
 * one line of details. The owner edits each detail in place while the plan is
 * open; everyone else reads them. Saves on Enter or when focus leaves; Escape
 * cancels. No separate form, no Save button.
 */

export function TitleField({ plan, editable }: { plan: Plan; editable: boolean }) {
  const { saveInfo } = useStore();
  const [v, setV] = useState(plan.info.title);
  useEffect(() => setV(plan.info.title), [plan.info.title]);
  const isNew = !plan.info.title && !plan.body;

  if (!editable) return <h1 className="plan-title">{plan.info.title || L.untitled}</h1>;

  const commit = () => {
    const t = v.trim();
    if (t !== plan.info.title) saveInfo(plan.id, { ...plan.info, title: t });
    setV(t);
  };
  return (
    <h1 className="plan-title">
      <span className="title-wrap" data-value={v || L.untitled}>
        <input
          className="title-input"
          size={1}
          value={v}
          placeholder={L.untitled}
          aria-label={L.fTitle}
          autoFocus={isNew}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setV(plan.info.title);
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
          }}
        />
      </span>
    </h1>
  );
}

type Key = "subject" | "className" | "when" | "meeting";

export function MetaRow({ plan, editable }: { plan: Plan; editable: boolean }) {
  const c = plan.info;
  const items: { key: Key; label: string; value: string | null }[] = [
    { key: "subject", label: L.fSubject, value: c.subject || null },
    { key: "className", label: L.fClass, value: c.className || null },
    { key: "when", label: L.fDateTime, value: c.date ? fmtLesson(c.date, c.startTime) + (c.startTime ? "" : ` · ${L.fTime.toLowerCase()} ?`) : null },
    { key: "meeting", label: L.fMeeting, value: c.meetingUrl || null },
  ];
  const shown = editable ? items : items.filter((i) => i.value);
  if (!shown.length) return null;

  return (
    <div className="meta-row" aria-label={L.secInfo}>
      {shown.map((i, n) => (
        <Fragment key={i.key}>
          {n > 0 && (
            <span className="meta-sep" aria-hidden="true">
              ·
            </span>
          )}
          {editable ? (
            <MetaEditor plan={plan} k={i.key} label={i.label} value={i.value} />
          ) : i.key === "meeting" && i.value ? (
            <MeetingLink url={i.value} />
          ) : (
            <span className="meta-item" title={i.label}>
              {i.value}
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** The meeting link, opened in a new tab. */
function MeetingLink({ url }: { url: string }) {
  return (
    <a className="meta-item meeting-link" href={url} target="_blank" rel="noopener noreferrer" title={`${L.meetingJoinTitle}: ${url}`}>
      <Icon name="video" size={15} /> {fill(L.meetingJoin, { name: meetingName(url) })}
    </a>
  );
}

function MetaEditor({ plan, k, label, value }: { plan: Plan; k: Key; label: string; value: string | null }) {
  const { saveInfo } = useStore();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<PlanInfo>(plan.info);
  const [link, setLink] = useState(plan.info.meetingUrl ?? "");
  const linkBad = k === "meeting" && link.trim() !== "" && !normalizeMeetingUrl(link);
  const box = useRef<HTMLSpanElement>(null);

  const start = () => {
    setD(plan.info);
    setLink(plan.info.meetingUrl ?? "");
    setOpen(true);
  };
  const commit = (fromBlur = false) => {
    if (k === "meeting") {
      // An invalid link is not saved: Enter keeps the editor open, leaving the field discards it.
      if (linkBad) {
        if (fromBlur) setOpen(false);
        return;
      }
      saveInfo(plan.id, { ...plan.info, meetingUrl: normalizeMeetingUrl(link) ?? "" });
      setOpen(false);
      return;
    }
    saveInfo(plan.id, { ...plan.info, subject: d.subject.trim(), className: d.className.trim(), date: d.date, startTime: d.startTime });
    setOpen(false);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setOpen(false);
  };
  // Commit when focus leaves the whole editor (date + time count as one).
  const onBlur = (e: React.FocusEvent) => {
    if (!box.current?.contains(e.relatedTarget as Node)) commit(true);
  };

  if (!open && k === "meeting" && value)
    return (
      <span className="meeting-wrap">
        <MeetingLink url={value} />
        <button className="icon-btn meeting-edit" onClick={start} title={fill(L.metaEdit, { field: label.toLowerCase() })} aria-label={`${label}: ${value}. ${L.edit}`}>
          <Icon name="edit" size={14} />
        </button>
      </span>
    );

  if (!open)
    return (
      <button className={`meta-item meta-btn ${value ? "" : "is-empty"}`} onClick={start} title={fill(L.metaEdit, { field: label.toLowerCase() })} aria-label={`${label}: ${value ?? L.emptyValue}. ${L.edit}`}>
        {value ?? `+ ${label}`}
      </button>
    );

  let fields: ReactNode;
  if (k === "subject")
    fields = <input autoFocus aria-label={L.fSubject} placeholder={L.fSubjectPh} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} onKeyDown={keys} style={{ width: 160 }} />;
  else if (k === "className")
    fields = <input autoFocus aria-label={L.fClass} placeholder={L.fClassPh} value={d.className} onChange={(e) => setD({ ...d, className: e.target.value })} onKeyDown={keys} style={{ width: 90 }} />;
  else if (k === "meeting")
    fields = (
      <>
        <input
          autoFocus
          type="url"
          inputMode="url"
          aria-label={L.fMeeting}
          aria-invalid={linkBad}
          placeholder={L.fMeetingPh}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={keys}
          style={{ width: 300 }}
        />
        {linkBad && <span className="small tone-red">{L.meetingInvalid}</span>}
      </>
    );
  else
    fields = (
      <>
        <input autoFocus type="date" aria-label={L.fDate} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} onKeyDown={keys} />
        <TimeField label={L.fTime} value={d.startTime} onChange={(v) => setD({ ...d, startTime: v })} onKeyDown={keys} />
      </>
    );

  return (
    <span className="meta-edit" ref={box} onBlur={onBlur}>
      {fields}
    </span>
  );
}
