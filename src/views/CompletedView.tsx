import { fmtDateTime, fmtLesson } from "../format";
import { fill, L } from "../labels";
import { canSeeMedia, useStore } from "../store";
import type { Plan } from "../types";
import { PlanEditor } from "../components/PlanEditor";
import { useAnnotations } from "../collab";
import { Avatar } from "../components/ui";
import { KIND_ICON, KINDS, NoteItem } from "./ObserveView";

/**
 * A finished plan as one document: the lesson facts, the final plan text,
 * the feedback with next steps, and the observation findings grouped by
 * type. Replaces the Plan / Observasjon tabs once the plan is completed.
 * Printable (browser print → PDF).
 */
export function CompletedView({ plan }: { plan: Plan }) {
  const { me, user, showToast } = useStore();
  const annotations = useAnnotations(plan.id);
  const owner = user(plan.ownerId);
  const observations = plan.observations.filter((o) => o.endedAt);
  const notes = observations
    .flatMap((o) => o.notes.map((n) => ({ ...n, author: user(o.observerId).name })))
    .sort((a, b) => a.offsetSec - b.offsetSec);
  const s = plan.summary?.sharedAt ? plan.summary : null;
  const c = plan.info;

  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-head">
        <div className="row between wrap">
          <p className="report-eyebrow">✓ {L.report.eyebrow}</p>
          <button className="btn no-print" onClick={() => window.print()}>
            ⎙ {L.report.print}
          </button>
        </div>
        <h2 id="report-title">{c.title || L.untitled}</h2>
        <dl className="report-facts">
          <div>
            <dt>{L.report.student}</dt>
            <dd>{owner.name}</dd>
          </div>
          <div>
            <dt>{L.fSubject}</dt>
            <dd>{[c.subject, c.className].filter(Boolean).join(" · ") || L.emptyValue}</dd>
          </div>
          <div>
            <dt>{L.report.lesson}</dt>
            <dd>
              {c.date ? fmtLesson(c.date, c.startTime) : L.emptyValue}
              {c.durationMin > 0 && <> · {fill(L.durationValue, { n: c.durationMin })}</>}
            </dd>
          </div>
          <div>
            <dt>{L.report.observers}</dt>
            <dd>{observations.map((o) => user(o.observerId).name).join(", ") || "—"}</dd>
          </div>
          {plan.doneAt && (
            <div>
              <dt>{L.report.completed}</dt>
              <dd>{fmtDateTime(plan.doneAt)}</dd>
            </div>
          )}
        </dl>
      </header>

      <section className="report-section" aria-labelledby="r-plan">
        <h3 id="r-plan">
          <span className="report-num">1</span> {L.report.plan}
        </h3>
        <div className="report-plan">
          <PlanEditor planId={plan.id} me={me} editable={false} canAnnotate={false} annotations={annotations} toast={showToast} />
        </div>
        {annotations.length + plan.comments.length > 0 && <p className="muted small">{fill(L.report.planFoot, { ann: annotations.length, com: plan.comments.length })}</p>}
      </section>

      <section className="report-section" aria-labelledby="r-feedback">
        <h3 id="r-feedback">
          <span className="report-num">2</span> {L.report.feedback}
        </h3>
        {s ? (
          <>
            <p className="report-text">{s.feedback}</p>
            {s.nextSteps && (
              <div className="report-next">
                <h4>{L.report.nextSteps}</h4>
                <p className="report-text">{s.nextSteps}</p>
              </div>
            )}
            <p className="report-by">
              <Avatar user={user(s.authorId)} size={20} /> {fill(L.summaryBy, { name: user(s.authorId).name, when: fmtDateTime(s.sharedAt!) })}
            </p>
            {s.replies.length > 0 && (
              <div className="report-replies">
                <h4>{L.report.replies}</h4>
                {s.replies.map((r) => (
                  <p key={r.id} className="report-text">
                    «{r.text}» <span className="muted small">— {user(r.authorId).name}, {fmtDateTime(r.at)}</span>
                  </p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{L.report.noFeedback}</p>
        )}
      </section>

      <section className="report-section" aria-labelledby="r-findings">
        <h3 id="r-findings">
          <span className="report-num">3</span> {L.report.findings}
        </h3>
        {notes.length === 0 ? (
          <p className="muted">{L.report.noFindings}</p>
        ) : (
          <>
            <p className="muted small">
              {fill(L.report.findingsIntro, { n: notes.length, obs: observations.map((o) => user(o.observerId).name.split(" ")[0]).join(" og ") })}
            </p>
            <div className="kind-summary">
              {KINDS.map((k) => (
                <span key={k} className={`kind-pill kind-${k}`}>
                  {KIND_ICON[k]} {notes.filter((n) => n.kind === k).length} {L.noteKind[k].toLowerCase()}
                </span>
              ))}
            </div>
            <div className="report-kinds">
              {KINDS.map((k) => {
                const list = notes.filter((n) => n.kind === k);
                if (!list.length) return null;
                return (
                  <div key={k} className="group">
                    <h4>
                      {KIND_ICON[k]} {L.report.kindTitle[k]}
                    </h4>
                    <ul className="notes">
                      {list.map((n) => (
                        <NoteItem key={n.id} note={n} author={n.author} hideMedia={!canSeeMedia(plan, me.id)} social={{ planId: plan.id, canInteract: false }} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      {plan.finalNote && (
        <section className="report-section" aria-labelledby="r-final">
          <h3 id="r-final">
            <span className="report-num">4</span> {L.report.finalNote}
          </h3>
          <p className="report-text">{plan.finalNote.text}</p>
          <p className="report-by">
            <Avatar user={owner} size={20} /> {owner.name}, {fmtDateTime(plan.finalNote.at)}
          </p>
        </section>
      )}
    </article>
  );
}
