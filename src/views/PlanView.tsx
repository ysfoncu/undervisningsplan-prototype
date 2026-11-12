import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "../format";
import { fill, L } from "../labels";
import { accessOf, statusOf, useStore } from "../store";
import type { Annotation, Plan } from "../types";
import { Feed, type AnnActions, type FeedFocus } from "../components/Feed";
import { PlanEditor, type PlanEditorHandle } from "../components/PlanEditor";
import { deleteAnnotationRecord, patchAnnotation, setAnnotation, useAnnotations, usePresence } from "../collab";
import { nowIso } from "../format";
import { People } from "../components/People";
import { Avatar, Dialog, Drawer, Icon, StatusChip } from "../components/ui";
import { ObserveTab } from "./ObserveView";
import { nextAction } from "../next";
import { CompletedView } from "./CompletedView";
import { MetaRow, TitleField } from "../components/PlanMeta";

type Tab = "plan" | "observe";

export function PlanView({ planId, back }: { planId: string; back: () => void }) {
  const { state, me, markSeen } = useStore();
  const plan = state.plans.find((p) => p.id === planId);
  const access = plan ? accessOf(plan, me.id) : null;
  const [tab, setTab] = useState<Tab>(() => (plan && plan.phase !== "plan" ? "observe" : "plan"));
  const [overlay, setOverlay] = useState<"share" | "history" | null>(null);

  useEffect(() => {
    if (plan && access && access !== "owner") markSeen(plan.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, me.id]);

  if (!plan) {
    // e.g. a link to a plan removed by "Tilbakestill demo"
    return (
      <div className="page">
        <button className="link-btn" onClick={back}>
          ← {L.back}
        </button>
        <p className="empty">{L.planMissing}</p>
      </div>
    );
  }
  if (!access) {
    return (
      <div className="page">
        <button className="link-btn" onClick={back}>
          ← {L.back}
        </button>
        <p className="empty">Du har ikke tilgang til denne planen.</p>
      </div>
    );
  }

  const status = statusOf(plan);
  const next = nextAction(plan, me, state.users);
  const myLive = plan.observations.find((o) => o.observerId === me.id && !o.endedAt);
  const visibleNotes = myLive ? myLive.notes.length : plan.observations.filter((o) => o.endedAt).reduce((n, o) => n + o.notes.length, 0);
  const annCount = plan.openCount + plan.comments.length;

  return (
    <div className="page page-wide">
      <div className="plan-head">
        <div className="plan-head-left">
          <button className="link-btn" onClick={back}>
            ← {L.back}
          </button>
          <div className="plan-head-main">
            <TitleField plan={plan} editable={access === "owner" && plan.phase === "plan"} />
            <StatusChip status={status} />
            {access !== "owner" && <span className={`access-tag access-${access}`}>{L.access[access]}</span>}
          </div>
          {plan.phase !== "done" && <MetaRow plan={plan} editable={access === "owner" && plan.phase === "plan"} />}
          {plan.phase !== "done" && next.text && (
            <p className={`plan-next ${next.mine ? "is-mine" : ""}`} role="status">
              <span aria-hidden="true">→</span> {next.text}
            </p>
          )}
        </div>
        <HeadActions plan={plan} isOwner={access === "owner"} open={setOverlay} />
      </div>

      {overlay === "share" && (
        <Dialog title={access === "owner" && plan.phase !== "done" ? (plan.info.title.trim() ? fill(L.shareTitle, { title: plan.info.title }) : L.shareUntitledTitle) : L.people} onClose={() => setOverlay(null)}>
          <People plan={plan} editable={access === "owner" && plan.phase !== "done"} />
        </Dialog>
      )}
      {overlay === "history" && (
        <Drawer title={L.history} onClose={() => setOverlay(null)}>
          <History plan={plan} />
        </Drawer>
      )}

      {plan.phase === "done" ? (
        // Finished: one combined report instead of the two tabs.
        <CompletedView plan={plan} />
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "plan"} className={`tab ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")}>
              {L.tabPlan}
              {annCount > 0 && <span className="tab-count">{annCount}</span>}
            </button>
            <button role="tab" aria-selected={tab === "observe"} className={`tab ${tab === "observe" ? "active" : ""}`} onClick={() => setTab("observe")}>
              {L.tabObserve}
              {visibleNotes > 0 && <span className="tab-count">{visibleNotes}</span>}
            </button>
          </div>

          {tab === "plan" ? <PlanTab plan={plan} /> : <ObserveTab plan={plan} />}
        </>
      )}
    </div>
  );
}

// ─── Plan tab ───────────────────────────────────────────────────────────────

/**
 * One live document. Owner, Redaktør and Observatør write in it at the same
 * time (Google Docs style); Leser follows along read-only. Everyone who can
 * edit can also annotate. Editable until the plan is marked as completed.
 */
function PlanTab({ plan }: { plan: Plan }) {
  const { me, user, showToast, saveBody, logEvent } = useStore();
  const access = accessOf(plan, me.id)!;
  // Editable until the plan is marked as completed (also during and after observation).
  const done = plan.phase === "done";
  const canEdit = !done && access !== "leser";
  const annotations = useAnnotations(plan.id);
  const openCount = annotations.filter((a) => !a.outcome).length;
  const [presentIds, setPresentIds] = useState<Set<string> | null>(null);
  const [focus, setFocus] = useState<FeedFocus | null>(null);
  const editorRef = useRef<PlanEditorHandle>(null);
  const others = usePresence(plan.id);
  const editingNow = others.filter((p) => p.focusing && p.userId !== me.id);

  // The focus ring on a card fades after a moment.
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => setFocus(null), 1600);
    return () => window.clearTimeout(t);
  }, [focus]);

  // Keep the plan list's "open annotations" count in step.
  useEffect(() => {
    if (canEdit && openCount !== plan.openCount) saveBody(plan.id, plan.body, openCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCount]);

  const logResolve = (a: Annotation, line: string) => logEvent(plan.id, fill(line, { name: me.name, author: user(a.authorId).name }));
  const actions: AnnActions = {
    accept: (a) => {
      const r = editorRef.current?.accept(a) ?? "missing";
      if (r === "changed") return showToast(L.annChanged);
      if (r === "missing") return showToast(L.annOrphan);
      patchAnnotation(plan.id, a.id, { outcome: "accepted", resolvedAt: nowIso(), resolvedBy: me.id });
      logResolve(a, L.hAccepted);
      showToast(L.annAcceptedToast);
    },
    dismiss: (a) => {
      editorRef.current?.dismiss(a.id);
      patchAnnotation(plan.id, a.id, { outcome: "dismissed", resolvedAt: nowIso(), resolvedBy: me.id });
      logResolve(a, a.type === "highlight" ? L.hResolved : L.hDismissed);
    },
    editNote: (a, note) => {
      patchAnnotation(plan.id, a.id, { note });
      showToast(L.toastUpdated);
    },
    remove: (a) => {
      editorRef.current?.dismiss(a.id);
      deleteAnnotationRecord(plan.id, a.id);
      showToast(L.toastAnnDeleted);
    },
  };

  return (
    <div className="two-col">
      <div className="col-main">
        <section className="card plan-doc" aria-labelledby="sec-plan">
          <div className="plan-doc-head">
            <h3 id="sec-plan">{L.secPlan}</h3>
            <span className="muted small plan-doc-state">
              {canEdit ? L.liveSaved : L.liveReadOnly}
            </span>
          </div>
          {editingNow.length > 0 && (
            <p className="live-banner small">
              <span className="live-dot" aria-hidden="true" />
              {fill(editingNow.length === 1 ? L.liveWritingOne : L.liveWritingMany, { names: editingNow.map((p) => p.name.split(" ")[0]).join(", ") })}
            </p>
          )}
          <PlanEditor
            key={`${me.id}-${canEdit}`}
            ref={editorRef}
            planId={plan.id}
            me={me}
            editable={canEdit}
            canAnnotate={canEdit}
            annotations={annotations}
            onMarkClick={(id) => setFocus({ id, from: "text" })}
            onMarksChange={setPresentIds}
            onLocalEdit={(text) => saveBody(plan.id, text, openCount)}
            onAnnotate={(a) => {
              setAnnotation(plan.id, { ...a, authorId: me.id, createdAt: nowIso(), outcome: null, resolvedAt: null, resolvedBy: null });
              showToast(L.annAddedToast);
            }}
            toast={showToast}
          />
        </section>
      </div>
      <aside className="col-side">
        <Feed
          plan={plan}
          annotations={annotations}
          presentIds={presentIds}
          focus={focus}
          onCardClick={(id) => {
            setFocus({ id, from: "card" });
            editorRef.current?.reveal(id);
          }}
          canComment={canEdit}
          canResolve={canEdit}
          actions={actions}
        />
      </aside>
    </div>
  );
}

// ─── History ────────────────────────────────────────────────────────────────

function History({ plan }: { plan: Plan }) {
  const ev = [...plan.log].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="history history-timeline">
      {ev.map((e, i) => (
        <li key={i}>
          <span className="history-dot" aria-hidden="true" />
          <div>
            <div>{e.text}</div>
            <div className="muted small">{fmtDateTime(e.at)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Header actions (Google Docs style) ─────────────────────────────────────

function HeadActions({ plan, isOwner, open }: { plan: Plan; isOwner: boolean; open: (o: "share" | "history") => void }) {
  const { user, me } = useStore();
  const people = plan.participants.map((p) => user(p.userId));
  // Who has the plan open in another tab right now (one avatar per person).
  const here = [...new Map(usePresence(plan.id).filter((p) => p.userId !== me.id).map((p) => [p.userId, p])).values()];
  return (
    <div className="head-actions">
      {here.length > 0 && (
        <div className="presence" aria-label={fill(L.hereNow, { names: here.map((p) => p.name).join(", ") })} title={fill(L.hereNow, { names: here.map((p) => p.name).join(", ") })}>
          {here.map((p) => (
            <span key={p.userId} className="presence-av" style={{ boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${p.color}` }}>
              <Avatar user={user(p.userId)} size={28} />
            </span>
          ))}
        </div>
      )}
      {people.length > 0 && (
        <button className="avatar-stack" onClick={() => open("share")} aria-label={`${L.people}: ${people.map((u) => u.name).join(", ")}`} title={people.map((u) => u.name).join(", ")}>
          {people.slice(0, 3).map((u) => (
            <Avatar key={u.id} user={u} size={30} />
          ))}
          {people.length > 3 && <span className="avatar-more">+{people.length - 3}</span>}
        </button>
      )}
      <button className="icon-round" onClick={() => open("history")} aria-label={L.openHistory} title={L.openHistory}>
        <Icon name="history" />
      </button>
      {isOwner ? (
        <button
          className="btn btn-primary btn-share"
          disabled={plan.phase === "done"}
          title={plan.phase === "done" ? L.shareDone : undefined}
          onClick={() => open("share")}
        >
          <Icon name="share" size={18} /> {L.share}
        </button>
      ) : (
        <button className="icon-round" onClick={() => open("share")} aria-label={L.people} title={L.people}>
          <Icon name="share" />
        </button>
      )}
    </div>
  );
}
