import type { Annotation, Plan, State, User } from "./types";

export const USERS: User[] = [
  { id: "u-ingrid", name: "Ingrid Haugen", role: "student", color: "#0052CC" },
  { id: "u-kari", name: "Kari Lunde", role: "veileder", color: "#00875A" },
  { id: "u-jonas", name: "Jonas Berg", role: "medstudent", color: "#6554C0" },
  { id: "u-amina", name: "Amina Rahimi", role: "medstudent", color: "#FF8B00" },
  { id: "u-per", name: "Per Solberg", role: "veileder", color: "#00A3BF" },
];

/** ISO string for `days` from today at hh:mm local time. */
function at(days: number, hh: number, mm = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}
function dateOnly(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─── Seed documents (Lexical JSON) ──────────────────────────────────────────
// Small builders so the demo plans can carry formatting and annotation marks.
// Text format bits follow Lexical: bold 1, italic 2, highlight 128.
type J = Record<string, unknown>;
const B = 1;
const I = 2;
const t = (text: string, format = 0): J => ({ type: "text", text, format, detail: 0, mode: "normal", style: "", version: 1 });
const el = (type: string, children: J[], extra: J = {}): J => ({ type, children, direction: "ltr", format: "", indent: 0, version: 1, ...extra });
const p = (...c: J[]) => el("paragraph", c, { textFormat: 0, textStyle: "" });
const h = (text: string) => el("heading", [t(text)], { tag: "h3" });
const mark = (id: string, ...c: J[]) => el("mark", c, { ids: [id] });
const list = (listType: "bullet" | "number" | "check", items: { c: J[]; checked?: boolean }[]) =>
  el(
    "list",
    items.map((it, i) => el("listitem", it.c, { value: i + 1, checked: listType === "check" ? !!it.checked : undefined })),
    { listType, start: 1, tag: listType === "number" ? "ol" : "ul" },
  );
const doc = (...c: J[]) => JSON.stringify({ root: el("root", c) });

const BROK_DOC = doc(
  h("Mål for timen"),
  p(t("Elevene kan forklare hva "), t("teller", B), t(" og "), t("nevner", B), t(" betyr, og sammenligne to brøker med ulik nevner.")),
  h("Gjennomføring"),
  p(t("Oppstart (5 min):", B), t(" "), mark("a4", t("Jeg viser et bilde av to pizzaer")), t(" på tavla og spør «"), mark("a2", t("Hvem fikk mest?")), t("». Alle skriver svaret på mini-tavle før vi snakker sammen.")),
  p(t("Utforsking (15 min):", B), t(" Elevene jobber i par med brøkstrimler og sammenligner brøker. Jeg deler ut strimlene før jeg forklarer oppgaven.")),
  p(t("Avslutning (10 min):", B), t(" Parene viser løsningene sine, og jeg samler reglene på tavla. Til slutt løser alle to oppgaver på en "), mark("a3", t("exit-lapp")), t(".")),
  h("Utstyr"),
  list("check", [
    { c: [t("Brøkstrimler til 14 par")], checked: true },
    { c: [t("Mini-tavler og tusjer")] },
    { c: [t("Exit-lapper (kopier 28 stk.)")] },
  ]),
  h("Observatørene kan se etter"),
  list("bullet", [{ c: [t("Hvordan jeg sjekker at "), t("alle", 128), t(" har forstått.")] }, { c: [t("Overgangene mellom delene av timen.")] }]),
);

const DIKT_DOC = doc(
  h("Mål for timen"),
  p(t("Elevene kan bruke sanseinntrykk i egne dikt.")),
  h("Gjennomføring"),
  p(t("Oppstart (10 min):", B), t(" Høytlesing av to korte høstdikt.")),
);

const VANN_DOC = doc(
  h("Mål for timen"),
  p(t("Elevene kan beskrive "), t("fordamping", I), t(", "), t("kondensasjon", I), t(" og "), t("nedbør", I), t(".")),
  h("Gjennomføring"),
  list("number", [
    { c: [t("Oppstart (5 min):", B), t(" Video av en regnbyge i timelapse.")] },
    { c: [t("Forsøk (20 min):", B), t(" Glass med varmt vann og is på lokket. Elevene noterer hva de ser.")] },
    { c: [t("Tegning (15 min):", B), t(" Elevene tegner kretsløpet med piler og ord.")] },
  ]),
);

/** Grey italic guidance text in the template, like placeholder text in a Word template. */
export const GUIDANCE_COLOR = "#6b778c";
const g = (text: string): J => ({ ...t(text, I), style: `color: ${GUIDANCE_COLOR};` });

/**
 * Starting text of every new plan: the usual parts of a lesson plan with a
 * short prompt under each. The student writes over the prompts.
 */
export const PLAN_TEMPLATE = doc(
  h("Mål for timen"),
  p(g("Hva skal elevene kunne eller forstå etter timen?")),
  h("Gjennomføring"),
  list("number", [
    { c: [t("Oppstart (… min):", B), t(" "), g("Hvordan starter du og fanger interessen?")] },
    { c: [t("Hoveddel (… min):", B), t(" "), g("Hva gjør elevene, og hva gjør du?")] },
    { c: [t("Avslutning (… min):", B), t(" "), g("Hvordan sjekker du hva elevene har lært?")] },
  ]),
  h("Utstyr"),
  list("check", [{ c: [g("Det du må ha klart før timen")] }]),
  h("Observatørene kan se etter"),
  list("bullet", [{ c: [g("Hva vil du ha tilbakemelding på?")] }]),
);

/** The prompt texts, so the editor can tell an untouched prompt from typed text. */
export const TEMPLATE_PROMPTS = new Set<string>(
  (function collect(n: J): string[] {
    const own = n.type === "text" && typeof n.style === "string" && n.style.includes(GUIDANCE_COLOR) ? [n.text as string] : [];
    return own.concat(((n.children as J[]) ?? []).flatMap(collect));
  })(JSON.parse(PLAN_TEMPLATE).root),
);

const ann = (a: Partial<Annotation> & Pick<Annotation, "id" | "type" | "selectedText" | "authorId" | "createdAt">): Annotation => ({
  note: "",
  outcome: null,
  resolvedAt: null,
  resolvedBy: null,
  ...a,
});

/** Starting content of each demo plan's shared document (used once, by the first tab). */
export const SEED_DOCS: Record<string, { state: string; annotations: Annotation[] }> = {
  "p-brok": {
    state: BROK_DOC,
    annotations: [
      ann({
        id: "a1",
        type: "text",
        selectedText: "sammenligner brøker.",
        note: "sammenligner brøker. Jeg deler ut strimlene før jeg forklarer oppgaven.",
        authorId: "u-jonas",
        createdAt: at(-2, 19, 30),
        outcome: "accepted",
        resolvedAt: at(-1, 18),
        resolvedBy: "u-ingrid",
      }),
      ann({ id: "a2", type: "highlight", selectedText: "Hvem fikk mest?", note: "Hvordan får du svar fra alle, ikke bare de som rekker opp hånda?", authorId: "u-jonas", createdAt: at(-2, 19, 35) }),
      ann({ id: "a3", type: "highlight", selectedText: "exit-lapp", note: "Fint! Har du tid til å se gjennom lappene før neste time?", authorId: "u-jonas", createdAt: at(0, 8, 10) }),
      ann({
        id: "a4",
        type: "text",
        selectedText: "Jeg viser et bilde av to pizzaer",
        note: "Jeg viser et bilde av to like store pizzaer delt i ulikt antall biter",
        authorId: "u-kari",
        createdAt: at(0, 8, 40),
      }),
    ],
  },
  "p-dikt": { state: DIKT_DOC, annotations: [] },
  "p-vann": { state: VANN_DOC, annotations: [] },
};

/** Plain text of a seed doc, for the plan's text snapshot before anyone opens it. */
function plain(state: string): string {
  const out: string[] = [];
  const walk = (n: J) => {
    if (n.type === "text") out.push(n.text as string);
    (n.children as J[] | undefined)?.forEach(walk);
    if (["paragraph", "heading", "listitem"].includes(n.type as string)) out.push("\n");
  };
  walk((JSON.parse(state) as { root: J }).root);
  return out.join("").trim();
}

const brok: Plan = {
  id: "p-brok",
  ownerId: "u-ingrid",
  phase: "plan",
  info: { title: "Brøk i hverdagen", className: "6B", subject: "Matematikk", date: dateOnly(0), startTime: "10:15", durationMin: 35 },
  body: plain(BROK_DOC),
  editedBy: ["u-ingrid", "u-jonas"],
  openCount: 3,
  comments: [
    {
      id: "c1",
      authorId: "u-kari",
      text: "God start. Tenk gjennom hva elevene som blir fort ferdige skal gjøre i midtdelen.",
      createdAt: at(-2, 20, 5),
      editedAt: null,
    },
    {
      id: "c2",
      authorId: "u-ingrid",
      text: "Takk! Jeg legger inn ekstraoppgaver med tredjedeler.",
      createdAt: at(-1, 17, 40),
      editedAt: null,
    },
    {
      id: "c3",
      authorId: "u-kari",
      text: "Ser bra ut nå. Jeg kommer til å se mest på hvordan du får med hele klassen i oppsummeringen.",
      createdAt: at(0, 7, 55),
      editedAt: null,
    },
  ],
  participants: [
    { userId: "u-jonas", access: "redaktor", invitedAt: at(-3, 20), seenAt: at(-2, 19, 20) },
    { userId: "u-kari", access: "observator", invitedAt: at(-3, 20), seenAt: at(-1, 21) },
    { userId: "u-amina", access: "leser", invitedAt: at(-1, 18), seenAt: null },
  ],
  observations: [],
  summary: null,
  log: [
    { at: at(-4, 16), text: "Opprettet" },
    { at: at(-3, 20), text: "Jonas Berg invitert som Redaktør" },
    { at: at(-3, 20), text: "Kari Lunde invitert som Observatør" },
    { at: at(-2, 19, 30), text: "Jonas Berg redigerte planen" },
    { at: at(-1, 18), text: "Ingrid Haugen godtok forslaget fra Jonas Berg" },
    { at: at(-1, 18), text: "Amina Rahimi invitert som Leser" },
  ],
  createdAt: at(-4, 16),
  updatedAt: at(0, 8, 40),
  doneAt: null,
};

const dikt: Plan = {
  id: "p-dikt",
  ownerId: "u-ingrid",
  phase: "plan",
  info: { title: "Skrive dikt om høsten", className: "6B", subject: "Norsk", date: dateOnly(3), startTime: "08:30", durationMin: 45 },
  body: plain(DIKT_DOC),
  editedBy: ["u-ingrid"],
  openCount: 0,
  comments: [],
  participants: [],
  observations: [],
  summary: null,
  log: [{ at: at(-1, 20), text: "Opprettet" }],
  createdAt: at(-1, 20),
  updatedAt: at(-1, 20, 30),
  doneAt: null,
};

const vann: Plan = {
  id: "p-vann",
  ownerId: "u-ingrid",
  phase: "done",
  info: { title: "Vannets kretsløp", className: "5A", subject: "Naturfag", date: dateOnly(-7), startTime: "11:00", durationMin: 40 },
  body: plain(VANN_DOC),
  editedBy: ["u-ingrid"],
  openCount: 0,
  comments: [],
  participants: [
    { userId: "u-kari", access: "observator", invitedAt: at(-10, 9), seenAt: at(-10, 12) },
    { userId: "u-amina", access: "observator", invitedAt: at(-10, 9), seenAt: at(-9, 18) },
  ],
  observations: [
    {
      observerId: "u-kari",
      startedAt: at(-7, 11),
      endedAt: at(-7, 11, 42),
      notes: [
        { id: "n1", kind: "styrke", offsetSec: 95, text: "Rolig og tydelig stemme, alle fulgte med på videoen." },
        { id: "n2", kind: "forslag", offsetSec: 410, text: "Instruksjonene kom mens elevene hentet utstyr. Vent til alle ser på deg." },
        { id: "n3", kind: "sporsmal", offsetSec: 960, text: "Hvorfor valgte du å la gruppene velge selv?" },
        { id: "n4", kind: "styrke", offsetSec: 1800, text: "Du gikk rundt til alle gruppene under tegningen." },
      ],
    },
    {
      observerId: "u-amina",
      startedAt: at(-7, 11),
      endedAt: at(-7, 11, 40),
      notes: [{ id: "n5", kind: "forslag", offsetSec: 380, text: "Skriv trinnene på tavla, flere spurte hva de skulle gjøre." }],
    },
  ],
  summary: {
    authorId: "u-kari",
    feedback: "Trygg stemmebruk, og du brukte rommet godt. Instruksjonene til forsøket kom for tidlig: samle oppmerksomheten først, og vis trinnene skriftlig.",
    nextSteps: "Øv på å gi instruksjoner i tre korte trinn, med trinnene på tavla.",
    sharedAt: at(-6, 15),
    replies: [{ id: "r1", authorId: "u-ingrid", text: "Takk! Jeg prøver tavle-trinnene i neste time.", at: at(-6, 18) }],
  },
  log: [
    { at: at(-11, 15), text: "Opprettet" },
    { at: at(-7, 11), text: "Observasjon startet (Kari Lunde)" },
    { at: at(-7, 11, 40), text: "Observasjon avsluttet (Amina Rahimi)" },
    { at: at(-7, 11, 42), text: "Observasjon avsluttet (Kari Lunde)" },
    { at: at(-6, 15), text: "Tilbakemelding delt" },
    { at: at(-6, 18, 5), text: "Fullført" },
  ],
  createdAt: at(-11, 15),
  updatedAt: at(-6, 18),
  doneAt: at(-6, 18, 5),
};

export function seed(): State {
  return {
    users: USERS,
    group: {
      id: "g-3b",
      name: "Praksis 3B",
      school: "Tromsdalen skole",
      memberIds: ["u-ingrid", "u-kari", "u-jonas", "u-amina"],
    },
    plans: [brok, dikt, vann],
  };
}
