import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Landmark, FileText, ArrowRightLeft, ClipboardCheck, Boxes, UserRound, LogOut, Menu, X, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../components/registry/BrandMark.jsx';
import ThemeToggle from '../components/ui/ThemeToggle.jsx';
import { useDocumentTitle } from '../hooks/index.js';

const NAV = {
  citizen: [
    { to: '/citizen', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/citizen/properties', label: 'Properties', icon: Landmark },
    { to: '/citizen/documents', label: 'Documents', icon: FileText },
    { to: '/citizen/transfers', label: 'Transfers', icon: ArrowRightLeft },
    { to: '/citizen/blockchain', label: 'Ledger records', icon: Boxes },
    { to: '/citizen/profile', label: 'Profile', icon: UserRound },
  ],
  registrar: [
    { to: '/registrar', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/registrar/properties', label: 'Properties', icon: Landmark },
    { to: '/registrar/documents', label: 'Documents', icon: FileText },
    { to: '/registrar/transfers', label: 'Transfers', icon: ArrowRightLeft },
    { to: '/registrar/review', label: 'Review queue', icon: ClipboardCheck },
    { to: '/registrar/ledger', label: 'Ledger', icon: Boxes },
    { to: '/registrar/audit', label: 'Audit log', icon: FileText },
    { to: '/registrar/profile', label: 'Profile', icon: UserRound },
  ],
  surveyor: [
    { to: '/surveyor', label: 'Field survey queue', icon: ClipboardCheck, end: true },
    { to: '/surveyor/profile', label: 'Profile', icon: UserRound },
  ],
  clerk: [
    { to: '/clerk', label: 'Verification desk', icon: ClipboardCheck, end: true },
    { to: '/clerk/profile', label: 'Profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Oversight board', icon: LayoutGrid, end: true },
    { to: '/admin/audit', label: 'Audit log', icon: FileText },
    { to: '/admin/profile', label: 'Profile', icon: UserRound },
  ],
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chain, setChain] = useState({ loading: true, ok: true });

  const links = NAV[user?.role] || NAV.citizen;
  useDocumentTitle(user?.role === 'registrar' ? 'Registry Operations' : 'Registry');

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    fetch('/health')
      .then((r) => r.json())
      .then((h) => {
        if (alive) setChain({ loading: false, ok: h.blockchain === 'connected' });
      })
      .catch(() => {
        if (alive) setChain({ loading: false, ok: false });
      });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  function handleSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  const initials = (user?.fullName || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const sidebarInner = (
    <div className="flex flex-col h-full">
      <div className="px-5 h-[72px] flex items-center border-b border-sidebar-border">
        <div>
          <p className="font-display font-bold tracking-[0.04em] text-[15px] leading-none">LAND LEDGER</p>
          <p className="text-[8.5px] font-bold tracking-[0.24em] text-muted-foreground mt-1.5">REGISTRY OPERATIONS</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1" aria-label="Dashboard">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <l.icon />
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[13.5px] font-bold truncate">{user?.fullName}</p>
        <p className="text-[11px] muted tracking-wide">{user?.role}</p>
        <button onClick={handleSignOut} className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold hover:text-primary transition-colors">
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background site-noise">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[248px] bg-sidebar border-r border-sidebar-border flex-col z-30">{sidebarInner}</aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[rgb(15_20_30/0.5)] overlay-in" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[270px] bg-sidebar border-r border-sidebar-border flex flex-col shadow-raised fade-up">
            <button className="absolute top-4 right-3 tr-muted" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            {sidebarInner}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px] flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-[72px] border-b border-border bg-background/90 backdrop-blur">
          <div className="h-full px-4 sm:px-7 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="lg:hidden btn-ghost !p-2 -ml-2" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
                <Menu size={20} />
              </button>
              {chain.loading ? (
                <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground" title="Checking registry status">
                  <Loader2 size={13} className="animate-spin" />
                  <span className="hidden min-[440px]:inline">Checking registry…</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground"
                  title={chain.ok ? 'Registry synchronized' : 'Blockchain unavailable'}
                >
                  <span className={`status-dot ${chain.ok ? 'ok' : 'bad'}`} />
                  <span className="min-[440px]:hidden">{chain.ok ? 'Synced' : 'Offline'}</span>
                  <span className="hidden min-[440px]:inline">{chain.ok ? 'Registry synchronized' : 'Blockchain unavailable'}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-none">
              <ThemeToggle />
              <div className="text-right min-w-0 hidden min-[360px]:block max-w-[110px] sm:max-w-none">
                <p className="text-[13.5px] font-bold leading-tight truncate">{user?.fullName}</p>
                <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{user?.role}</p>
              </div>
              <span className="inline-grid place-items-center w-10 h-10 rounded border border-primary/50 text-primary text-[12px] font-bold bg-primary/5 flex-none">
                {initials}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-7 py-6 sm:py-8 w-full max-w-[1200px] mx-auto">
          <Outlet />
        </main>

        <footer className="border-t border-border px-4 sm:px-7 py-4">
          <p className="text-[11.5px] text-muted-foreground">Land Ledger — accountable property registry operations.</p>
        </footer>
      </div>
    </div>
  );
}
