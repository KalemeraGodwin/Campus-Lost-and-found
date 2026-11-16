import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Flag,
  FolderKanban,
  KeyRound,
  Lock,
  Trash2,
  XCircle,
} from 'lucide-react';
import { NoticeImage } from '../components/NoticeImage';
import { ReportAbuseModal } from '../components/ReportAbuseModal';
import { ClaimStatusIndicator, NoticeStatusIndicator } from '../components/StatusText';
import {
  ManagedNoticeBundle,
  approveClaimOnNotice,
  extractFriendlyError,
  getNoticeBundleByToken,
  markNoticeReturned,
  rejectClaimOnNotice,
  updateNoticeDetails,
} from '../services/firebase';
import { CATEGORIES, ClaimRecord } from '../types';
import { extractTokenFromInput, formatShortDate, getEffectiveNoticeStatus } from '../utils/cryptoAndValidation';
import {
  getSavedManagedNotices,
  removeSavedManagedNotice,
  saveManagedNotice,
} from '../utils/localStorageStore';

export function MyNoticesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tokenInput, setTokenInput] = useState('');
  const [bundles, setBundles] = useState<ManagedNoticeBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Edit Notice Modal State
  const [editingBundle, setEditingBundle] = useState<ManagedNoticeBundle | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reject Claim Modal State
  const [rejectingTarget, setRejectingTarget] = useState<{
    noticeId: string;
    claim: ClaimRecord;
    wasApproved: boolean;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Report Claim Modal
  const [reportingClaimId, setReportingClaimId] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);

  const loadAllSavedNotices = useCallback(async (extraToken?: string) => {
    setLoading(true);
    setActionError(null);
    const saved = getSavedManagedNotices();
    const tokens = new Set<string>(saved.map((s) => s.managementToken));
    if (extraToken) tokens.add(extraToken);

    if (tokens.size === 0) {
      setBundles([]);
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.all(
        Array.from(tokens).map(async (tok) => {
          try {
            return await getNoticeBundleByToken(tok);
          } catch {
            return null;
          }
        })
      );
      const valid = results.filter((r): r is ManagedNoticeBundle => r !== null);
      valid.forEach((b) => {
        saveManagedNotice({
          noticeId: b.notice.id,
          managementToken: b.managementToken,
          title: b.notice.title,
          type: b.notice.type,
          createdAt: b.notice.createdAt.toISOString(),
        });
      });
      valid.sort((a, b) => b.notice.createdAt.getTime() - a.notice.createdAt.getTime());
      setBundles(valid);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    loadAllSavedNotices(urlToken ? extractTokenFromInput(urlToken) : undefined);
  }, [searchParams, loadAllSavedNotices]);

  const totalPendingClaims = useMemo(() => {
    return bundles.reduce(
      (acc, b) => acc + b.claims.filter((c) => c.status === 'pending').length,
      0
    );
  }, [bundles]);

  async function handleAddTokenSubmit(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    const extracted = extractTokenFromInput(tokenInput);
    if (!extracted) {
      setActionError('Paste a valid private management link or token.');
      return;
    }
    const found = await getNoticeBundleByToken(extracted);
    if (!found) {
      setActionError('No notice found for that management token.');
      return;
    }
    saveManagedNotice({
      noticeId: found.notice.id,
      managementToken: found.managementToken,
      title: found.notice.title,
      type: found.notice.type,
      createdAt: found.notice.createdAt.toISOString(),
    });
    setTokenInput('');
    setSearchParams({ token: found.managementToken });
    await loadAllSavedNotices(found.managementToken);
    setActionMessage(`Loaded "${found.notice.title}".`);
  }

  async function handleApproveClaim(bundle: ManagedNoticeBundle, claim: ClaimRecord) {
    setActionError(null);
    setActionMessage(null);
    setBusyClaimId(claim.id);
    try {
      await approveClaimOnNotice({
        noticeId: bundle.notice.id,
        claimId: claim.id,
        claimCodeHash: claim.claimCodeHash,
        reporterName: bundle.secret.reporterName,
        reporterWhatsApp: bundle.secret.reporterWhatsApp,
      });
      setActionMessage(
        `Approved claim by ${claim.claimantName}. Your WhatsApp number is now unlocked on their Track Claim page.`
      );
      await loadAllSavedNotices();
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setBusyClaimId(null);
    }
  }

  async function handleConfirmReject(e: FormEvent) {
    e.preventDefault();
    if (!rejectingTarget) return;
    setSubmittingReject(true);
    setActionError(null);
    try {
      await rejectClaimOnNotice({
        noticeId: rejectingTarget.noticeId,
        claimId: rejectingTarget.claim.id,
        rejectionReason: rejectReason,
        wasApproved: rejectingTarget.wasApproved,
      });
      setRejectingTarget(null);
      setRejectReason('');
      setActionMessage('Claim rejected and claimant notified.');
      await loadAllSavedNotices();
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setSubmittingReject(false);
    }
  }

  function openEditModal(bundle: ManagedNoticeBundle) {
    setEditingBundle(bundle);
    setEditTitle(bundle.notice.title);
    setEditDescription(bundle.notice.publicDescription);
    setEditLocation(bundle.notice.location);
    setEditCategory(bundle.notice.category);
    setEditDate(bundle.notice.itemDate);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingBundle) return;
    setSavingEdit(true);
    setActionError(null);
    try {
      await updateNoticeDetails(editingBundle.notice.id, {
        title: editTitle,
        publicDescription: editDescription,
        location: editLocation,
        category: editCategory,
        itemDate: editDate,
      });
      setEditingBundle(null);
      setActionMessage('Notice details updated.');
      await loadAllSavedNotices();
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleMarkReturned(noticeId: string) {
    setActionError(null);
    setActionMessage(null);
    try {
      await markNoticeReturned(noticeId);
      setActionMessage('Notice marked as returned and closed.');
      await loadAllSavedNotices();
    } catch (err) {
      setActionError(extractFriendlyError(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              My Notices
            </h1>
            {totalPendingClaims > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold tabular-nums">
                {totalPendingClaims} pending {totalPendingClaims === 1 ? 'claim' : 'claims'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Review verification answers side-by-side with your expected answers and inspect evidence before approving handover.
          </p>
        </div>
        <Link
          to="/report"
          className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center shrink-0"
        >
          Post New Notice
        </Link>
      </div>

      {/* Paste Management Token / Link */}
      <form
        onSubmit={handleAddTokenSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste private management link or secret token..."
            aria-label="Private management link or token"
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <button
          type="submit"
          className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shrink-0"
        >
          Load Notice
        </button>
      </form>

      {actionMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      ) : bundles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-3">
          <FolderKanban className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="font-display text-lg font-semibold text-slate-900">
            No notices saved on this device
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Post a found or lost item notice from this device, or paste your private management link above to manage claims from another device.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {bundles.map((bundle) => {
            const effectiveStatus = getEffectiveNoticeStatus(bundle.notice);
            const isOpen = effectiveStatus === 'open';
            const managementLink = `${window.location.origin}/my-notices?token=${bundle.managementToken}`;
            const pendingCount = bundle.claims.filter((c) => c.status === 'pending').length;

            return (
              <section
                key={bundle.notice.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
              >
                {/* Notice Header */}
                <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                      <NoticeImage src={bundle.notice.photos[0]} alt={bundle.notice.title} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={bundle.notice.type === 'found' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                          {bundle.notice.type === 'found' ? 'Found' : 'Lost'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <NoticeStatusIndicator status={effectiveStatus} />
                        {pendingCount > 0 && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-amber-700 tabular-nums">
                              {pendingCount} pending review
                            </span>
                          </>
                        )}
                      </div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        {bundle.notice.title}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {bundle.notice.location} · {bundle.notice.category} · {formatShortDate(bundle.notice.itemDate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(managementLink);
                        setActionMessage('Private management link copied.');
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </button>

                    {isOpen && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(bundle)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkReturned(bundle.notice.id)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark as Returned</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        removeSavedManagedNotice(bundle.notice.id);
                        setBundles((prev) => prev.filter((item) => item.notice.id !== bundle.notice.id));
                      }}
                      title="Remove from this browser"
                      aria-label="Forget notice on this device"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Claims Section */}
                <div className="p-5 sm:p-6 bg-slate-50/70 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Submitted Claims ({bundle.claims.length})
                    </h3>
                    {bundle.notice.approvedClaimId && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Lock className="w-3.5 h-3.5" />
                        <span>1 active approved claim locked</span>
                      </span>
                    )}
                  </div>

                  {bundle.claims.length === 0 ? (
                    <p className="text-sm text-slate-500 py-3">
                      No claims submitted yet. When someone answers your verification questions, they will appear here.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {bundle.claims.map((claim) => {
                        const isThisApproved = bundle.notice.approvedClaimId === claim.id;
                        const anotherApproved =
                          bundle.notice.approvedClaimId !== null &&
                          bundle.notice.approvedClaimId !== claim.id;

                        return (
                          <div
                            key={claim.id}
                            className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {claim.claimantName}
                                </p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  Submitted {formatShortDate(claim.createdAt)}
                                </p>
                              </div>
                              <ClaimStatusIndicator status={claim.status} />
                            </div>

                            {/* Side-by-side Verification Comparison */}
                            <div className="space-y-2.5">
                              <span className="block text-xs font-semibold text-slate-700">
                                Verification Answers Comparison
                              </span>
                              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                                {bundle.secret.verificationQuestions.map((vq, qIdx) => {
                                  const claimantAns =
                                    claim.answers.find((a) => a.question === vq.question)?.answer ||
                                    claim.answers[qIdx]?.answer ||
                                    'No answer provided';
                                  return (
                                    <div
                                      key={qIdx}
                                      className="p-3 bg-white grid grid-cols-1 md:grid-cols-2 gap-3 text-xs"
                                    >
                                      <div className="space-y-1">
                                        <p className="font-medium text-slate-500">
                                          Q{qIdx + 1}: {vq.question}
                                        </p>
                                        <p className="text-slate-900 font-semibold">
                                          Claimant: {claimantAns}
                                        </p>
                                      </div>
                                      <div className="space-y-1 md:border-l md:border-slate-100 md:pl-3">
                                        <p className="font-medium text-emerald-700">
                                          Your Expected Answer
                                        </p>
                                        <p className="text-slate-800">{vq.expectedAnswer}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Evidence Previews */}
                            <div className="space-y-2">
                              <span className="block text-xs font-semibold text-slate-700">
                                Uploaded Evidence ({claim.evidenceUrls.length})
                              </span>
                              {claim.evidenceUrls.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">
                                  Evidence files purged after 30-day retention window.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2.5">
                                  {claim.evidenceUrls.map((url, eIdx) => {
                                    const isImage =
                                      url.startsWith('data:image/') ||
                                      /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) ||
                                      url.includes('alt=media');
                                    return (
                                      <a
                                        key={eIdx}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-emerald-700 transition-colors"
                                      >
                                        {isImage ? (
                                          <img
                                            src={url}
                                            alt={`Evidence ${eIdx + 1}`}
                                            referrerPolicy="no-referrer"
                                            className="w-14 h-14 object-cover rounded-lg"
                                          />
                                        ) : null}
                                        <span className="text-xs font-medium text-slate-700 group-hover:text-emerald-700 inline-flex items-center gap-1 pr-1">
                                          <span>Evidence {eIdx + 1}</span>
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {claim.status === 'rejected' && claim.rejectionReason && (
                              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                                Rejection reason: {claim.rejectionReason}
                              </p>
                            )}

                            {/* Claim Actions */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                              <div className="flex flex-wrap items-center gap-2">
                                {isOpen && claim.status === 'pending' && (
                                  <button
                                    type="button"
                                    disabled={anotherApproved || busyClaimId === claim.id}
                                    onClick={() => handleApproveClaim(bundle, claim)}
                                    className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>
                                      {busyClaimId === claim.id
                                        ? 'Approving...'
                                        : anotherApproved
                                        ? 'Another Claim Active'
                                        : 'Approve Claim'}
                                    </span>
                                  </button>
                                )}

                                {isOpen && (claim.status === 'pending' || isThisApproved) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingTarget({
                                        noticeId: bundle.notice.id,
                                        claim,
                                        wasApproved: isThisApproved,
                                      });
                                      setRejectReason('');
                                    }}
                                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    <span>{isThisApproved ? 'Revoke & Reject' : 'Reject Claim'}</span>
                                  </button>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => setReportingClaimId(claim.id)}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
                              >
                                <Flag className="w-3.5 h-3.5" />
                                <span>Report Claim</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Reject Claim Modal */}
      {rejectingTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmReject}
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">
              Reject Claim from {rejectingTarget.claim.claimantName}
            </h2>
            <p className="text-xs text-slate-600">
              Enter a clear reason so the claimant knows what was missing (they can resubmit with stronger evidence).
            </p>
            <textarea
              rows={3}
              required
              minLength={3}
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Answer for Q1 did not match, please upload a clear receipt or photo."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReject}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800 disabled:opacity-50"
              >
                {submittingReject ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Notice Modal */}
      {editingBundle && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEdit}
            className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">Edit Notice Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Public Description
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  maxLength={1200}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingBundle(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ReportAbuseModal
        isOpen={reportingClaimId !== null}
        onClose={() => setReportingClaimId(null)}
        targetType="claim"
        targetId={reportingClaimId || ''}
        targetLabel="Suspicious claim"
      />
    </div>
  );
}
