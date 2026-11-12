import { fmtLesson } from "../format";
import { fill, L } from "../labels";
import { nextAction } from "../next";
import { accessOf, statusOf, useStore } from "../store";
import type { Plan } from "../types";
import { Avatar, Empty, StatusChip } from "../components/ui";

function PlanCard({ plan, onOpen }: { plan: Plan; onOpen: () => void }) {
  const { me, state, user } = useStore();
  const next = nextAction(plan, me, state.users);
  const c = plan.info;
  const owner = user(plan.ownerId);
  const access = accessOf(plan, me.id);
  return (
    <button className={`plan-card ${next.mine ? "is-mine" : ""}`} onClick={onOpen}>
      <div className="plan-card-top">
        <span className="plan-card-title">{c.title || L.untitled}</span>
        <StatusChip status={statusOf(plan)} />
      </div>
      <div className="plan-card-meta">
        {me.id !== plan.ownerId && (
          <>
            <Avatar user={owner} size={18} /> {owner.name} ·{" "}
          </>
        )}
        {access && access !== "owner" && <span className={`access-tag access-${access}`}>{L.access[access]}</span>}
        {[c.subject, c.className].filter(Boolean).join(" · ")}
        {c.date && <> · {fmtLesson(c.date, c.startTime)}</>}
      </div>
      {next.text && (
        <div className={`plan-card-next ${next.mine ? "tone-blue" : "muted"}`}>
          {next.mine ? "→ " : ""}
          {next.text}
        </div>
      )}
    </button>
  );
}

export function Home({ open }: { open: (id: string) => void }) {
  const { me, state, createPlan } = useStore();
  const first = me.name.split(" ")[0];

  if (me.role === "student") {
    const mine = state.plans.filter((p) => p.ownerId === me.id);
    const active = mine.filter((p) => p.phase !== "done");
    const done = mine.filter((p) => p.phase === "done");
    return (
      <div className="page">
        <header className="home-head">
          <div>
            <h1>{fill(L.homeHello, { name: first })}</h1>
            <p className="muted">{L.homeIntroStudent}</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => open(createPlan())}>
            + {L.newPlan}
          </button>
        </header>

        <ol className="how" aria-label={L.howItWorks}>
          {L.steps.map((s, i) => (
            <li key={s.t}>
              <span className="how-n">{i + 1}</span>
              <div>
                <strong>{s.t}</strong>
                <p className="muted small">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2>{L.myPlans}</h2>
        {active.length === 0 ? <Empty>{L.emptyStudent}</Empty> : active.map((p) => <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />)}

        {done.length > 0 && (
          <>
            <h2>{L.finished}</h2>
            {done.map((p) => (
              <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
            ))}
          </>
        )}
      </div>
    );
  }

  // Supervisor / peer
  const shared = state.plans.filter((p) => p.participants.some((x) => x.userId === me.id));
  const waiting = shared.filter((p) => p.phase !== "done" && nextAction(p, me, state.users).mine);
  const rest = shared.filter((p) => p.phase !== "done" && !waiting.includes(p));
  const done = shared.filter((p) => p.phase === "done");

  return (
    <div className="page">
      <header className="home-head">
        <div>
          <h1>{fill(L.homeHello, { name: first })}</h1>
          <p className="muted">{L.homeIntroOther}</p>
        </div>
      </header>
      {shared.length === 0 && <Empty>{L.emptyOther}</Empty>}

      <h2>{L.waitingForYou}</h2>
      {waiting.length === 0 ? <Empty>{L.nothingWaiting}</Empty> : waiting.map((p) => <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />)}

      {rest.length > 0 && (
        <>
          <h2>{L.upcoming}</h2>
          {rest.map((p) => (
            <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
          ))}
        </>
      )}
      {done.length > 0 && (
        <>
          <h2>{L.finished}</h2>
          {done.map((p) => (
            <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
          ))}
        </>
      )}
    </div>
  );
}
