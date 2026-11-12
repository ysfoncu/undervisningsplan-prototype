import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtWhen, initials } from "../format";
import { L } from "../labels";
import type { StatusKey } from "../store";
import { useStore } from "../store";
import type { User } from "../types";

export function Avatar({ user, size = 28 }: { user: User; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user.color, fontSize: Math.round(size * 0.4) }}
      title={user.name}
      aria-hidden="true"
    >
      {initials(user.name)}
    </span>
  );
}

export function Person({ user, sub }: { user: User; sub?: ReactNode }) {
  return (
    <span className="person">
      <Avatar user={user} />
      <span>
        <span className="person-name">{user.name}</span>
        <span className={`role-tag role-${user.role}`}>{L.roles[user.role]}</span>
        {sub && <span className="person-sub">{sub}</span>}
      </span>
    </span>
  );
}

const CHIP_TONE: Record<StatusKey, string> = {
  draft: "neutral",
  published: "blue",
  observing: "purple",
  awaitingSummary: "blue",
  summaryReady: "green",
  done: "green-solid",
};

export function StatusChip({ status }: { status: StatusKey }) {
  return <span className={`chip chip-${CHIP_TONE[status]}`}>{L.status[status]}</span>;
}

/** Three-step line: Planlegg → Observer → Fullført. Status only, not clickable. */
export function When({ iso }: { iso: string }) {
  // Re-render once a minute so relative times stay fresh.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  return <time dateTime={iso}>{fmtWhen(iso)}</time>;
}

export function Toast() {
  const { toast } = useStore();
  return (
    <div className="toast-wrap" aria-live="polite">
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export function Confirm({
  title,
  body,
  okLabel,
  onOk,
  onCancel,
}: {
  title: string;
  body: string;
  okLabel: string;
  onOk: () => void;
  onCancel: () => void;
}) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="row end">
          <button className="btn" onClick={onCancel}>
            {L.cancel}
          </button>
          <button ref={okRef} className="btn btn-primary" onClick={onOk}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

// ─── Icons (inline SVG, inherit colour) ─────────────────────────────────────

export function Icon({ name, size = 20 }: { name: "share" | "history" | "close" | "send" | "comment" | "trash" | "edit" | "smile"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "share")
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
        <path d="M19 8v6M16 11h6" />
      </svg>
    );
  if (name === "send")
    return (
      <svg {...common}>
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    );
  if (name === "comment")
    return (
      <svg {...common}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  if (name === "trash")
    return (
      <svg {...common}>
        <path d="M4 7h16" />
        <path d="M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1z" />
        <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    );
  if (name === "smile")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
        <path d="M9 9.5h.01M15 9.5h.01" strokeWidth={2.6} />
      </svg>
    );
  if (name === "edit")
    return (
      <svg {...common}>
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
        <path d="M13.5 6.5l4 4" />
      </svg>
    );
  if (name === "history")
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v4h4" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Close on Escape and return focus to the opener when unmounted. */
function useOverlay(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return ref;
}

/** Centered pop-up, like the Google Docs "Share" dialog. */
export function Dialog({ title, onClose, children, wide = false }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useOverlay(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} className={`modal dialog ${wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Lukk" title="Lukk" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Right-hand overlay, like Google Docs "Version history". */
export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useOverlay(onClose);
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside ref={ref} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Lukk" title="Lukk" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
