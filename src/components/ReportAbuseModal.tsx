import { FormEvent, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { extractFriendlyError, submitAbuseReport } from '../services/api';

interface ReportAbuseModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'notice' | 'claim';
  targetId: string;
  targetLabel?: string;
}

const QUICK_REASONS = [
  'Spam or fake listing',
  'Requesting payment or ransom for found item',
  'Suspicious or abusive verification answers',
  'Duplicate or misleading item details',
];

export function ReportAbuseModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetLabel,
}: ReportAbuseModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Please describe the issue in at least 5 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitAbuseReport({ targetType, targetId, reason });
      setSubmitted(true);
    } catch (err) {
      setError(extractFriendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetAndClose() {
    setReason('');
    setError(null);
    setSubmitted(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 dark:bg-black/70 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-700 dark:text-rose-400" />
            <h2 id="report-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Report {targetType === 'notice' ? 'Notice' : 'Claim'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Thank you. Your report has been sent to CampusTrace Admin for moderation review.
            </p>
            <button
              type="button"
              onClick={handleResetAndClose}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-white transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {targetLabel && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Flagging: <span className="font-medium text-slate-800 dark:text-slate-200">{targetLabel}</span>
              </p>
            )}

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">Common issues</span>
              <div className="flex flex-wrap gap-2">
                {QUICK_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium border text-left transition-colors ${
                      reason === preset
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 border-slate-900 dark:border-slate-100'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="report-reason" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Details for Admin
              </label>
              <textarea
                id="report-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={600}
                placeholder="Explain why this post or claim violates campus policy..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                required
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-rose-700 dark:bg-rose-600 text-white text-sm font-semibold hover:bg-rose-800 dark:hover:bg-rose-500 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
