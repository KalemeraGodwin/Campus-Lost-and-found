import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Building2, CheckCircle2, Clock, PackageCheck } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { extractFriendlyError, subscribePublicNotices } from '../services/api';
import { CATEGORIES, PublicNotice } from '../types';
import { getEffectiveNoticeStatus } from '../utils/cryptoAndValidation';

export function SummaryPage() {
  const {
    account,
    institutions,
    activeInstitutionId,
    activeInstitution,
    setGuestInstitutionId,
  } = useAccount();

  const [notices, setNotices] = useState<PublicNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeInstitutionId) {
      setNotices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribePublicNotices(
      activeInstitutionId,
      (data) => {
        setNotices(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(extractFriendlyError(err));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [activeInstitutionId]);

  const stats = useMemo(() => {
    let total = 0;
    let returned = 0;
    let open = 0;
    let archived = 0;
    let foundCount = 0;
    let lostCount = 0;

    const byCategory = new Map<
      string,
      { category: string; total: number; returned: number; open: number; archived: number }
    >();
    CATEGORIES.forEach((cat) => {
      byCategory.set(cat, { category: cat, total: 0, returned: 0, open: 0, archived: 0 });
    });

    notices.forEach((n) => {
      const eff = getEffectiveNoticeStatus(n);
      if (eff === 'removed') return;
      total++;
      if (n.type === 'found') foundCount++;
      else lostCount++;

      if (eff === 'returned') returned++;
      else if (eff === 'open') open++;
      else if (eff === 'archived') archived++;

      const bucket = byCategory.get(n.category) || {
        category: n.category,
        total: 0,
        returned: 0,
        open: 0,
        archived: 0,
      };
      bucket.total++;
      if (eff === 'returned') bucket.returned++;
      else if (eff === 'open') bucket.open++;
      else if (eff === 'archived') bucket.archived++;
      byCategory.set(n.category, bucket);
    });

    const recoveryRate = total > 0 ? Math.round((returned / total) * 100) : 0;
    const categoryRows = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);

    return { total, returned, open, archived, foundCount, lostCount, recoveryRate, categoryRows };
  }, [notices]);

  if (account && !account.institutionId) {
    return (
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800/70 p-6 sm:p-8 text-center space-y-4">
        <Building2 className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Select Your Campus Institution
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Choose your institution in your Profile Dashboard to view impact metrics for your campus.
        </p>
        <Link
          to="/account"
          className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500"
        >
          Open Profile Dashboard
        </Link>
      </div>
    );
  }

  if (!activeInstitutionId) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="space-y-1 text-center">
          <Building2 className="w-8 h-8 text-emerald-700 dark:text-emerald-400 mx-auto" />
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Select a Campus Institution
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Summary metrics are separated by campus institution. Select your campus below to view its stats.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {institutions.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={() => setGuestInstitutionId(inst.id)}
              className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-700 dark:hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/40 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{inst.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>{activeInstitution?.name}</span>
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Campus Impact Summary
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Live transparency metrics showing reported, returned, and open items at{' '}
            <strong className="text-slate-900 dark:text-slate-100">{activeInstitution?.name}</strong>.
          </p>
        </div>
        <Link
          to="/"
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center shrink-0"
        >
          Browse Active Items
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-4 py-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Total Reported</span>
                <PackageCheck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="font-display text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.total}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.foundCount} found · {stats.lostCount} lost
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span>Returned</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <p className="font-display text-3xl font-bold text-emerald-800 dark:text-emerald-400 tabular-nums">
                {stats.returned}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.recoveryRate}% recovery rate
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-amber-700 dark:text-amber-400">
                <span>Still Open</span>
                <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              </div>
              <p className="font-display text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.open}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active within 60 days</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Auto-Archived</span>
                <Archive className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="font-display text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.archived}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Older than 60 days</p>
            </div>
          </div>

          {/* Category Breakdown Chart */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Breakdown by Category
              </h2>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-700 dark:bg-emerald-500 inline-block" />
                  Returned
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                  Still Open
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-600 inline-block" />
                  Archived
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {stats.categoryRows.map((row) => {
                const maxVal = Math.max(...stats.categoryRows.map((r) => r.total), 1);
                const retWidth = (row.returned / maxVal) * 100;
                const openWidth = (row.open / maxVal) * 100;
                const archWidth = (row.archived / maxVal) * 100;

                return (
                  <div key={row.category} className="space-y-1.5">
                    <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-0.5 text-xs sm:text-sm">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{row.category}</span>
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {row.total} total ({row.returned} returned · {row.open} open)
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                      {row.returned > 0 && (
                        <div
                          style={{ width: `${retWidth}%` }}
                          className="h-full bg-emerald-700 dark:bg-emerald-500 transition-all duration-300"
                          title={`Returned: ${row.returned}`}
                        />
                      )}
                      {row.open > 0 && (
                        <div
                          style={{ width: `${openWidth}%` }}
                          className="h-full bg-amber-500 transition-all duration-300"
                          title={`Open: ${row.open}`}
                        />
                      )}
                      {row.archived > 0 && (
                        <div
                          style={{ width: `${archWidth}%` }}
                          className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-300"
                          title={`Archived: ${row.archived}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
