import { Link, Outlet } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../components/registry/BrandMark.jsx';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background site-noise">
      <header className="border-b border-border bg-background/85 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <BrandMark />
          <nav className="flex items-center gap-1.5 sm:gap-5 flex-none" aria-label="Main">
            <Link to="/login" className="text-[13px] sm:text-[13.5px] font-semibold px-1.5 sm:px-2 py-2 hover:text-primary transition-colors whitespace-nowrap">
              Sign in
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm sm:btn">
              Create account <ArrowRight size={15} className="hidden min-[420px]:inline" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-background/80">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] muted">Land Ledger — accountable property registry operations.</p>
          <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[rgb(var(--ll-accent-foreground))]">
            <ShieldCheck size={14} className="text-[rgb(var(--ll-accent))]" /> Secure by design
          </p>
        </div>
      </footer>
    </div>
  );
}
