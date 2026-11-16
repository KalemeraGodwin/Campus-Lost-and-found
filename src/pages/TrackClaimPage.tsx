import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BellRing,
  Clock,
  FileText,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { ClaimStatusIndicator } from '../components/StatusText';
import { useAccount } from '../context/AccountContext';
import {
  TrackedClaimBundle,
  extractFriendlyError,
  resubmitRejectedClaim,
  trackClaimByCode,
} from '../services/firebase';
import { LocalTrackedClaim } from '../types';
import { buildWhatsAppUrl, formatShortDate, formatUgPhoneDisplay } from '../utils/cryptoAndValidation';
import { getSavedTrackedClaims } from '../utils/localStorageStore';

export function TrackClaimPage() {
  const { account, notifications, syncVault, markAsRead } = useAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedClaims, setSavedClaims] = useState<LocalTrackedClaim[]>([]);
  const [claimCode, setClaimCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<TrackedClaimBundle | null>(null);
  const [searchedOnce, setSearchedOnce] = useState(false);

  // Resubmit form state
  const [showResubmit, setShowResubmit] = useState(false);
  const [resubmitAnswers, setResubmitAnswers] = useState<string[]>([]);
  const [newEvidenceFiles, setNewEvidenceFiles] = useState<File[]>([]);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitMessage, setResubmitMessage] = useState<string | null>(null);

  const performLookup = useCallback(async (codeToLookup: string) => {
    const clean = codeToLookup.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setResubmitMessage(null);
    setShowResubmit(false);
    setSearchedOnce(true);

    try {
      const res = await trackClaimByCode(clean);
      setBundle(res);
      if (res) {
        setResubmitAnswers(res.claim.answers.map((a) => a.answer));
      }
    } catch (err) {
      setError(extractFriendlyError(err));
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (account?.accessKey) {
        await syncVault(account.accessKey);
      }
      if (!active) return;
      const localList = getSavedTrackedClaims();
      setSavedClaims(localList);

      const paramCode = searchParams.get('code');
      const initialCode = paramCode || localList[0]?.claimCode || '';
      if (initialCode) {
        setClaimCode(initialCode);
        performLookup(initialCode);
      }
    })();

    return () => {
      active = false;
    };
  }, [searchParams, account?.accessKey, syncVault, performLookup]);

  const unreadClaimAlerts = useMemo(
    () =>
      notifications.filter(
        (n) => !n.read && (n.kind === 'claim_approved' || n.kind === 'claim_rejected')
      ),
    [notifications]
  );

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = claimCode.trim().toUpperCase();
    if (!clean) return;
    setSearchParams({ code: clean });
    performLookup(clean);
  }

  function handleEvidenceSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setNewEvidenceFiles((prev) => [...prev, ...files].slice(0, 5));
  }

  async function handleResubmit(e: FormEvent) {
    e.preventDefault();
    if (!bundle) return;
    setResubmitting(true);
    setError(null);
    try {
      const updatedAnswers = bundle.claim.answers.map((a, idx) => ({
        question: a.question,
        answer: resubmitAnswers[idx] || a.answer,
      }));
      await resubmitRejectedClaim({
        claimId: bundle.claim.id,
        answers: updatedAnswers,
        newEvidenceFiles,
        existingEvidenceUrls: bundle.claim.evidenceUrls,
      });
      setNewEvidenceFiles([]);
      setShowResubmit(false);
      setResubmitMessage('Your updated answers and evidence have been resubmitted for review.');
      await performLookup(claimCode);
    } catch (err) {
      setError(extractFriendlyError(err));
    } finally {
      setResubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Track Your Claim
        </h1>
        <p className="text-sm text-slate-600">
          Enter your Claim Code to check review status or unlock WhatsApp contact once approved.
        </p>
      </div>

      {account && unreadClaimAlerts.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <BellRing className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-emerald-900">
                {unreadClaimAlerts[0].title}
              </p>
              <p className="text-xs text-emerald-800">{unreadClaimAlerts[0].message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => Promise.all(unreadClaimAlerts.map((a) => markAsRead(a.id)))}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 shrink-0"
          >
            Mark read
          </button>
        </div>
      )}

      {/* Claim Code Search */}
      <form
        onSubmit={handleSearchSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              placeholder="Enter Claim Code (e.g. CLM-8F4K92)"
              aria-label="Claim code"
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 font-mono text-sm uppercase text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors shrink-0"
          >
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        </div>

        {savedClaims.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-slate-500">Saved on this device:</span>
            {savedClaims.slice(0, 4).map((sc) => (
              <button
                key={sc.claimCode}
                type="button"
                onClick={() => {
                  setClaimCode(sc.claimCode);
                  setSearchParams({ code: sc.claimCode });
                  performLookup(sc.claimCode);
                }}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg font-mono text-xs border transition-colors ${
                  claimCode === sc.claimCode
                    ? 'bg-emerald-50 border-emerald-700 text-emerald-800 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {sc.claimCode}
              </button>
            ))}
          </div>
        )}
      </form>

      {resubmitMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {resubmitMessage}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      ) : searchedOnce && !bundle ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
          <p className="font-display text-lg font-semibold text-slate-900">Claim Code Not Found</p>
          <p className="text-sm text-slate-600">
            Double-check the spelling of your Claim Code (for example, CLM-8F4K92).
          </p>
        </div>
      ) : bundle ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <p className="font-mono text-xs text-slate-500">{claimCode}</p>
              <h2 className="font-display text-xl font-bold text-slate-900">
                {bundle.notice ? bundle.notice.title : 'Campus Item'}
              </h2>
              <p className="text-xs text-slate-500 tabular-nums">
                Submitted by {bundle.claim.claimantName} · {formatShortDate(bundle.claim.createdAt)}
              </p>
            </div>
            <ClaimStatusIndicator status={bundle.claim.status} />
          </div>

          {/* Pending State */}
          {bundle.claim.status === 'pending' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Waiting for Reporter Review</span>
              </div>
              <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                The reporter is reviewing your verification answers and evidence. Check back on this page soon—WhatsApp contact unlocks automatically once approved.
              </p>
            </div>
          )}

          {/* Rejected State + Resubmit */}
          {bundle.claim.status === 'rejected' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Claim Rejected</span>
                </div>
                <p className="text-xs sm:text-sm text-rose-800 leading-relaxed">
                  Reason: {bundle.claim.rejectionReason || 'Verification details did not match.'}
                </p>
              </div>

              {!showResubmit ? (
                <button
                  type="button"
                  onClick={() => setShowResubmit(true)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Resubmit with More Evidence</span>
                </button>
              ) : (
                <form onSubmit={handleResubmit} className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Update Answers &amp; Add Supporting Evidence
                  </h3>
                  {bundle.claim.answers.map((ans, idx) => (
                    <div key={idx} className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        {idx + 1}. {ans.question}
                      </label>
                      <input
                        type="text"
                        required
                        value={resubmitAnswers[idx] || ''}
                        onChange={(e) => {
                          const next = [...resubmitAnswers];
                          next[idx] = e.target.value;
                          setResubmitAnswers(next);
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                      />
                    </div>
                  ))}

                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-slate-700">
                      Add New Evidence Files (Optional if keeping existing {bundle.claim.evidenceUrls.length} file(s))
                    </span>
                    {newEvidenceFiles.map((f, i) => (
                      <div key={i} className="text-xs text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{f.name}</span>
                      </div>
                    ))}
                    <label className="min-h-[68px] rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center gap-1 p-3 cursor-pointer hover:border-emerald-700">
                      <UploadCloud className="w-5 h-5 text-slate-500" />
                      <span className="text-xs font-medium text-slate-700">Upload Additional Evidence</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={handleEvidenceSelect}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowResubmit(false)}
                      className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resubmitting}
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {resubmitting ? 'Resubmitting...' : 'Submit Updated Claim'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Approved State -> Reveal Reporter WhatsApp + Safe Handover Reminder */}
          {bundle.claim.status === 'approved' && (
            <div className="space-y-4">
              {bundle.handover ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-emerald-800">
                      Ownership Verified — Handover Contact Unlocked
                    </p>
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      {bundle.handover.reporterName}
                    </h3>
                    <p className="font-mono text-base font-semibold text-slate-900 select-all">
                      {formatUgPhoneDisplay(bundle.handover.reporterWhatsApp)}
                    </p>
                  </div>

                  <a
                    href={buildWhatsAppUrl(
                      bundle.handover.reporterWhatsApp,
                      `Hello ${bundle.handover.reporterName}, my CampusTrace claim (${claimCode}) for "${
                        bundle.notice?.title || 'the item'
                      }" was approved. Can we arrange a safe handover at the Campus Security Office or Main Library Desk?`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>Chat on WhatsApp</span>
                  </a>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Your claim is approved. Handover contact details are syncing—please refresh in a moment.
                </p>
              )}

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-900">Safe Campus Handover Protocol</p>
                  <p>
                    Always meet during daylight at a public spot such as the <strong>Campus Security Office</strong> or <strong>Main Library Front Desk</strong>, and bring your Student ID to confirm identity. Never send money or transport fees before seeing your item.
                  </p>
                </div>
              </div>
            </div>
          )}

          {bundle.notice && (
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
              <Link to={`/item/${bundle.notice.id}`} className="font-semibold text-emerald-700 hover:text-emerald-800">
                View Item Notice
              </Link>
              <Link to="/about" className="text-slate-500 hover:text-slate-800">
                Handover Safety Tips
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
