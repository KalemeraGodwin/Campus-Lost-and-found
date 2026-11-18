import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  Copy,
  ImagePlus,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { createNotice, extractFriendlyError } from '../services/api';
import { CATEGORIES, NoticeType, VerificationQuestion } from '../types';
import { formatUgPhoneDisplay, isValidUgPhone, normalizeUgPhone } from '../utils/cryptoAndValidation';
import { saveManagedNotice } from '../utils/localStorageStore';

export function ReportItemPage() {
  const {
    account,
    institutions,
    institutionsLoading,
    activeInstitution,
    registerAccount,
    loginAccount,
    saveNoticeToAccount,
  } = useAccount();

  // Account creation / sign-in gate state (when not signed in)
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('+256');
  const [authPin, setAuthPin] = useState('');
  const [authInstitutionId, setAuthInstitutionId] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Report item form state
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
  const [reporterName, setReporterName] = useState(() => account?.name || '');
  const [reporterWhatsApp, setReporterWhatsApp] = useState(() => account?.phoneNumber || '+256');
  const [pledgeAccepted, setPledgeAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdResult, setCreatedResult] = useState<{
    noticeId: string;
    managementToken: string;
    title: string;
    institutionName: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!authInstitutionId && institutions.length > 0) {
      setAuthInstitutionId(institutions[0].id);
    }
  }, [institutions, authInstitutionId]);

  useEffect(() => {
    if (account) {
      setReporterName(account.name);
      setReporterWhatsApp(account.phoneNumber);
    }
  }, [account]);

  const institutionLocations = useMemo(() => {
    if (!account?.institutionId) return [];
    const matched = institutions.find((i) => i.id === account.institutionId) || activeInstitution;
    return matched?.locations || [];
  }, [account?.institutionId, institutions, activeInstitution]);

  async function handleAccountGateSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      if (authMode === 'register') {
        const selectedInst = institutions.find((i) => i.id === authInstitutionId);
        if (!selectedInst) {
          throw new Error('Please select your campus institution.');
        }
        await registerAccount({
          name: authName,
          phoneNumber: authPhone,
          pin: authPin,
          institutionId: selectedInst.id,
          institutionName: selectedInst.name,
        });
      } else {
        await loginAccount({
          phoneNumber: authPhone,
          pin: authPin,
        });
      }
      setAuthPin('');
    } catch (err) {
      setAuthError(extractFriendlyError(err));
    } finally {
      setAuthSubmitting(false);
    }
  }

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
    if (!account) return;
    setError(null);

    if (!account.institutionId || !account.institutionName) {
      setError('Please select your campus institution in your Profile Dashboard first.');
      return;
    }

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
        institutionId: account.institutionId,
        institutionName: account.institutionName,
        itemDate,
        photoFiles,
        verificationQuestions: validQuestions,
        reporterName,
        reporterWhatsApp: normalizedPhone,
      });

      const localEntry = {
        noticeId: result.noticeId,
        managementToken: result.managementToken,
        title: result.notice.title,
        type: result.notice.type,
        createdAt: new Date().toISOString(),
      };
      saveManagedNotice(localEntry);
      await saveNoticeToAccount(localEntry, account.accessKey).catch(() => {});

      setCreatedResult({
        noticeId: result.noticeId,
        managementToken: result.managementToken,
        title: result.notice.title,
        institutionName: account.institutionName,
      });
    } catch (err) {
      setError(extractFriendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Gate 1: Must create or sign into an account before reporting an item
  if (!account) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Step 1 · Account Required</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Create an Account to Report an Item
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Sign up under your campus institution with your Name and Ugandan WhatsApp number. Once signed in, you can report items anytime and receive alerts for your campus.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                authMode === 'register'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                authMode === 'login'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Sign In
            </button>
          </div>

          <form onSubmit={handleAccountGateSubmit} className="space-y-4">
            {authMode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="gate-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <input
                    id="gate-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="e.g. Grace Namukasa"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="gate-institution" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Campus Institution
                  </label>
                  <select
                    id="gate-institution"
                    required
                    value={authInstitutionId}
                    onChange={(e) => setAuthInstitutionId(e.target.value)}
                    disabled={institutionsLoading || institutions.length === 0}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                  >
                    {institutions.length === 0 ? (
                      <option value="">
                        {institutionsLoading ? 'Loading institutions...' : 'No institutions configured by Admin yet'}
                      </option>
                    ) : (
                      institutions.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label htmlFor="gate-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ugandan WhatsApp Number
              </label>
              <input
                id="gate-phone"
                type="tel"
                required
                value={authPhone}
                onChange={(e) => setAuthPhone(e.target.value)}
                onBlur={() => setAuthPhone(normalizeUgPhone(authPhone))}
                placeholder="+256772123456"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Format: +256 7XX XXXXXX (hidden until you approve a claim)
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="gate-pin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {authMode === 'register' ? 'Create a 4–6 Digit PIN' : 'Account PIN'}
              </label>
              <input
                id="gate-pin"
                type="password"
                inputMode="numeric"
                required
                minLength={4}
                maxLength={12}
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value)}
                placeholder="••••"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
            </div>

            {authError && (
              <div
                className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200"
                role="alert"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting || (authMode === 'register' && institutions.length === 0)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {authSubmitting
                ? authMode === 'register'
                  ? 'Creating Account...'
                  : 'Signing In...'
                : authMode === 'register'
                ? 'Create Account & Continue to Report'
                : 'Sign In & Continue to Report'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              You can edit your WhatsApp number, institution, or log out anytime from your Profile Dashboard.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Legacy account guard: prompt to select institution before reporting
  if (!account.institutionId) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800/70 p-6 space-y-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Select Your Campus Institution
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Your account does not have a campus institution selected yet. Choose your institution in your Profile Dashboard before posting a notice.
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

  // Gate 2: Confirmation screen after publishing a notice
  if (createdResult) {
    const managementUrl = `${window.location.origin}/my-notices?token=${createdResult.managementToken}`;
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-8 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Notice Published · {createdResult.institutionName}
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Your notice is live on CampusTrace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Your WhatsApp number and expected answers remain hidden. Only users under{' '}
            <strong className="text-slate-900 dark:text-slate-100">{createdResult.institutionName}</strong> can view and respond to this notice.
          </p>
        </div>

        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 p-4 flex items-start gap-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
          <BellRing className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Saved to your profile (<strong>{account.name}</strong>). You will receive live notifications whenever someone responds to this notice.
          </span>
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Private Management Link</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Synced to your account</span>
          </div>
          <p className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            {managementUrl}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(managementUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-2 transition-colors"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? 'Management Link Copied' : 'Copy Private Management Link'}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to={`/my-notices?token=${createdResult.managementToken}`}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 inline-flex items-center justify-center transition-colors text-center"
          >
            Open Reporter Dashboard
          </Link>
          <button
            type="button"
            onClick={() => {
              setCreatedResult(null);
              setTitle('');
              setPublicDescription('');
              setLocation('');
              setPhotoFiles([]);
              setPhotoPreviews([]);
              setQuestions([{ question: '', expectedAnswer: '' }]);
              setPledgeAccepted(false);
            }}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center transition-colors text-center"
          >
            Report Another Item
          </button>
        </div>
      </div>
    );
  }

  // Gate 3: Signed-in Report an Item Form
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Report an Item
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your notice will be published strictly to <strong className="text-slate-900 dark:text-slate-100">{account.institutionName}</strong>.
        </p>
      </div>

      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span className="truncate">
            Reporting as <strong>{account.name}</strong> ({formatUgPhoneDisplay(account.phoneNumber)})
          </span>
          <span className="text-emerald-400 dark:text-emerald-700">·</span>
          <span className="inline-flex items-center gap-1 font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{account.institutionName}</span>
          </span>
        </div>
        <Link
          to="/account"
          className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 underline underline-offset-2 hover:text-emerald-950 dark:hover:text-emerald-100 shrink-0"
        >
          Manage Profile / Log Out
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-7 space-y-6">
        {/* Type Segmented Toggle */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Notice Type</span>
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setType('found')}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                type === 'found'
                  ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              I found an item
            </button>
            <button
              type="button"
              onClick={() => setType('lost')}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                type === 'lost'
                  ? 'bg-white dark:bg-slate-700 text-amber-800 dark:text-amber-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              I lost an item
            </button>
          </div>
        </div>

        {/* Item Basics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="item-category" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Category
            </label>
            <select
              id="item-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="item-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Date {type === 'found' ? 'Found' : 'Lost'}
            </label>
            <input
              id="item-date"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={itemDate}
              onChange={(e) => setItemDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-location" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Campus Location ({account.institutionName})
          </label>
          {institutionLocations.length > 0 ? (
            <select
              id="item-location"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            >
              <option value="">Select a campus location...</option>
              {institutionLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                id="item-location"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main Library Level 2"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No preset campus locations configured yet by Admin for {account.institutionName}.
              </p>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-description" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
          />
        </div>

        {/* Photo Upload */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Item Photos (minimum 1, up to 5)
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{photoFiles.length}/5</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photoPreviews.map((url, idx) => (
              <div key={url} className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
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
              <label className="aspect-4/3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-700 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition-colors p-3 text-center">
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
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Private Verification Questions</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Claimants see your questions, never your expected answers. Only you and Admin can view expected answers.
              </p>
            </div>
            {questions.length < 5 && (
              <button
                type="button"
                onClick={addQuestion}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {questions.map((item, idx) => (
              <div key={idx} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Question {idx + 1}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      className="text-xs font-medium text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 min-h-[32px] px-2"
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
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                />
                <input
                  type="text"
                  required
                  minLength={1}
                  maxLength={240}
                  value={item.expectedAnswer}
                  onChange={(e) => updateQuestion(idx, 'expectedAnswer', e.target.value)}
                  placeholder="Expected answer (kept strictly private)"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Reporter Identity (Pre-filled from Profile) */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Contact Details (Private)</h2>
            <Link to="/account" className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
              Edit in Profile Dashboard
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="reporter-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reporter-whatsapp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Format: +256 7XX XXXXXX (hidden until claim approval)</p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={pledgeAccepted}
              onChange={(e) => setPledgeAccepted(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-emerald-700 dark:text-emerald-500 focus:ring-emerald-700 dark:focus:ring-emerald-500 shrink-0"
            />
            <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {type === 'found'
                ? 'I have this item and will hand it over fairly at a public campus location once ownership is verified.'
                : 'I confirm that these details accurately describe my lost item and I will coordinate handover safely.'}
            </span>
          </label>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-4 py-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Publishing Notice...' : 'Publish Item Notice'}
        </button>
      </form>
    </div>
  );
}
