import type { State, User } from "./types";

export const USERS: User[] = [
  { id: "u-ingrid", name: "Ingrid Haugen", role: "student", color: "#0052CC" },
  { id: "u-kari", name: "Kari Lunde", role: "veileder", color: "#00875A" },
  { id: "u-jonas", name: "Jonas Berg", role: "medstudent", color: "#6554C0" },
  { id: "u-amina", name: "Amina Rahimi", role: "medstudent", color: "#FF8B00" },
  { id: "u-per", name: "Per Solberg", role: "veileder", color: "#00A3BF" },
];

// ─── Plan template (Lexical JSON) ───────────────────────────────────────────
// Small builders for the starting text of a new plan.
// Text format bits follow Lexical: bold 1, italic 2, highlight 128.
type J = Record<string, unknown>;
const B = 1;
const I = 2;
const t = (text: string, format = 0): J => ({ type: "text", text, format, detail: 0, mode: "normal", style: "", version: 1 });
const el = (type: string, children: J[], extra: J = {}): J => ({ type, children, direction: "ltr", format: "", indent: 0, version: 1, ...extra });
const p = (...c: J[]) => el("paragraph", c, { textFormat: 0, textStyle: "" });
const h = (text: string) => el("heading", [t(text)], { tag: "h3" });
const list = (listType: "bullet" | "number" | "check", items: { c: J[]; checked?: boolean }[]) =>
  el(
    "list",
    items.map((it, i) => el("listitem", it.c, { value: i + 1, checked: listType === "check" ? !!it.checked : undefined })),
    { listType, start: 1, tag: listType === "number" ? "ol" : "ul" },
  );
const doc = (...c: J[]) => JSON.stringify({ root: el("root", c) });

/** Grey italic guidance text in the template, like placeholder text in a Word template. */
export const GUIDANCE_COLOR = "#6b778c";
const g = (text: string): J => ({ ...t(text, I), style: `color: ${GUIDANCE_COLOR};` });

/** "Enkel plan": the usual parts of a lesson plan with a short prompt under each. */
const SIMPLE_TEMPLATE = doc(
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

/** "Utvidet plan": goals with success criteria, adapted teaching, assessment and reflection. */
const EXTENDED_TEMPLATE = doc(
  h("Mål og kriterier"),
  p(t("Læringsmål:", B), t(" "), g("Hva skal elevene lære i denne timen?")),
  p(t("Kriterier for måloppnåelse:", B), t(" "), g("Hvordan ser du at et mål er nådd?")),
  h("Før timen"),
  p(g("Hva kan elevene fra før, og hvordan bygger timen videre på det?")),
  h("Gjennomføring"),
  list("number", [
    { c: [t("Introduksjon (… min):", B), t(" "), g("Hvordan presenterer du målet og vekker nysgjerrighet?")] },
    { c: [t("Utforsking (… min):", B), t(" "), g("Hvilke oppgaver jobber elevene med, alene eller sammen?")] },
    { c: [t("Oppsummering (… min):", B), t(" "), g("Hvordan samler du trådene?")] },
  ]),
  h("Tilpasset opplæring"),
  p(g("Hvordan møter du elever som trenger mer støtte eller flere utfordringer?")),
  h("Vurdering underveis"),
  p(g("Hvordan sjekker du forståelse i løpet av timen?")),
  h("Observatørene kan se etter"),
  list("bullet", [{ c: [g("Hva vil du ha tilbakemelding på?")] }]),
  h("Refleksjon etter timen"),
  p(g("Hva fungerte, og hva ville du gjort annerledes? Fyll ut etter timen.")),
);

export type TemplateId = "simple" | "extended";

/** The templates offered when a plan is created (plus "Tom plan"). */
export const TEMPLATES: { id: TemplateId; doc: string; headings: string[] }[] = [
  { id: "simple", doc: SIMPLE_TEMPLATE, headings: ["Mål for timen", "Gjennomføring", "Utstyr", "Observatørene kan se etter"] },
  {
    id: "extended",
    doc: EXTENDED_TEMPLATE,
    headings: ["Mål og kriterier", "Før timen", "Gjennomføring", "Tilpasset opplæring", "Vurdering underveis", "Observatørene kan se etter", "Refleksjon etter timen"],
  },
];

/** The prompt texts, so the editor can tell an untouched prompt from typed text. */
export const TEMPLATE_PROMPTS = new Set<string>(
  (function collect(n: J): string[] {
    const own = n.type === "text" && typeof n.style === "string" && n.style.includes(GUIDANCE_COLOR) ? [n.text as string] : [];
    return own.concat(((n.children as J[]) ?? []).flatMap(collect));
  })({ children: TEMPLATES.map((x) => JSON.parse(x.doc).root) }),
);

export function seed(): State {
  return {
    users: USERS,
    group: {
      id: "g-3b",
      name: "Praksis 3B",
      school: "Tromsdalen skole",
      memberIds: ["u-ingrid", "u-kari", "u-jonas", "u-amina"],
    },
    plans: [],
  };
}
