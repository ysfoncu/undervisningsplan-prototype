import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { L } from "../labels";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" → [h, m], or null if not a valid time. */
function parse(v: string): [number, number] | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
}

/**
 * Time input with a two-column picker (hours, minutes in 5-minute steps),
 * "Nå" and "Ok", instead of the browser's own time control. The field also
 * accepts typed times such as 8:15 or 08.15. Value is "HH:MM" or "".
 */
export function TimeField({
  id,
  value,
  onChange,
  autoFocus,
  label,
  onKeyDown,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  label: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [draft, setDraft] = useState<[number, number] | null>(parse(value));
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  const place = () => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const height = 300;
    const below = r.bottom + 4 + height < window.innerHeight;
    setPos({ left: r.left, top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - height) });
  };

  const show = () => {
    setDraft(parse(text) ?? parse(value));
    place();
    setOpen(true);
  };
  const commit = (t: [number, number] | null) => {
    if (t) {
      const v = `${pad(t[0])}:${pad(t[1])}`;
      setText(v);
      onChange(v);
    }
    setOpen(false);
  };

  // Keep the picker next to the field, and close it on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !input.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Scroll the chosen hour and minute to the middle of their columns.
  useLayoutEffect(() => {
    if (!open) return;
    pop.current?.querySelectorAll<HTMLElement>(".tp-col").forEach((col) => {
      const on = col.querySelector<HTMLElement>(".is-on") ?? col.querySelector<HTMLElement>("[data-default]");
      if (on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.clientHeight / 2;
    });
  }, [open]);

  const pick = (t: [number, number]) => {
    setDraft(t);
    setText(`${pad(t[0])}:${pad(t[1])}`);
  };
  const h = draft?.[0];
  const m = draft?.[1];

  return (
    <span className="tp">
      <input
        ref={input}
        id={id}
        className="tp-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="tt:mm"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        autoFocus={autoFocus}
        value={text}
        onFocus={show}
        onClick={() => !open && show()}
        onChange={(e) => {
          setText(e.target.value);
          const t = parse(e.target.value);
          if (t) setDraft(t);
        }}
        onBlur={() => {
          // Accept a typed time; otherwise go back to the saved value.
          const t = parse(text);
          if (t) {
            const v = `${pad(t[0])}:${pad(t[1])}`;
            setText(v);
            if (v !== value) onChange(v);
          } else if (text.trim() === "") {
            if (value) onChange("");
          } else setText(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
            return;
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            commit(parse(text) ?? draft);
            return;
          }
          if (e.key === "ArrowDown" && !open) show();
          onKeyDown?.(e);
        }}
      />
      {open && pos && (
        <div
          ref={pop}
          className="tp-pop"
          role="dialog"
          aria-label={label}
          style={{ left: pos.left, top: pos.top }}
          // Keep focus in the input so editors that save on blur stay open.
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="tp-cols">
            <ul className="tp-col" aria-label={L.tpHours}>
              {HOURS.map((x) => (
                <li key={x}>
                  <button type="button" tabIndex={-1} className={x === h ? "is-on" : ""} data-default={x === 8 || undefined} onClick={() => pick([x, m ?? 0])}>
                    {pad(x)}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="tp-col" aria-label={L.tpMinutes}>
              {MINUTES.map((x) => (
                <li key={x}>
                  <button type="button" tabIndex={-1} className={x === m ? "is-on" : ""} data-default={x === 0 || undefined} onClick={() => pick([h ?? 8, x])}>
                    {pad(x)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="tp-foot">
            <button
              type="button"
              tabIndex={-1}
              className="tp-now"
              onClick={() => {
                const d = new Date();
                const r = Math.round(d.getMinutes() / 5) * 5;
                const t: [number, number] = r === 60 ? [(d.getHours() + 1) % 24, 0] : [d.getHours(), r];
                pick(t);
              }}
            >
              {L.tpNow}
            </button>
            <button type="button" tabIndex={-1} className="btn btn-primary btn-sm" disabled={!draft} onClick={() => commit(draft)}>
              {L.tpOk}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
