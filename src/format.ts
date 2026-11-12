const dayFmt = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "short" });

/** "10. nov. kl. 13.18" — the format the current comment list already uses. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dayFmt.format(d)} kl. ${timeFmt.format(d).replace(":", ".")}`;
}

/** Relative wording for recent events, falling back to the full date. */
export function fmtWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin >= 0 && diffMin < 1) return "nå nettopp";
  if (diffMin >= 0 && diffMin < 60) return `for ${diffMin} min siden`;
  return fmtDateTime(iso);
}

/** "tirsdag 10. nov. kl. 08.30" for a plan date + start time. */
export function fmtLesson(date: string, time: string): string {
  if (!date) return "";
  const d = new Date(`${date}T${time || "00:00"}`);
  const day = weekdayFmt.format(d);
  return time ? `${day} kl. ${time.replace(":", ".")}` : day;
}

export function fmtOffset(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const nowIso = () => new Date().toISOString();
