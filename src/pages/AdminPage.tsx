import { FormEvent, useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Ban,
  CheckCircle2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { ClaimStatusIndicator, NoticeStatusIndicator } from '../components/StatusText';
import {
  AdminDashboardData,
  adminBanNumber,
  adminFetchDashboardData,
  adminPurgeOldEvidence,
  adminRemoveNotice,
  adminResolveReport,
  adminSignInWithEmail,
  adminSignInWithGoogle,
  adminSignOut,
  adminUnbanNumber,
  extractFriendlyError,
  subscribeAdminAuth,
  verifyAdminAuthorization,
} from '../services/firebase';
import { formatShortDate, getEffectiveNoticeStatus } from '../utils/cryptoAndValidation';

type AdminTab = 'notices' | 'claims' | 'reports' | 'banned';

export function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);

  // Login Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Dashboard Data
  const [activeTab, setActiveTab] = useState<AdminTab>('notices');
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ban Number Form
  const [banPhoneInput, setBanPhoneInput] = useState('+256');
  const [banReasonInput, setBanReasonInput] = useState('');
  const [purging, setPurging] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setActionError(null);
    try {
      const res = await adminFetchDashboardData();
      setData(res);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeAdminAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const ok = await verifyAdminAuthorization(currentUser);
        setIsAuthorizedAdmin(ok);
        if (ok) {
          loadData();
        }
      } else {
        setIsAuthorizedAdmin(false);
        setData(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [loadData]);

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setSigningIn(true);
    try {
      await adminSignInWithEmail(email, password);
    } catch (err) {
      const msg = extractFriendlyError(err);
      if (msg.includes('operation-not-allowed')) {
        setLoginError(
          'Email/Password sign-in is not yet enabled in Firebase Console -> Authentication -> Sign-in method. Enable Email/Password there (or sign in with Google below).'
        );
      } else {
        setLoginError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleGoogleLogin() {
    setLoginError(null);
    setSigningIn(true);
    try {
      await adminSignInWithGoogle();
    } catch (err) {
      setLoginError(extractFriendlyError(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleBanSubmit(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    try {
      await adminBanNumber(banPhoneInput, banReasonInput);
      setActionMessage(`Banned ${banPhoneInput} from creating notices or claims.`);
      setBanPhoneInput('+256');
      setBanReasonInput('');
      await loadData();
    } catch (err) {
      setActionError(extractFriendlyError(err));
    }
  }

  async function handlePurgeEvidence() {
    setPurging(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await adminPurgeOldEvidence();
      setActionMessage(
        `Evidence cleanup complete: purged uploaded evidence on ${res.purgedClaims} claim(s) from notices closed >30 days ago.`
      );
      await loadData();
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setPurging(false);
    }
  }

  if (authLoading) {
    return <div className="max-w-md mx-auto h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-slate-900">Admin Console Login</h1>
          <p className="text-sm text-slate-600">
            Sign in with your authorized campus administrator account to moderate notices, reports, and banned numbers.
          </p>
        </div>

        <form onSubmit={handleEmailLogin} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700">
              Admin Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@campus.ac.ug"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {loginError && (
            <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3" role="alert">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {signingIn ? 'Signing in...' : 'Sign In with Email'}
          </button>

          <div className="relative py-2">
            <div className="border-t border-slate-200" />
            <span className="bg-white px-2 text-xs text-slate-400 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              or
            </span>
          </div>

          <button
            type="button"
            disabled={signingIn}
            onClick={handleGoogleLogin}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Sign In with Google
          </button>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 leading-relaxed">
            <strong>Firebase Setup Note:</strong> To use Email/Password login, enable <em>Email/Password</em> in Firebase Console &rarr; Authentication &rarr; Sign-in method, create your admin user, and add its UID to <code className="font-mono">admins/&#123;uid&#125;</code> in Firestore (or sign in via Google with <code className="font-mono">kalemeragodie@gmail.com</code>).
          </div>
        </form>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-6 space-y-4 text-center">
        <ShieldAlert className="w-10 h-10 text-rose-700 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-900">Admin Access Required</h1>
        <p className="text-sm text-slate-600">
          Signed in as <span className="font-mono text-xs">{user.email}</span>, which is not listed in the <code className="font-mono text-xs">admins</code> collection (or email is unverified).
        </p>
        <p className="text-xs text-slate-500">
          UID: <code className="font-mono select-all">{user.uid}</code>
        </p>
        <button
          type="button"
          onClick={() => adminSignOut()}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Admin Moderation Console
          </h1>
          <p className="text-xs text-slate-500">
            Signed in as {user.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={purging}
            onClick={handlePurgeEvidence}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-700" />
            <span>{purging ? 'Purging...' : 'Purge >30d Evidence'}</span>
          </button>
          <button
            type="button"
            onClick={() => loadData()}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => adminSignOut()}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

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

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-slate-100 rounded-xl">
        {(
          [
            { id: 'notices', label: `All Notices (${data?.notices.length || 0})` },
            { id: 'claims', label: `All Claims (${data?.claims.length || 0})` },
            {
              id: 'reports',
              label: `Abuse Reports (${data?.reports.filter((r) => r.status === 'open').length || 0})`,
            },
            { id: 'banned', label: `Banned Numbers (${data?.bannedNumbers.length || 0})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {dataLoading || !data ? (
        <div className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      ) : (
        <>
          {/* Tab 1: All Notices */}
          {activeTab === 'notices' && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200">
              {data.notices.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">No notices recorded.</p>
              ) : (
                data.notices.map((n) => {
                  const contact = data.noticeContacts[n.id];
                  const eff = getEffectiveNoticeStatus(n);
                  return (
                    <div
                      key={n.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold uppercase text-slate-600">{n.type}</span>
                          <span className="text-slate-300">·</span>
                          <NoticeStatusIndicator status={eff} />
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500 tabular-nums">{formatShortDate(n.createdAt)}</span>
                        </div>
                        <p className="font-semibold text-sm text-slate-900 break-words">{n.title}</p>
                        <p className="text-xs text-slate-500 break-words">
                          {n.location} · ID: <code className="font-mono break-all">{n.id}</code>
                          {contact && (
                            <>
                              {' '}
                              · Reporter: {contact.reporterName} (
                              <span className="font-mono">{contact.reporterWhatsApp}</span>)
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {contact && (
                          <button
                            type="button"
                            onClick={async () => {
                              await adminBanNumber(
                                contact.reporterWhatsApp,
                                `Banned from notice ${n.id}`
                              );
                              setActionMessage(`Banned ${contact.reporterWhatsApp}`);
                              await loadData();
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-700" />
                            <span>Ban Reporter</span>
                          </button>
                        )}
                        {n.status !== 'removed' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await adminRemoveNotice(n.id);
                              setActionMessage(`Removed notice "${n.title}".`);
                              await loadData();
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800"
                          >
                            Remove Spam
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: All Claims */}
          {activeTab === 'claims' && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200">
              {data.claims.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">No claims recorded.</p>
              ) : (
                data.claims.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <ClaimStatusIndicator status={c.status} />
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500 tabular-nums">
                          {formatShortDate(c.createdAt)}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500 tabular-nums">
                          {c.evidenceUrls.length} evidence file(s)
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-slate-900 break-words">
                        Claim by {c.claimantName}
                      </p>
                      <p className="text-xs text-slate-500 break-words">
                        Claim ID: <code className="font-mono break-all">{c.id}</code> · Notice:{' '}
                        <code className="font-mono break-all">{c.noticeId}</code>
                        {c.claimantWhatsApp && (
                          <>
                            {' '}
                            · WhatsApp: <span className="font-mono">{c.claimantWhatsApp}</span>
                          </>
                        )}
                      </p>
                    </div>

                    {c.claimantWhatsApp && (
                      <button
                        type="button"
                        onClick={async () => {
                          await adminBanNumber(
                            c.claimantWhatsApp!,
                            `Banned from claim ${c.id}`
                          );
                          setActionMessage(`Banned ${c.claimantWhatsApp}`);
                          await loadData();
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 shrink-0"
                      >
                        <Ban className="w-3.5 h-3.5 text-rose-700" />
                        <span>Ban Claimant</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Abuse Reports */}
          {activeTab === 'reports' && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200">
              {data.reports.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">No abuse reports submitted.</p>
              ) : (
                data.reports.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${
                            r.status === 'open' ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {r.status === 'open' ? 'Open Report' : 'Resolved'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="uppercase font-medium text-slate-600">{r.targetType}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500 tabular-nums">{formatShortDate(r.createdAt)}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{r.reason}</p>
                      <p className="text-xs text-slate-500">
                        Target ID: <code className="font-mono">{r.targetId}</code>
                      </p>
                    </div>

                    {r.status === 'open' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await adminResolveReport(r.id);
                          setActionMessage('Report marked as resolved.');
                          await loadData();
                        }}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center gap-1.5 shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolve</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 4: Banned Numbers */}
          {activeTab === 'banned' && (
            <div className="space-y-4">
              <form
                onSubmit={handleBanSubmit}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
              >
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    WhatsApp Number (+256...)
                  </label>
                  <input
                    type="tel"
                    required
                    value={banPhoneInput}
                    onChange={(e) => setBanPhoneInput(e.target.value)}
                    placeholder="+256772123456"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Reason</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    placeholder="Repeated false claims or spam"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800"
                >
                  Ban Number
                </button>
              </form>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200">
                {data.bannedNumbers.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">No numbers currently banned.</p>
                ) : (
                  data.bannedNumbers.map((b) => (
                    <div
                      key={b.phoneNumber}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-mono text-sm font-semibold text-slate-900">
                          {b.phoneNumber}
                        </p>
                        <p className="text-xs text-slate-600 break-words">
                          {b.reason} · Banned {formatShortDate(b.bannedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminUnbanNumber(b.phoneNumber);
                          setActionMessage(`Unbanned ${b.phoneNumber}.`);
                          await loadData();
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Unban</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
