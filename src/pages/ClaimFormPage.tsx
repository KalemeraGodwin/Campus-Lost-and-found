import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, FileText, Lock, Trash2, UploadCloud } from 'lucide-react';
import { extractFriendlyError, getNoticeById, submitClaim } from '../services/firebase';
import { PublicNotice } from '../types';
import { getEffectiveNoticeStatus, isValidUgPhone, normalizeUgPhone } from '../utils/cryptoAndValidation';
import { saveTrackedClaim } from '../utils/localStorageStore';

export function ClaimFormPage() {
  const { id } = useParams<{ id: string }>();
  const [notice, setNotice] = useState<PublicNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [claimantName, setClaimantName] = useState('');
  const [claimantWhatsApp, setClaimantWhatsApp] = useState('+256');
  const [answers, setAnswers] = useState<string[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [claimResult, setClaimResult] = useState<{ claimCode: string; claimId: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!id) return;
    getNoticeById(id)
      .then((res) => {
        setNotice(res);
        if (res) {
          setAnswers(res.verificationPrompts.map(() => ''));
        }
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(extractFriendlyError(err));
        setLoading(false);
      });
  }, [id]);

  function handleEvidenceChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEvidenceFiles((prev) => [...prev, ...files].slice(0, 5));
  }

  function removeEvidence(idx: number) {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!notice) return;
    setSubmitError(null);

    const normalizedPhone = normalizeUgPhone(claimantWhatsApp);
    if (!isValidUgPhone(normalizedPhone)) {
      setSubmitError('Enter a valid Ugandan WhatsApp number (+256 followed by 9 digits).');
      return;
    }

    if (answers.some((a) => a.trim().length < 1)) {
      setSubmitError('Please answer every verification question.');
      return;
    }

    if (evidenceFiles.length < 1) {
      setSubmitError('Please upload at least 1 supporting evidence file (photo, receipt, or redacted ID).');
      return;
    }

    setSubmitting(true);
    try {
      const formattedAnswers = notice.verificationPrompts.map((question, idx) => ({
        question,
        answer: answers[idx] || '',
      }));

      const res = await submitClaim({
        noticeId: notice.id,
        claimantName,
        claimantWhatsApp: normalizedPhone,
        answers: formattedAnswers,
        evidenceFiles,
      });

      saveTrackedClaim({
        claimCode: res.claimCode,
        claimId: res.claimId,
        noticeId: notice.id,
        noticeTitle: notice.title,
        createdAt: new Date().toISOString(),
      });

      setClaimResult(res);
    } catch (err) {
      setSubmitError(extractFriendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="max-w-xl mx-auto h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />;
  }

  if (loadError || !notice || getEffectiveNoticeStatus(notice) !== 'open') {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-slate-900">Claims Closed</h1>
        <p className="text-sm text-slate-600">
          {loadError || 'This notice is not currently open for claims.'}
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          Return to Browse
        </Link>
      </div>
    );
  }

  if (claimResult) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-700">Claim Submitted</p>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Save Your Claim Tracking Code
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            The reporter will compare your answers and evidence privately. Once approved, your Track Claim screen will unlock their WhatsApp contact for handover.
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 text-center space-y-3">
          <span className="block text-xs font-medium text-slate-500">Your Claim Code</span>
          <p className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-slate-900 select-all">
            {claimResult.claimCode}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(claimResult.claimCode);
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 2000);
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            {copiedCode ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
            <span>{copiedCode ? 'Copied' : 'Copy Claim Code'}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to={`/track-claim?code=${claimResult.claimCode}`}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center"
          >
            Track Claim Status
          </Link>
          <Link
            to="/"
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
          >
            Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link
          to={`/item/${notice.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Item Details</span>
        </Link>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-emerald-700">
          {notice.type === 'found' ? 'Claim Ownership' : 'Report Recovery'}
        </p>
        <h1 className="font-display text-2xl font-bold text-slate-900">{notice.title}</h1>
        <p className="text-sm text-slate-600">
          {notice.location} · Reported by {notice.reporterFirstName}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-6">
        {/* Claimant Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="claimant-name" className="block text-xs font-semibold text-slate-700">
              Your Full Name
            </label>
            <input
              id="claimant-name"
              type="text"
              required
              maxLength={80}
              value={claimantName}
              onChange={(e) => setClaimantName(e.target.value)}
              placeholder="e.g. Brian Kigozi"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="claimant-whatsapp" className="block text-xs font-semibold text-slate-700">
              Ugandan WhatsApp Number
            </label>
            <input
              id="claimant-whatsapp"
              type="tel"
              required
              value={claimantWhatsApp}
              onChange={(e) => setClaimantWhatsApp(e.target.value)}
              onBlur={() => setClaimantWhatsApp(normalizeUgPhone(claimantWhatsApp))}
              placeholder="+256772123456"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <p className="text-xs text-slate-500">Format: +256 7XX XXXXXX</p>
          </div>
        </div>

        {/* Verification Questions */}
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-700" />
              <span>Answer Reporter&apos;s Verification Questions</span>
            </h2>
            <p className="text-xs text-slate-500">
              Provide accurate answers so the reporter can verify your claim.
            </p>
          </div>

          <div className="space-y-4">
            {notice.verificationPrompts.map((prompt, idx) => (
              <div key={idx} className="space-y-1.5">
                <label
                  htmlFor={`answer-${idx}`}
                  className="block text-xs font-semibold text-slate-800"
                >
                  {idx + 1}. {prompt}
                </label>
                <input
                  id={`answer-${idx}`}
                  type="text"
                  required
                  maxLength={400}
                  value={answers[idx] || ''}
                  onChange={(e) => {
                    const next = [...answers];
                    next[idx] = e.target.value;
                    setAnswers(next);
                  }}
                  placeholder="Enter your answer..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Evidence Upload */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="space-y-1">
            <span className="block text-sm font-semibold text-slate-900">
              Supporting Evidence (Minimum 1 Required)
            </span>
            <p className="text-xs text-slate-500">
              Upload a purchase receipt, device IMEI/serial screenshot, photo of you with the item, or a redacted student ID (cover sensitive ID numbers).
            </p>
          </div>

          {evidenceFiles.length > 0 && (
            <ul className="space-y-2">
              {evidenceFiles.map((file, idx) => (
                <li
                  key={file.name + idx}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs"
                >
                  <span className="flex items-center gap-2 truncate text-slate-700 font-medium">
                    <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEvidence(idx)}
                    aria-label={`Remove ${file.name}`}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {evidenceFiles.length < 5 && (
            <label className="min-h-[88px] rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-700 bg-slate-50 flex flex-col items-center justify-center gap-1.5 p-4 text-center cursor-pointer transition-colors">
              <UploadCloud className="w-6 h-6 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">
                Upload Evidence Image or PDF
              </span>
              <span className="text-xs text-slate-500">PNG, JPG, WebP, or PDF (up to 5 files)</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleEvidenceChange}
                className="sr-only"
              />
            </label>
          )}
        </div>

        {submitError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting Claim...' : 'Submit Verification Claim'}
        </button>
      </form>
    </div>
  );
}
