import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing, Building2, Check, Copy, FileText, Lock, Trash2, UploadCloud, UserCheck } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { extractFriendlyError, getNoticeById, submitClaim } from '../services/api';
import { PublicNotice } from '../types';
import { getEffectiveNoticeStatus, isValidUgPhone, normalizeUgPhone } from '../utils/cryptoAndValidation';
import { saveTrackedClaim } from '../utils/localStorageStore';

export function ClaimFormPage() {
  const { id } = useParams<{ id: string }>();
  const { account, registerAccount, saveClaimToAccount } = useAccount();
  const [notice, setNotice] = useState<PublicNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [claimantName, setClaimantName] = useState(() => account?.name || '');
  const [claimantWhatsApp, setClaimantWhatsApp] = useState(() => account?.phoneNumber || '+256');
  const [createFollowUpAccount, setCreateFollowUpAccount] = useState(false);
  const [accountPin, setAccountPin] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [claimResult, setClaimResult] = useState<{
    claimCode: string;
    claimId: string;
    accountNotice?: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (account) {
      setClaimantName((prev) => prev || account.name);
      setClaimantWhatsApp((prev) => (prev === '+256' || !prev ? account.phoneNumber : prev));
    }
  }, [account]);

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

    if (!account && createFollowUpAccount && accountPin.trim().length < 4) {
      setSubmitError('Enter a 4–6 digit PIN to create your follow-up account.');
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

      const localClaim = {
        claimCode: res.claimCode,
        claimId: res.claimId,
        noticeId: notice.id,
        noticeTitle: notice.title,
        createdAt: new Date().toISOString(),
      };
      saveTrackedClaim(localClaim);

      let accountNotice: string | undefined;
      if (account) {
        await saveClaimToAccount(localClaim, account.accessKey).catch(() => {});
        accountNotice = `Linked to ${account.name}. We will notify you as soon as the reporter reviews your claim.`;
      } else if (createFollowUpAccount) {
        try {
          const newSession = await registerAccount({
            name: claimantName,
            phoneNumber: normalizedPhone,
            pin: accountPin.trim(),
            institutionId: notice.institutionId,
            institutionName: notice.institutionName,
          });
          await saveClaimToAccount(localClaim, newSession.accessKey).catch(() => {});
          accountNotice = `Follow-up account created under ${notice.institutionName} for ${newSession.name}. You will get an alert when your claim is reviewed.`;
        } catch (accErr) {
          accountNotice = `Claim submitted! Account note: ${extractFriendlyError(accErr)} You can sign in on the Account page to track updates.`;
        }
      }

      setClaimResult({ ...res, accountNotice });
    } catch (err) {
      setSubmitError(extractFriendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto h-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  if (loadError || !notice || getEffectiveNoticeStatus(notice) !== 'open') {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Claims Closed</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {loadError || 'This notice is not currently open for claims.'}
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-white"
        >
          Return to Browse
        </Link>
      </div>
    );
  }

  if (account && account.institutionId && notice.institutionId !== account.institutionId) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800/70 p-8 text-center space-y-4">
        <Building2 className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Different Campus Institution
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          This notice belongs to <strong className="text-slate-900 dark:text-slate-100">{notice.institutionName}</strong>, while your account is registered under{' '}
          <strong className="text-slate-900 dark:text-slate-100">{account.institutionName}</strong>. Claims can only be submitted within your registered institution.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-white"
        >
          Return to {account.institutionName}
        </Link>
      </div>
    );
  }

  if (claimResult) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Claim Submitted</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Save Your Claim Tracking Code
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            The reporter will compare your answers and evidence privately. Once approved, your Track Claim screen will unlock their WhatsApp contact for handover.
          </p>
        </div>

        {claimResult.accountNotice ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 p-4 flex items-start gap-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
            <BellRing className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{claimResult.accountNotice}</span>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Get notified on approval</p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Create or sign into a Follow-Up Account to get live alerts when the reporter responds.
              </p>
            </div>
            <Link
              to="/account"
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-amber-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold hover:bg-amber-950 dark:hover:bg-amber-400 inline-flex items-center justify-center shrink-0"
            >
              Enable Alerts
            </Link>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-5 text-center space-y-3">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Your Claim Code</span>
          <p className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-slate-900 dark:text-slate-100 select-all break-all">
            {claimResult.claimCode}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(claimResult.claimCode);
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 2000);
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            {copiedCode ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copiedCode ? 'Copied' : 'Copy Claim Code'}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to={`/track-claim?code=${claimResult.claimCode}`}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 inline-flex items-center justify-center text-center"
          >
            Track Claim Status
          </Link>
          <Link
            to="/"
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center text-center"
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Item Details</span>
        </Link>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {notice.type === 'found' ? 'Claim Ownership' : 'Report Recovery'} · {notice.institutionName}
        </p>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">{notice.title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {notice.location} · Reported by {notice.reporterFirstName}
        </p>
      </div>

      {account && (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-4 py-3 flex items-center gap-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
          <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span>
            Signed in as <strong>{account.name}</strong>. Your claim will be saved to your Follow-Up Account.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-7 space-y-6">
        {/* Claimant Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="claimant-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="claimant-whatsapp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Format: +256 7XX XXXXXX</p>
          </div>
        </div>

        {!account && (
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createFollowUpAccount}
                onChange={(e) => setCreateFollowUpAccount(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-500 focus:ring-emerald-700 dark:focus:ring-emerald-500 shrink-0"
              />
              <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                <strong className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Create a Follow-Up Account with my Name &amp; WhatsApp
                </strong>{' '}
                to receive instant notifications when your claim is approved or reviewed.
              </span>
            </label>

            {createFollowUpAccount && (
              <div className="pl-0 sm:pl-8 space-y-1.5">
                <label htmlFor="claim-account-pin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Choose a 4–6 Digit PIN
                </label>
                <input
                  id="claim-account-pin"
                  type="password"
                  inputMode="numeric"
                  required={createFollowUpAccount}
                  minLength={4}
                  maxLength={12}
                  value={accountPin}
                  onChange={(e) => setAccountPin(e.target.value)}
                  placeholder="••••"
                  className="w-full sm:w-48 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Verification Questions */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Answer Reporter&apos;s Verification Questions</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Provide accurate answers so the reporter can verify your claim.
            </p>
          </div>

          <div className="space-y-4">
            {notice.verificationPrompts.map((prompt, idx) => (
              <div key={idx} className="space-y-1.5">
                <label
                  htmlFor={`answer-${idx}`}
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
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
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Evidence Upload */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="space-y-1">
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              Supporting Evidence (Minimum 1 Required)
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload a purchase receipt, device IMEI/serial screenshot, photo of you with the item, or a redacted student ID (cover sensitive ID numbers).
            </p>
          </div>

          {evidenceFiles.length > 0 && (
            <ul className="space-y-2">
              {evidenceFiles.map((file, idx) => (
                <li
                  key={file.name + idx}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-xs"
                >
                  <span className="flex items-center gap-2 truncate text-slate-700 dark:text-slate-200 font-medium">
                    <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEvidence(idx)}
                    aria-label={`Remove ${file.name}`}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {evidenceFiles.length < 5 && (
            <label className="min-h-[88px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-700 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-900/60 flex flex-col items-center justify-center gap-1.5 p-4 text-center cursor-pointer transition-colors">
              <UploadCloud className="w-6 h-6 text-slate-500 dark:text-slate-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Upload Evidence Image or PDF
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, WebP, or PDF (up to 5 files)</span>
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
          <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-4 py-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting Claim...' : 'Submit Verification Claim'}
        </button>
      </form>
    </div>
  );
}
