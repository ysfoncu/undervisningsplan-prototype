# Undervisningsplan — clickable prototype

A front-end-only prototype of a simplified **Plan → Observe** flow for teacher
students in internship (MOSO InPraxis). It replaces the current four-phase
"Planer" feature. The F-numbers below refer to findings from a walkthrough of
the current feature; the design notes are kept outside this repository.

> **One browser per tester.** Co-editing syncs between tabs of the same
> browser only (no server). Two people on two devices each get their own
> separate copy of the demo.

## Run

```bash
npm install
npm run dev      # http://localhost:5199
npm run build    # type-check + production build
```

Deploy: Vercel (framework preset *Vite*, build `npm run build`, output
`dist`). The build is static; no environment variables are needed.

React 18, TypeScript, Vite 6 (same stack as the inspiration repo
`ysfoncu/arbeidskrav-uit`). The plan text uses **Lexical 0.52.0** with
**Yjs 13.6.33** for live co-editing, all pinned to exact versions.

## The model in one paragraph

A plan has its lesson facts (title, subject, class, date, time, optional meeting link) in
the page header, edited in place by the owner, and **one shared rich-text
document**. There is no draft, no publish and no numbered versions: the owner,
every **Redaktør** and every **Observatør** write in the same document **at the
same time**, like Google Docs, and see each other's cursors and edits live.
**Leser** follows along read-only. Anyone who can edit can also **annotate**,
the owner included: select text → *Uthev* / *Stryk* / *Erstatt tekst* with an
optional note. Suggestions are resolved on their card: **Godta** makes the
change in the text, **Avvis** / **Løs** removes the mark. Resolved cards fold
under "Vis løste" and stay there with who resolved them. The right column,
**Markeringer og kommentarer**, is one feed of annotations and free-text
comments with the comment box pinned at the bottom (arbeidskrav-uit teacher
sidebar). The text, comments and annotations stay editable until the student
marks the plan as completed; every edit is in Historikk. No approval step.

## Try co-editing (two tabs = two people)

1.  Open http://localhost:5199 in **two browser tabs**.
2.  In tab 1 choose **Ingrid** ("Vis som" is per tab), click **+ Ny plan**,
    and give it a name. **Del** → invite Jonas as
    *Redaktør*. In tab 2 choose **Jonas** and open the plan.
3.  Type in either tab: the text, coloured cursors with names, and the
    "I planen nå" avatars update in the other tab at once.
4.  Select a few words → the small menu offers *Uthev / Stryk / Erstatt
    tekst*. The mark and its card appear in both tabs.
5.  Make an *Erstatt tekst* suggestion in one tab and click **Godta** on its
    card in the other: the text changes for everyone and the card moves
    under **Vis løste**.

## Who you can be

| Person | Role in the demo (invite them with this access) | Can |
|---|---|---|
| Ingrid Haugen | Owner (student) | Write, annotate, resolve, comment, invite, read notes and feedback |
| Jonas Berg | Redaktør | Write, annotate, resolve, comment |
| Kari Lunde | Observatør | Write, annotate, resolve, comment, observe, write the feedback |
| Amina Rahimi | Leser | Read the live text, annotations and comments |

All are in practice group **Praksis 3B**. Per Solberg is outside the group and
never appears in the invite list.

## Demo script (≈ 5 minutes)

1.  **Ingrid → "+ Ny plan".** Type the title at the top, click *+ Fag* /
    *+ Klasse* / *+ Dato og tid* to fill in details, write the plan (it starts
    from a short template; click a grey prompt and type over it). Everything
    saves as you type. **Del** (top right) invites people (a plan needs a name first; the dialog asks for it. Date and time are optional) as *Leser*,
    *Redaktør* or *Observatør*; the clock icon opens **Historikk**.
2.  **Jonas** (second tab) opens the plan and writes in it while
    Ingrid writes too. He selects a phrase and adds a *Stryk* with a note.
3.  **Ingrid** clicks the card to find the text, then **Godta** or **Avvis**.
    She also adds her own *Uthev*. Comments go in the box at the bottom.
4.  **Amina** can only read; the text updates as others type.
5.  **Kari → Observasjon → Start observasjon.** The plan stays editable.
    Pick a type (keys 1–3), write a note, **Ctrl + Enter**. **📷 Bilde eller
    video** attaches photos or video (camera on a phone); saving requires
    ticking that pupils have consented or cannot be recognised. **▸ Planen**
    shows the live plan read-only. **Demo: +5 min** moves time forward.
6.  **Kari → Avslutt observasjon** (button in the dark timer bar; ends at once, no pop-up), write
    the feedback and *Neste steg*, **Del tilbakemelding**. Ended too early?
    **▶ Start observasjonen igjen** resumes it: the clock continues where it
    stopped and earlier notes keep their times (possible until the plan is
    completed). Kari can edit (pencil) or delete (bin) her own notes until then.
7.  **Ingrid** reads the notes (and the feedback, if any; it is optional), reacts to notes with an emoji or
    a comment (everyone in the plan can), optionally writes an *Avsluttende kommentar*, **Marker som fullført**.
    The plan now shows one combined report: lesson facts, the final plan,
    the feedback with *Neste steg*, and the observation findings grouped by
    type. **Skriv ut / lagre som PDF** prints it.

The prototype starts with no plans: every walkthrough begins with
**+ Ny plan**. **↺ Tilbakestill demo** deletes all plans in every open tab.

## What changed compared with the current feature

| Current (finding) | Prototype |
|---|---|
| Four phases: Planlegging, Observasjon, Veiledning, Arkiv | Two: **Plan** and **Observer**, then *Fullført* |
| Blank CKEditor page with dialogs before it (F6.2) | Details in the header; one live rich-text document, saved as you type |
| Edit lock dialog (F11.2) | No lock: several people edit at once, changes merge (Yjs CRDT) |
| Comments on everything, filtered by phase (F10.2, F13.1) | One feed of annotations and comments; notes live in Observasjon |
| Planning content silently editable later (F11.3, F7.2) | Editable until marked as completed, then read-only; every edit and resolution is in Historikk |
| 8 blocking dialogs and tours (F3.3 … F13.2) | None (ending an observation has no confirmation: it can be restarted) |
| Consent dialog, not stored (F4.1) | Removed with media |
| One generic participant type, "Venter" (F15.2, F15.3) | Leser / Redaktør / Observatør, chosen at invite, changeable |
| Whole organization in invite list (F14.3) | Only the practice group, with search |
| 108 MB of avatar photos (F3.1, F14.1) | Initials only |

## Code map

| File | Purpose |
|---|---|
| `src/collab.ts` | Yjs hub doc per plan (text + annotation records), BroadcastChannel transport with join handshake, merge-before-save, presence, Lexical provider (one view doc per editor), demo reset generations |
| `src/components/PlanEditor.tsx` | Lexical editor: CollaborationPlugin, toolbar, selection menu for annotating, mark styling, reveal/accept/dismiss |
| `src/components/Feed.tsx` | Annotation and comment cards, Godta/Avvis/Løs, "Vis løste", pinned comment box |
| `src/views/PlanView.tsx` | Header (presence avatars, Del, Historikk), Plan tab |
| `src/views/CompletedView.tsx` | Combined report for completed plans (plan + feedback + findings), printable |
| `src/media.ts` | Photo/video storage (IndexedDB), image downscaling, object URLs |
| `src/views/ObserveView.tsx` | Live observer, notes, photos/video, feedback, restart |
| `src/components/PlanMeta.tsx` | Editable title and lesson-details line |
| `src/components/People.tsx` | Participants with access level, invite picker |
| `src/store.tsx` | App state (plans, comments, observations, history), synced across tabs |
| `src/data.ts` | Seed users, group, plans and seed documents (Lexical JSON with marks) |
| `src/types.ts`, `src/labels.ts`, `src/next.ts` | Types, all Norwegian strings, "what happens next" |

## Deliberately not real

*   **No server.** Tabs in one browser sync over `BroadcastChannel`; data is
    in `localStorage`. A real system uses a Yjs WebSocket server (e.g.
    Hocuspocus) with per-plan authorisation and server-side seeding.
*   **No login or permissions.** The switcher hides and shows controls.
*   **App state (comments, history) is one localStorage value** shared by
    tabs; the last writer wins if two tabs change it in the same instant.
    The document and annotations do not have this problem (Yjs merges them).
*   **No restorable versions.** History lists who edited and who resolved
    what; snapshots would be a server feature.
*   **Photos and video stay in this browser** (IndexedDB). Photos are scaled
    to 1600 px; videos are capped at 60 MB. A real system uploads them to
    private storage, enforces "student + observers only" on the server, and
    deletes them after a retention period.
*   **No notifications or export.** Audio comments are left out.
*   **"Demo: +5 min"** exists only to walk through a lesson quickly.
