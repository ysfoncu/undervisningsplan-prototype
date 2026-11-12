import { fmtLesson } from "./format";
import { fill, L } from "./labels";
import { accessOf, statusOf, summaryAuthorOf } from "./store";
import type { Plan, User } from "./types";

/** One line telling the viewer what happens next, and whether it is on them. */
export function nextAction(p: Plan, me: User, users: User[]): { text: string; mine: boolean } {
  const s = statusOf(p);
  const access = accessOf(p, me.id);
  const when = fmtLesson(p.info.date, p.info.startTime);

  if (access === "owner") {
    switch (s) {
      case "draft":
        return { text: !p.info.date || !p.info.startTime ? L.next.studentNeedsWhen : L.next.studentDraft, mine: true };
      case "published": {
        const open = p.openCount;
        return { text: open ? fill(L.next.studentOpen, { n: open }) : L.next.studentOpenNone, mine: open > 0 };
      }
      case "observing":
        return { text: L.next.studentObserving, mine: false };
      case "awaitingSummary":
        return { text: L.next.studentAwaiting, mine: !p.observations.some((o) => !o.endedAt) };
      case "summaryReady":
        return { text: L.next.studentSummary, mine: true };
      default:
        return { text: "", mine: false };
    }
  }

  if (!p.body.trim() && p.phase === "plan") return { text: L.next.notPublished, mine: false };
  if (access === "redaktor" && s === "published") return { text: L.next.editor, mine: true };
  if (access === "observator") {
    const myObs = p.observations.find((o) => o.observerId === me.id);
    if (myObs && !myObs.endedAt) return { text: L.next.observerLive, mine: true };
    if (s === "published" || (s === "observing" && !myObs)) return { text: fill(L.next.observer, { when }), mine: true };
    if (s === "awaitingSummary" && summaryAuthorOf(p, users)?.id === me.id) return { text: L.next.observerSummary, mine: true };
  }
  return { text: "", mine: false };
}
