import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellRing,
  CheckCheck,
  Edit3,
  FolderKanban,
  LogOut,
  PlusCircle,
  ShieldCheck,
  TicketCheck,
  UserCheck,
} from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { extractFriendlyError } from '../services/firebase';
import { formatShortDate, formatUgPhoneDisplay, normalizeUgPhone } from '../utils/cryptoAndValidation';

export function AccountPage() {
  const {
    account,
    notifications,
    unreadCount,
    browserNotifPermission,
    registerAccount,
    loginAccount,
    updateProfile,
    logoutAccount,
    markAsRead,
    markAllAsRead,
    requestBrowserNotifications,
  } = useAccount();

  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+256');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerAccount({ name, phoneNumber, pin });
      } else {
        await loginAccount({ phoneNumber, pin });
      }
      setPin('');
    } catch (err) {
      setError(extractFriendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditProfile() {
    if (!account) return;
    setEditName(account.name);
    setEditPhone(account.phoneNumber);
    setProfileError(null);
    setProfileSuccess(null);
    setEditingProfile(true);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setSavingProfile(true);
    try {
      const updated = await updateProfile({
        name: editName,
        phoneNumber: editPhone,
      });
      setEditingProfile(false);
      setProfileSuccess(
        `Profile updated. Use ${formatUgPhoneDisplay(updated.phoneNumber)} with your PIN the next time you log in.`
      );
    } catch (err) {
      setProfileError(extractFriendlyError(err));
    } finally {
      setSavingProfile(false);
    }
  }

  if (!account) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Account &amp; Profile Dashboard
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Create an account or sign in with your Name and Ugandan WhatsApp number to report items anytime, manage your profile, and receive live claim notifications.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label htmlFor="acc-name" className="block text-xs font-semibold text-slate-700">
                  Full Name
                </label>
                <input
                  id="acc-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Grace Namukasa"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="acc-phone" className="block text-xs font-semibold text-slate-700">
                Ugandan WhatsApp Number
              </label>
              <input
                id="acc-phone"
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onBlur={() => setPhoneNumber(normalizeUgPhone(phoneNumber))}
                placeholder="+256772123456"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <p className="text-xs text-slate-500">Format: +256 7XX XXXXXX</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="acc-pin" className="block text-xs font-semibold text-slate-700">
                {mode === 'register' ? 'Create a 4–6 Digit PIN' : 'Account PIN'}
              </label>
              <input
                id="acc-pin"
                type="password"
                inputMode="numeric"
                required
                minLength={4}
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <p className="text-xs text-slate-500">
                Protects your management tokens, claim codes, and profile settings.
              </p>
            </div>

            {error && (
              <div
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {submitting
                ? mode === 'register'
                  ? 'Creating Account...'
                  : 'Signing In...'
                : mode === 'register'
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              Your WhatsApp number remains completely hidden on public listings until you approve a verified claim.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Signed-in Profile Dashboard Card */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>Profile Dashboard</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 break-words">
              {account.name}
            </h1>
            <p className="font-mono text-xs sm:text-sm text-slate-600">
              {formatUgPhoneDisplay(account.phoneNumber)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!editingProfile && (
              <button
                type="button"
                onClick={startEditProfile}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit WhatsApp / Name</span>
              </button>
            )}

            {browserNotifPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={requestBrowserNotifications}
                disabled={browserNotifPermission === 'granted'}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                  browserNotifPermission === 'granted'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                }`}
              >
                <BellRing className="w-4 h-4" />
                <span>
                  {browserNotifPermission === 'granted'
                    ? 'Device Alerts Enabled'
                    : 'Enable Device Alerts'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={logoutAccount}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        {profileSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm text-emerald-900">
            {profileSuccess}
          </div>
        )}

        {editingProfile && (
          <form
            onSubmit={handleSaveProfile}
            className="pt-4 border-t border-slate-200 space-y-4"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900">
                Edit Profile &amp; WhatsApp Number
              </h2>
              <p className="text-xs text-slate-600">
                Updating your WhatsApp number here updates your login number for future sign-ins and keeps your posted notices and alerts linked.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="edit-profile-name" className="block text-xs font-semibold text-slate-700">
                  Full Name
                </label>
                <input
                  id="edit-profile-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-profile-phone" className="block text-xs font-semibold text-slate-700">
                  Ugandan WhatsApp Number
                </label>
                <input
                  id="edit-profile-phone"
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  onBlur={() => setEditPhone(normalizeUgPhone(editPhone))}
                  placeholder="+256772123456"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <p className="text-xs text-slate-500">Format: +256 7XX XXXXXX</p>
              </div>
            </div>

            {profileError && (
              <div
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                role="alert"
              >
                {profileError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingProfile(false);
                  setProfileError(null);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
              >
                {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Quick Follow-Up Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/report"
          className="bg-emerald-700 text-white rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-emerald-800 transition-colors"
        >
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-semibold">Report an Item</p>
            <p className="text-xs text-emerald-100">
              Post a found or lost campus item
            </p>
          </div>
          <PlusCircle className="w-6 h-6 shrink-0" />
        </Link>

        <Link
          to="/my-notices"
          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between gap-3 hover:border-emerald-700 transition-colors"
        >
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">My Posted Notices</p>
            <p className="text-xs text-slate-600">
              Review claims &amp; approve handovers
            </p>
          </div>
          <FolderKanban className="w-6 h-6 text-emerald-700 shrink-0" />
        </Link>

        <Link
          to="/track-claim"
          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between gap-3 hover:border-emerald-700 transition-colors"
        >
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">My Submitted Claims</p>
            <p className="text-xs text-slate-600">
              Check approval &amp; WhatsApp links
            </p>
          </div>
          <TicketCheck className="w-6 h-6 text-emerald-700 shrink-0" />
        </Link>
      </div>

      {/* Real-Time Notifications Inbox */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-700" />
            <h2 className="font-display text-lg font-bold text-slate-900">
              Notifications ({unreadCount} unread)
            </h2>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-1.5"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-900">No notifications yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Whenever someone submits a claim on your found/lost item or a reporter reviews your claim, you will receive an instant notification here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notif) => {
              const targetRoute =
                notif.kind === 'new_claim' || notif.kind === 'claim_resubmitted'
                  ? '/my-notices'
                  : '/track-claim';
              return (
                <div
                  key={notif.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    notif.read ? 'bg-white' : 'bg-emerald-50/40'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          notif.read ? 'text-slate-500' : 'text-emerald-700'
                        }`}
                      >
                        {notif.read ? 'Read' : 'New Notification'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 tabular-nums">
                        {formatShortDate(notif.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 break-words">{notif.title}</p>
                    <p className="text-xs sm:text-sm text-slate-600 break-words">{notif.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!notif.read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(notif.id)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Mark read
                      </button>
                    )}
                    <Link
                      to={targetRoute}
                      onClick={() => {
                        if (!notif.read) markAsRead(notif.id);
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center"
                    >
                      {notif.kind === 'new_claim' || notif.kind === 'claim_resubmitted'
                        ? 'Review Claim'
                        : 'Track Claim'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
