import { useEffect, useRef, useState } from "react";
import { L } from "./labels";
import { StoreProvider, useStore } from "./store";
import { Avatar, Toast } from "./components/ui";
import { Home } from "./views/Home";
import { PlanView } from "./views/PlanView";

function readHash(): string | null {
  const m = window.location.hash.match(/^#\/plan\/(.+)$/);
  return m ? m[1] : null;
}

function Shell() {
  const { state, me, setMe, reset } = useStore();
  const [planId, setPlanId] = useState<string | null>(readHash);

  useEffect(() => {
    const onHash = () => setPlanId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Sticky children (editor toolbar, comments panel) sit below the sticky top bar.
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const open = (id: string) => {
    window.location.hash = `/plan/${id}`;
    window.scrollTo(0, 0);
  };
  const home = () => {
    window.location.hash = "";
  };

  const demoUsers = state.users.filter((u) => ["u-ingrid", "u-jonas", "u-kari", "u-amina"].includes(u.id));

  return (
    <>
      <header className="topbar" ref={barRef}>
        <button className="brand" onClick={home}>
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          MOSO InPraxis <span className="brand-sub">· {L.appName}</span>
          <span className="proto-tag">{L.appTag}</span>
        </button>
        <div className="topbar-right">
          <span className="muted small hide-sm">{L.viewAs}</span>
          <div className="role-switch" role="radiogroup" aria-label={L.viewAs}>
            {demoUsers.map((u) => (
              <button key={u.id} role="radio" aria-checked={me.id === u.id} className={`role-btn ${me.id === u.id ? "on" : ""}`} onClick={() => setMe(u.id)} title={u.name}>
                <Avatar user={u} size={22} />
                <span className="hide-sm">
                  {u.name.split(" ")[0]} <span className="muted">· {L.roles[u.role]}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            className="btn btn-subtle small"
            aria-label={L.resetDemo}
            title={L.resetDemo}
            onClick={() => {
              reset();
              home();
            }}
          >
            ↺ <span className="hide-sm">{L.resetDemo}</span>
          </button>
        </div>
      </header>
      <main>{planId ? <PlanView key={`${planId}-${me.id}`} planId={planId} back={home} /> : <Home open={open} />}</main>
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
