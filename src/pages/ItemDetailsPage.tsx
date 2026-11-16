import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, Flag, Lock, MapPin, ShieldCheck, User } from 'lucide-react';
import { NoticeImage } from '../components/NoticeImage';
import { ReportAbuseModal } from '../components/ReportAbuseModal';
import { NoticeStatusIndicator } from '../components/StatusText';
import { useAccount } from '../context/AccountContext';
import { extractFriendlyError, getNoticeById } from '../services/firebase';
import { PublicNotice } from '../types';
import { formatShortDate, getEffectiveNoticeStatus } from '../utils/cryptoAndValidation';

export function ItemDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useAccount();
  const [notice, setNotice] = useState<PublicNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    getNoticeById(id)
      .then((res) => {
        if (!active) return;
        setNotice(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(extractFriendlyError(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="aspect-16/9 bg-slate-200 rounded-2xl" />
        <div className="h-8 w-2/3 bg-slate-200 rounded" />
      </div>
    );
  }

  if (error || !notice) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-slate-900">Notice Unavailable</h1>
        <p className="text-sm text-slate-600">
          {error || 'This notice could not be found or may have been removed.'}
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          Back to Browse
        </Link>
      </div>
    );
  }

  if (account && account.institutionId && notice.institutionId !== account.institutionId) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-4">
        <Building2 className="w-10 h-10 text-amber-600 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-900">
          Different Campus Institution
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          This notice is attached to <strong>{notice.institutionName}</strong>. Your account is registered under{' '}
          <strong>{account.institutionName}</strong>, so you only see information for your campus.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          Return to {account.institutionName}
        </Link>
      </div>
    );
  }

  const effectiveStatus = getEffectiveNoticeStatus(notice);
  const isOpen = effectiveStatus === 'open';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Browse</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Photo Gallery */}
        <div className="lg:col-span-7 space-y-3">
          <div className="aspect-4/3 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
            <NoticeImage
              src={notice.photos[activePhotoIndex]}
              alt={notice.title}
              className="w-full h-full object-cover"
            />
          </div>
          {notice.photos.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {notice.photos.map((url, idx) => (
                <button
                  key={url + idx}
                  type="button"
                  onClick={() => setActivePhotoIndex(idx)}
                  className={`w-20 aspect-4/3 rounded-xl overflow-hidden border-2 shrink-0 transition-colors ${
                    idx === activePhotoIndex ? 'border-emerald-700' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <NoticeImage src={url} alt={`${notice.title} view ${idx + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notice Details & Action Panel */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <span className={notice.type === 'found' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {notice.type === 'found' ? 'Found Item' : 'Lost Item'}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-slate-600">{notice.category}</span>
              </div>
              <NoticeStatusIndicator status={effectiveStatus} />
            </div>

            <h1 className="font-display text-2xl font-bold text-slate-900 leading-snug">
              {notice.title}
            </h1>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed">{notice.publicDescription}</p>

          <div className="space-y-2.5 pt-3 border-t border-slate-100 text-sm text-slate-600">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="font-medium text-slate-800">{notice.institutionName}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{notice.location}</span>
            </div>
            <div className="flex items-center gap-2.5 tabular-nums">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {notice.type === 'found' ? 'Found on' : 'Lost on'} {formatShortDate(notice.itemDate)}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Reported by {notice.reporterFirstName}</span>
            </div>
          </div>

          {/* Verification Questions Preview (Prompts Only) */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Lock className="w-3.5 h-3.5 text-emerald-700" />
              <span>Ownership Verification Required ({notice.verificationPrompts.length})</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              To protect against false claims, you will answer {notice.verificationPrompts.length} private question
              {notice.verificationPrompts.length > 1 ? 's' : ''} and upload supporting evidence before contact is shared.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2.5 pt-1">
            {isOpen ? (
              <Link
                to={`/item/${notice.id}/claim`}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 flex items-center justify-center transition-colors"
              >
                {notice.type === 'found' ? 'This is mine' : 'I have this'}
              </Link>
            ) : (
              <div className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-medium text-slate-600 text-center">
                This notice is closed ({effectiveStatus}) and no longer accepting new claims.
              </div>
            )}

            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report Notice</span>
            </button>
          </div>

          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>WhatsApp contact stays hidden until the reporter approves your claim.</span>
          </p>
        </div>
      </div>

      <ReportAbuseModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="notice"
        targetId={notice.id}
        targetLabel={notice.title}
      />
    </div>
  );
}
