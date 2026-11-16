import { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BarChart3, FolderKanban, PlusCircle, Search, ShieldCheck, TicketCheck } from 'lucide-react';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
      isActive
        ? 'text-slate-900 border-emerald-700'
        : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Desktop Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="hidden md:block sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            CampusTrace
          </Link>

          <nav className="flex items-center gap-6" aria-label="Primary navigation">
            <NavLink to="/" end className={navLinkClass}>
              Browse
            </NavLink>
            <NavLink to="/my-notices" className={navLinkClass}>
              My Notices
            </NavLink>
            <NavLink to="/track-claim" className={navLinkClass}>
              Track Claim
            </NavLink>
            <NavLink to="/summary" className={navLinkClass}>
              Summary
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              Safety
            </NavLink>
          </nav>

          <div className="shrink-0">
            <Link
              to="/report"
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
            >
              Report Item
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Compact Top App Bar (<= 48px) */}
      <header className="md:hidden sticky top-0 z-30 h-12 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          CampusTrace
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/summary"
            className={`min-h-[40px] px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg whitespace-nowrap ${
              location.pathname === '/summary'
                ? 'text-emerald-700 bg-emerald-50'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Summary</span>
          </Link>
          <Link
            to="/about"
            className={`min-h-[40px] px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg whitespace-nowrap ${
              location.pathname === '/about'
                ? 'text-emerald-700 bg-emerald-50'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Safety</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:py-8">
        {children}
      </main>

      {/* Desktop & Mobile Quiet Footer */}
      <footer className="hidden md:block border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <p>CampusTrace · Ownership verified before contact</p>
          <div className="flex items-center gap-6">
            <Link to="/about" className="hover:text-slate-900 transition-colors">
              Verification &amp; Safety
            </Link>
            <Link to="/summary" className="hover:text-slate-900 transition-colors">
              Campus Summary
            </Link>
            <Link to="/admin" className="hover:text-slate-900 transition-colors">
              Admin Console
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Navigation Bar (4 Tabs, Thumb Zone, <= 64px) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        aria-label="Mobile bottom navigation"
      >
        <div className="grid grid-cols-4 h-15">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700' : 'text-slate-600'
              }`
            }
          >
            <Search className="w-5 h-5" />
            <span>Browse</span>
          </NavLink>
          <NavLink
            to="/report"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700' : 'text-slate-600'
              }`
            }
          >
            <PlusCircle className="w-5 h-5" />
            <span>Report</span>
          </NavLink>
          <NavLink
            to="/my-notices"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700' : 'text-slate-600'
              }`
            }
          >
            <FolderKanban className="w-5 h-5" />
            <span>My Notices</span>
          </NavLink>
          <NavLink
            to="/track-claim"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700' : 'text-slate-600'
              }`
            }
          >
            <TicketCheck className="w-5 h-5" />
            <span>Track</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
