import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BellRing,
  FolderKanban,
  Menu,
  Moon,
  PlusCircle,
  Search,
  Shield,
  ShieldCheck,
  Sun,
  TicketCheck,
  UserCircle2,
  X,
} from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { useTheme } from '../context/ThemeContext';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { account, unreadCount, activeToast, dismissToast, markAsRead } = useAccount();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile dropdown automatically on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 inline-flex items-center gap-1.5 ${
      isActive
        ? 'text-slate-900 dark:text-slate-100 border-emerald-700 dark:border-emerald-400'
        : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
    }`;

  const dropdownItemClass = ({ isActive }: { isActive: boolean }) =>
    `min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between gap-3 transition-colors ${
      isActive
        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
    }`;

  const toastTargetRoute =
    activeToast && (activeToast.kind === 'new_claim' || activeToast.kind === 'claim_resubmitted')
      ? '/my-notices'
      : '/track-claim';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden transition-colors duration-200">
      {/* Desktop Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="hidden md:block sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-5 lg:px-6 h-16 flex items-center justify-between gap-4 lg:gap-8">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            CampusTrace
          </Link>

          <nav className="flex items-center gap-5 lg:gap-6" aria-label="Primary navigation">
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
            <NavLink to="/account" className={navLinkClass}>
              <span>{account ? account.name.split(' ')[0] : 'Account'}</span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  <BellRing className="w-3.5 h-3.5" />
                  {unreadCount}
                </span>
              )}
            </NavLink>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="hidden lg:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-600 shrink-0" />
                  <span className="hidden lg:inline">Dark</span>
                </>
              )}
            </button>
            <Link
              to="/report"
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
            >
              Report Item
            </Link>
          </div>
        </div>
      </header>

      {/* Small-Screen Sticky Navbar with Dropdown Menu (< md) */}
      <header className="md:hidden sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            CampusTrace
          </Link>

          <div className="flex items-center gap-1.5">
            <Link
              to="/account"
              aria-label={
                unreadCount > 0
                  ? `${unreadCount} unread notifications`
                  : account
                  ? `Account: ${account.name}`
                  : 'Follow-up account and alerts'
              }
              className={`min-h-[40px] px-2.5 rounded-xl inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                unreadCount > 0
                  ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              {unreadCount > 0 ? (
                <span className="tabular-nums">{unreadCount}</span>
              ) : account ? (
                <span className="max-w-[84px] truncate">{account.name.split(' ')[0]}</span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center justify-center transition-colors shrink-0"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-dropdown"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>{mobileMenuOpen ? 'Close' : 'Menu'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <nav
            id="mobile-nav-dropdown"
            aria-label="Mobile navigation menu"
            className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-lg px-4 py-3 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto z-50"
          >
            <NavLink to="/" end className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5">
                <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Browse Items</span>
              </span>
            </NavLink>

            <NavLink to="/my-notices" className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5">
                <FolderKanban className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>My Notices</span>
              </span>
            </NavLink>

            <NavLink to="/track-claim" className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5">
                <TicketCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Track Claim</span>
              </span>
            </NavLink>

            <NavLink to="/account" className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <UserCircle2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="truncate">
                  {account ? `${account.name} · Alerts` : 'Account & Alerts'}
                </span>
              </span>
              {unreadCount > 0 && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                  {unreadCount} new
                </span>
              )}
            </NavLink>

            <NavLink to="/summary" className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Campus Summary</span>
              </span>
            </NavLink>

            <NavLink to="/about" className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Verification &amp; Safety</span>
              </span>
            </NavLink>

            <NavLink to="/admin" className={dropdownItemClass}>
              <span className="inline-flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Admin Console</span>
              </span>
            </NavLink>

            <button
              type="button"
              onClick={toggleTheme}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between gap-3 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              <span className="inline-flex items-center gap-2.5">
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-500" />
                )}
                <span>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isDark ? 'Dark' : 'Light'}
              </span>
            </button>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <Link
                to="/report"
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 flex items-center justify-center gap-2 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Report Found or Lost Item</span>
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* Backdrop to dismiss mobile dropdown on outside tap */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 top-14 z-30 bg-slate-950/25 dark:bg-black/50 backdrop-blur-[1px]"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Real-time Live Notification Toast */}
      {activeToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 md:top-20 left-3 right-3 sm:left-auto sm:right-5 sm:w-96 z-50 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 shadow-lg rounded-2xl p-4 flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              {activeToast.title}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
              {activeToast.message}
            </p>
            <div className="pt-1 flex items-center gap-3">
              <Link
                to={toastTargetRoute}
                onClick={() => {
                  markAsRead(activeToast.id);
                  dismissToast();
                }}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 underline underline-offset-2"
              >
                {activeToast.kind === 'new_claim' || activeToast.kind === 'claim_resubmitted'
                  ? 'Review Claim'
                  : 'View Status'}
              </Link>
              <button
                type="button"
                onClick={dismissToast}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Close notification"
            className="min-h-[32px] min-w-[32px] -mt-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full min-w-0 max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 md:py-8">
        {children}
      </main>

      {/* Responsive Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>CampusTrace · Ownership verified before contact</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              to="/account"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              Follow-Up Account
            </Link>
            <Link
              to="/about"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              Verification &amp; Safety
            </Link>
            <Link
              to="/summary"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              Campus Summary
            </Link>
            <Link
              to="/admin"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              Admin Console
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
