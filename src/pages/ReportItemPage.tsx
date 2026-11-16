import { ChangeEvent, FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ImagePlus, Lock, Plus, Trash2 } from 'lucide-react';
import { createNotice, extractFriendlyError } from '../services/firebase';
import { CAMPUS_LOCATIONS, CATEGORIES, NoticeType, VerificationQuestion } from '../types';
import { isValidUgPhone, normalizeUgPhone } from '../utils/cryptoAndValidation';
import { saveManagedNotice } from '../utils/localStorageStore';

export function ReportItemPage() {
  const [type, setType] = useState<NoticeType>('found');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  const [location, setLocation] = useState('');
  const [itemDate, setItemDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const [questions, setQuestions] = useState<VerificationQuestion[]>([
    { question: '', expectedAnswer: '' },
  ]);
  const [reporterName, setReporterName] = useState('');
  const [reporterWhatsApp, setReporterWhatsApp] = useState('+256');
  const [pledgeAccepted, setPledgeAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdResult, setCreatedResult] = useState<{
    noticeId: string;
    managementToken: string;
    title: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const mergedFiles = [...photoFiles, ...files].slice(0, 5);
    setPhotoFiles(mergedFiles);
    const urls = mergedFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
  }

  function removePhoto(idx: number) {
    const nextFiles = photoFiles.filter((_, i) => i !== idx);
    const nextPreviews = photoPreviews.filter((_, i) => i !== idx);
    setPhotoFiles(nextFiles);
    setPhotoPreviews(nextPreviews);
  }

  function updateQuestion(idx: number, field: keyof VerificationQuestion, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
    );
  }

  function addQuestion() {
    if (questions.length >= 5) return;
    setQuestions((prev) => [...prev, { question: '', expectedAnswer: '' }]);
  }

  function removeQuestion(idx: number) {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedPhone = normalizeUgPhone(reporterWhatsApp);
    if (!isValidUgPhone(normalizedPhone)) {
      setError('Enter a valid Ugandan WhatsApp number starting with +256 followed by 9 digits.');
      return;
    }
    if (photoFiles.length < 1) {
      setError('Please upload at least 1 clear photo of the item.');
      return;
    }
    if (!pledgeAccepted) {
      setError('Please confirm the fairness and accuracy pledge before submitting.');
      return;
    }

    const validQuestions = questions.filter(
      (q) => q.question.trim().length >= 3 && q.expectedAnswer.trim().length >= 1
    );
    if (validQuestions.length < 1) {
      setError('Add at least 1 private verification question with an expected answer.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createNotice({
        type,
        category,
        title,
        publicDescription,
        location,
        itemDate,
        photoFiles,
        verificationQuestions: validQuestions,
        reporterName,
        reporterWhatsApp: normalizedPhone,
      });

      saveManagedNotice({
        noticeId: result.noticeId,
        managementToken: result.managementToken,
        title: result.notice.title,
        type: result.notice.type,
        createdAt: new Date().toISOString(),
      });

      setCreatedResult({
        noticeId: result.noticeId,
        managementToken: result.managementToken,
        title: result.notice.title,
      });
    } catch (err) {
      setError(extractFriendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (createdResult) {
    const managementUrl = `${window.location.origin}/my-notices?token=${createdResult.managementToken}`;
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-700">Notice Published</p>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Your notice is live on CampusTrace
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Your WhatsApp number and expected answers remain hidden. Bookmark or copy your Private Management Link below to review incoming claims and approve the rightful handover.
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Private Management Link</span>
            <span className="text-xs text-slate-500">Saved to this device</span>
          </div>
          <p className="font-mono text-xs text-slate-800 break-all bg-white border border-slate-200 rounded-lg p-3">
            {managementUrl}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(managementUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 transition-colors"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? 'Management Link Copied' : 'Copy Private Management Link'}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to={`/my-notices?token=${createdResult.managementToken}`}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center transition-colors"
          >
            Open Reporter Dashboard
          </Link>
          <Link
            to={`/item/${createdResult.noticeId}`}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center transition-colors"
          >
            View Public Notice
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Report an Item
        </h1>
        <p className="text-sm text-slate-600">
          No account required. Your WhatsApp number stays private until you approve a verified claim.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-6">
        {/* Type Segmented Toggle */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-700">Notice Type</span>
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setType('found')}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                type === 'found'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              I found an item
            </button>
            <button
              type="button"
              onClick={() => setType('lost')}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                type === 'lost'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              I lost an item
            </button>
          </div>
        </div>

        {/* Item Basics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="item-category" className="block text-xs font-semibold text-slate-700">
              Category
            </label>
            <select
              id="item-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="item-date" className="block text-xs font-semibold text-slate-700">
              Date {type === 'found' ? 'Found' : 'Lost'}
            </label>
            <input
              id="item-date"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={itemDate}
              onChange={(e) => setItemDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-title" className="block text-xs font-semibold text-slate-700">
            Item Title
          </label>
          <input
            id="item-title"
            type="text"
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Navy Blue HP Laptop Sleeve with Charger"
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-location" className="block text-xs font-semibold text-slate-700">
            Campus Location
          </label>
          <input
            id="item-location"
            type="text"
            list="campus-locations-list"
            required
            minLength={2}
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Main Library Level 2"
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
          <datalist id="campus-locations-list">
            {CAMPUS_LOCATIONS.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-description" className="block text-xs font-semibold text-slate-700">
            Public Description
          </label>
          <textarea
            id="item-description"
            rows={3}
            required
            minLength={10}
            maxLength={1200}
            value={publicDescription}
            onChange={(e) => setPublicDescription(e.target.value)}
            placeholder="Describe general appearance and where it was seen. Keep unique identifying secrets (lockscreen photo, serial number, stickers inside) for the private questions below."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>

        {/* Photo Upload */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Item Photos (minimum 1, up to 5)
            </span>
            <span className="text-xs text-slate-500 tabular-nums">{photoFiles.length}/5</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photoPreviews.map((url, idx) => (
              <div key={url} className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img src={url} alt={`Item preview ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  aria-label={`Remove photo ${idx + 1}`}
                  className="absolute top-1.5 right-1.5 min-h-[36px] min-w-[36px] rounded-lg bg-slate-900/75 text-white flex items-center justify-center hover:bg-slate-900"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {photoFiles.length < 5 && (
              <label className="aspect-4/3 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-700 bg-slate-50 flex flex-col items-center justify-center gap-1.5 text-slate-600 hover:text-emerald-700 cursor-pointer transition-colors p-3 text-center">
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs font-medium">Add Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
              </label>
            )}
          </div>
        </div>

        {/* Private Verification Questions */}
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-700" />
                <span>Private Verification Questions</span>
              </h2>
              <p className="text-xs text-slate-500">
                Claimants see your questions, never your expected answers. Only you and Admin can view expected answers.
              </p>
            </div>
            {questions.length < 5 && (
              <button
                type="button"
                onClick={addQuestion}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {questions.map((item, idx) => (
              <div key={idx} className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Question {idx + 1}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      className="text-xs font-medium text-rose-700 hover:text-rose-800 min-h-[32px] px-2"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={240}
                  value={item.question}
                  onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                  placeholder="e.g. What sticker or name is inside the front zipper?"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <input
                  type="text"
                  required
                  minLength={1}
                  maxLength={240}
                  value={item.expectedAnswer}
                  onChange={(e) => updateQuestion(idx, 'expectedAnswer', e.target.value)}
                  placeholder="Expected answer (kept strictly private)"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Reporter Identity */}
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Your Contact Details (Private)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="reporter-name" className="block text-xs font-semibold text-slate-700">
                Your Name
              </label>
              <input
                id="reporter-name"
                type="text"
                required
                maxLength={80}
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="e.g. Grace Namukasa"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reporter-whatsapp" className="block text-xs font-semibold text-slate-700">
                Ugandan WhatsApp Number
              </label>
              <input
                id="reporter-whatsapp"
                type="tel"
                required
                value={reporterWhatsApp}
                onChange={(e) => setReporterWhatsApp(e.target.value)}
                onBlur={() => setReporterWhatsApp(normalizeUgPhone(reporterWhatsApp))}
                placeholder="+256772123456"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <p className="text-xs text-slate-500">Format: +256 7XX XXXXXX (hidden until claim approval)</p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={pledgeAccepted}
              onChange={(e) => setPledgeAccepted(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700 shrink-0"
            />
            <span className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {type === 'found'
                ? 'I have this item and will hand it over fairly at a public campus location once ownership is verified.'
                : 'I confirm that these details accurately describe my lost item and I will coordinate handover safely.'}
            </span>
          </label>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Publishing Notice...' : 'Publish Item Notice'}
        </button>
      </form>
    </div>
  );
}
