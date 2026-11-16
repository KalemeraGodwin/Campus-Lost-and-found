import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, PlusCircle, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { NoticeImage } from '../components/NoticeImage';
import {
  extractFriendlyError,
  seedCampusNoticesIfEmpty,
  subscribePublicNotices,
} from '../services/firebase';
import { CATEGORIES, NoticeType, PublicNotice } from '../types';
import { formatShortDate, getEffectiveNoticeStatus, isOlderThanDays } from '../utils/cryptoAndValidation';

export function HomePage() {
  const [notices, setNotices] = useState<PublicNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | NoticeType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [exactDate, setExactDate] = useState<string>('');

  useEffect(() => {
    seedCampusNoticesIfEmpty();
    const unsub = subscribePublicNotices(
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
  }, []);

  const openNotices = useMemo(() => {
    return notices.filter((n) => getEffectiveNoticeStatus(n) === 'open');
  }, [notices]);

  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    openNotices.forEach((n) => {
      if (n.location.trim()) set.add(n.location.trim());
    });
    return Array.from(set).sort();
  }, [openNotices]);

  const filteredNotices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return openNotices.filter((n) => {
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
      if (locationFilter !== 'all' && n.location !== locationFilter) return false;

      if (exactDate) {
        if (n.itemDate !== exactDate) return false;
      } else if (dateFilter === '7d') {
        if (isOlderThanDays(n.itemDate || n.createdAt, 7)) return false;
      } else if (dateFilter === '30d') {
        if (isOlderThanDays(n.itemDate || n.createdAt, 30)) return false;
      }

      if (q) {
        const hay = `${n.title} ${n.publicDescription} ${n.location} ${n.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [openNotices, searchQuery, typeFilter, categoryFilter, locationFilter, dateFilter, exactDate]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    typeFilter !== 'all' ||
    categoryFilter !== 'all' ||
    locationFilter !== 'all' ||
    dateFilter !== 'all' ||
    exactDate !== '';

  function clearFilters() {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setLocationFilter('all');
    setDateFilter('all');
    setExactDate('');
  }

  return (
    <div className="space-y-6">
      {/* Focused Editorial Hero */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Ownership verified before WhatsApp contact is shared</span>
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Campus Lost &amp; Found Board
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Browse active items reported across campus. Claimants verify ownership with private questions and evidence before any phone number is revealed.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/report"
            className="w-full md:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Report Found or Lost</span>
          </Link>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section aria-label="Search and filters" className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items by title, details, or campus building..."
              aria-label="Search lost and found items"
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {/* Interactive Type Segmented Control */}
          <div
            className="grid grid-cols-3 p-1 bg-slate-100 rounded-xl shrink-0 w-full md:w-64"
            role="group"
            aria-label="Filter by notice type"
          >
            {(['all', 'found', 'lost'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`min-h-[36px] px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                  typeFilter === t
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t === 'all' ? 'All Items' : t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="min-w-0">
            <label htmlFor="filter-category" className="sr-only">
              Category
            </label>
            <select
              id="filter-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="filter-location" className="sr-only">
              Location
            </label>
            <select
              id="filter-location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <option value="all">All Locations</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="filter-date-range" className="sr-only">
              Date range
            </label>
            <select
              id="filter-date-range"
              value={exactDate ? 'exact' : dateFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'exact') return;
                setExactDate('');
                setDateFilter(val);
              }}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <option value="all">Any Date</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              {exactDate && <option value="exact">{exactDate}</option>}
            </select>
          </div>

          <div className="min-w-0">
            <input
              type="date"
              aria-label="Filter by exact date"
              value={exactDate}
              onChange={(e) => setExactDate(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span className="tabular-nums">
            Showing {filteredNotices.length} active {filteredNotices.length === 1 ? 'notice' : 'notices'}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 min-h-[32px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </section>

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse"
            >
              <div className="aspect-4/3 bg-slate-200" />
              <div className="p-4 space-y-3">
                <div className="h-3 w-28 bg-slate-200 rounded" />
                <div className="h-5 w-4/5 bg-slate-200 rounded" />
                <div className="h-4 w-full bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-slate-900">
            No matching open notices
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Try clearing your filters or post a new lost or found item notice so others on campus can help.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear Filters
              </button>
            )}
            <Link
              to="/report"
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 inline-flex items-center"
            >
              Post a Notice
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredNotices.map((notice) => (
            <Link
              key={notice.id}
              to={`/item/${notice.id}`}
              className="group bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="aspect-4/3 bg-slate-100 overflow-hidden">
                <NoticeImage
                  src={notice.photos[0]}
                  alt={notice.title}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span
                      className={
                        notice.type === 'found' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'
                      }
                    >
                      {notice.type === 'found' ? 'Found Item' : 'Lost Item'}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-600">{notice.category}</span>
                  </div>
                  <h2 className="font-display text-base font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-800 transition-colors">
                    {notice.title}
                  </h2>
                  <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                    {notice.publicDescription}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{notice.location}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
                    <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span>{formatShortDate(notice.itemDate)}</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
