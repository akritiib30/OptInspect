import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Boxes, ChevronsLeft, ChevronsRight, ClipboardCheck, FlaskConical, History, KeyRound, LayoutDashboard, LifeBuoy, LogOut, Menu, Moon, ScanLine, Search, Settings, ShieldCheck, SlidersHorizontal, Sun, Swords, Users } from "lucide-react";
import Logo from "../../components/Logo";
import Notifications, { usePopover } from "../../components/Notifications";
import CommandPalette from "../../components/CommandPalette";
import { Avatar, Modal } from "../../components/bits";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { useApi, useHotkeys, useLocalStorage } from "../../lib/hooks";
import { api } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { ROLE_LABEL } from "../../lib/constants";
import "./app.css";
import "./pages.css";
import "./labs.css";

const NAV = [
  { group: "Workspace", items: [
    { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/inspect", label: "Inspect", icon: ScanLine },
    { to: "/app/inspections", label: "Inspections", icon: History },
    { to: "/app/review", label: "Review", icon: ClipboardCheck, badge: true },
  ] },
  { group: "Records", items: [
    { to: "/app/audit", label: "Audit log", icon: ShieldCheck },
    { to: "/app/insights", label: "Insights", icon: Activity },
  ] },
  { group: "Labs", items: [
    { to: "/app/stress", label: "Stress test", icon: FlaskConical },
    { to: "/app/challenge", label: "Challenge", icon: Swords },
    { to: "/app/lab", label: "Tolerance lab", icon: SlidersHorizontal },
  ] },
  { group: "Setup", items: [
    { to: "/app/products", label: "Products", icon: Boxes },
    { to: "/app/team", label: "Team", icon: Users, admin: true },
    { to: "/app/settings", label: "Settings", icon: Settings },
    { to: "/app/help", label: "Help", icon: LifeBuoy },
  ] },
];

const TITLES = [
  [/^\/app\/inspections\/.+/, "Inspection"], [/^\/app\/inspections/, "Inspections"], [/^\/app\/inspect/, "Inspect"],
  [/^\/app\/review/, "Review"], [/^\/app\/audit/, "Audit log"], [/^\/app\/insights/, "Insights"],
  [/^\/app\/stress/, "Stress test"], [/^\/app\/challenge/, "Challenge"], [/^\/app\/lab/, "Tolerance lab"],
  [/^\/app\/products/, "Products"], [/^\/app\/team/, "Team"], [/^\/app\/settings/, "Settings"], [/^\/app\/help/, "Help"], [/^\/app\/dashboard/, "Dashboard"],
];

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="user-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu">
        <Avatar name={user.name} size={36} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="pop" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <div className="pop-user"><Avatar name={user.name} size={42} /><div><b>{user.name}</b><small>{user.email}</small><span className="chip">{ROLE_LABEL[user.role]}</span></div></div>
            <button className="pop-row" onClick={() => { setOpen(false); navigate("/app/settings"); }}><Settings size={17} /> Settings</button>
            <button className="pop-row" onClick={() => { setOpen(false); navigate("/app/settings?tab=security"); }}><KeyRound size={17} /> Change password</button>
            <button className="pop-row danger" onClick={() => { setOpen(false); signOut(); }}><LogOut size={17} /> Sign out</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// A temporary password must be replaced before anything else can be done.
function ForcePassword() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api("/api/auth/password", { method: "POST", body: { current, new: next } });
      setUser(r.user);
      toast.ok("Password changed", "You are all set.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Choose a new password" onClose={() => {}} dismissible={false} width={460}>
      <form className="auth-form" onSubmit={submit}>
        <p className="muted">{user.name}, you are signed in with a temporary password. Choose your own before you continue.</p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <label className="field"><span className="label">Temporary password</span><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span className="label">New password</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" /></label>
        <button className="btn btn-primary btn-block" disabled={busy || !current || next.length < 8}>Save new password</button>
      </form>
    </Modal>
  );
}

export default function AppLayout() {
  const { user, can } = useAuth();
  const { effective, toggle } = useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const [collapsed, setCollapsed] = useLocalStorage("opti-sidebar", false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const { data: stats } = useApi("/api/stats", { interval: 6000 });
  const { data: activity } = useApi("/api/activity?limit=10", { interval: 6000 });
  const waiting = stats?.awaiting_review || 0;
  const title = (TITLES.find(([re]) => re.test(location.pathname)) || [0, "OptiInspect"])[1];

  useHotkeys({ "ctrl+k": () => setPalette((p) => !p), "/": () => setPalette(true) }, { allowInInputs: false });
  useEffect(() => { setDrawer(false); document.title = `${title} - OptiInspect`; }, [location.pathname, title]);

  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <div className="app-glow" aria-hidden="true" />
      {drawer ? <div className="drawer-scrim" onClick={() => setDrawer(false)} /> : null}
      <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Main">
        <div className="sb-top"><Logo to="/app/dashboard" size={32} text={!collapsed || drawer} /></div>
        <nav className="sb-nav">
          {NAV.map((g) => (
            <div key={g.group} className="sb-group">
              <span className="sb-label">{g.group}</span>
              {g.items.filter((i) => !i.admin || can.admin).map((i) => {
                const Icon = i.icon;
                return (
                  <NavLink key={i.to} to={i.to} className="nav-item" title={collapsed ? i.label : undefined}>
                    {({ isActive }) => (
                      <>
                        {isActive ? <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
                        <Icon size={19} /><span className="nav-label">{i.label}</span>
                        {i.badge && waiting > 0 ? <span className="nav-count">{waiting}</span> : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <div className="sb-user"><Avatar name={user.name} size={36} /><div className="user-meta"><b>{user.name}</b><small>{ROLE_LABEL[user.role]}</small></div></div>
          <button className="btn btn-quiet btn-icon btn-sm collapse-btn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-quiet btn-icon menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={20} /></button>
          <h1 className="top-title">{title}</h1>
          <button className="search-pill" onClick={() => setPalette(true)} aria-label="Search or jump to"><Search size={16} /><span>Search or jump to</span><span className="kbd">Ctrl K</span></button>
          <div className="spacer" />
          <span className="live-pill" title="The inspection engine is running on this computer"><i className="dot-live" /> Engine ready</span>
          <Notifications waiting={waiting} activity={activity || []} />
          <button className="btn btn-quiet btn-icon" onClick={toggle} aria-label={`Switch to ${effective === "dark" ? "light" : "dark"} theme`}>{effective === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>
          <UserMenu />
        </header>
        <main className="content" id="content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {user.must_change_password ? <ForcePassword /> : null}
    </div>
  );
}
