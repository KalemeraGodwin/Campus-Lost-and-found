import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Building2,
  CheckCircle2,
  Edit3,
  KeyRound,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { ClaimStatusIndicator, NoticeStatusIndicator } from '../components/StatusText';
import { useAccount } from '../context/AccountContext';
import {
  AdminDashboardData,
  AdminUserSession,
  adminBanNumber,
  adminCreateInstitution,
  adminDeleteInstitution,
  adminFetchDashboardData,
  adminPurgeOldEvidence,
  adminRemoveNotice,
  adminResolveReport,
  adminSetOrUpdatePassword,
  adminSignInWithEmail,
  adminSignOut,
  adminUnbanNumber,
  adminUpdateInstitution,
  extractFriendlyError,
  subscribeAdminAuth,
} from '../services/api';
import { CampusInstitution } from '../types';
import { formatShortDate, getEffectiveNoticeStatus } from '../utils/cryptoAndValidation';

type AdminTab = 'notices' | 'claims' | 'reports' | 'banned' | 'institutions' | 'security';

export function AdminPage() {
  const {
    institutions,
    institutionsLoading,
    institutionsError,
    refreshInstitutions,
    upsertInstitutionLocal,
    removeInstitutionLocal,
  } = useAccount();
  const [user, setUser] = useState<AdminUserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Login Form
  const [email, setEmail] = useState('kalemeragodie@gmail.com');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Dashboard Data
  const [activeTab, setActiveTab] = useState<AdminTab>('institutions');
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ban Number Form
  const [banPhoneInput, setBanPhoneInput] = useState('+256');
  const [banReasonInput, setBanReasonInput] = useState('');
  const [purging, setPurging] = useState(false);

  // Institutions & Locations Management
  const [instSearch, setInstSearch] = useState('');
  const [newInstName, setNewInstName] = useState('');
  const [newInstLocationDraft, setNewInstLocationDraft] = useState('');
  const [newInstLocations, setNewInstLocations] = useState<string[]>([]);
  const [creatingInst, setCreatingInst] = useState(false);
  const [createInstError, setCreateInstError] = useState<string | null>(null);
  const [createInstSuccess, setCreateInstSuccess] = useState<string | null>(null);
  const [locationInputs, setLocationInputs] = useState<Record<string, string>>({});
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [editInstName, setEditInstName] = useState('');
  const [editInstLocations, setEditInstLocations] = useState<string[]>([]);
  const [editNewLocDraft, setEditNewLocDraft] = useState('');
  const [confirmDeleteInstId, setConfirmDeleteInstId] = useState<string | null>(null);
  const [busyInstId, setBusyInstId] = useState<string | null>(null);

  // Admin Password Management
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setActionError(null);
    try {
      const [res] = await Promise.all([adminFetchDashboardData(), refreshInstitutions()]);
      setData(res);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setDataLoading(false);
    }
  }, [refreshInstitutions]);

  useEffect(() => {
    const unsub = subscribeAdminAuth((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadData();
      } else {
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

  function addDraftLocation() {
    const entries = newInstLocationDraft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (entries.length === 0) return;
    setNewInstLocations((prev) => {
      const next = [...prev];
      entries.forEach((item) => {
        if (!next.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
          next.push(item);
        }
      });
      return next.slice(0, 40);
    });
    setNewInstLocationDraft('');
  }

  async function handleCreateInstitution(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    setCreateInstError(null);
    setCreateInstSuccess(null);
    setCreatingInst(true);
    try {
      const pendingEntries = newInstLocationDraft
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      const combined = [...newInstLocations, ...pendingEntries];
      const created = await adminCreateInstitution({
        name: newInstName,
        locations: combined,
      });
      upsertInstitutionLocal(created);
      setInstSearch('');
      await refreshInstitutions();
      setNewInstName('');
      setNewInstLocationDraft('');
      setNewInstLocations([]);
      const msg = `Added institution "${created.name}" with ${created.locations.length} campus location(s).`;
      setCreateInstSuccess(msg);
      setActionMessage(msg);
    } catch (err) {
      const msg = extractFriendlyError(err);
      setCreateInstError(msg);
      setActionError(msg);
    } finally {
      setCreatingInst(false);
    }
  }

  function startEditingInstitution(inst: CampusInstitution) {
    setEditingInstId(inst.id);
    setEditInstName(inst.name);
    setEditInstLocations([...inst.locations]);
    setEditNewLocDraft('');
    setConfirmDeleteInstId(null);
    setActionError(null);
  }

  function addEditLocationDraft() {
    const entries = editNewLocDraft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (entries.length === 0) return;
    setEditInstLocations((prev) => {
      const next = [...prev];
      entries.forEach((item) => {
        if (!next.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
          next.push(item);
        }
      });
      return next.slice(0, 40);
    });
    setEditNewLocDraft('');
  }

  async function handleSaveEditInstitution(inst: CampusInstitution, e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    setBusyInstId(inst.id);
    try {
      const pendingEntries = editNewLocDraft
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      const combinedLocations = [...editInstLocations, ...pendingEntries];
      await adminUpdateInstitution(inst.id, {
        name: editInstName,
        locations: combinedLocations,
        previousName: inst.name,
      });
      upsertInstitutionLocal({
        ...inst,
        name: editInstName.trim(),
        locations: combinedLocations.map((s) => s.trim()).filter((s) => s.length >= 2),
        updatedAt: new Date(),
      });
      await refreshInstitutions();
      setEditingInstId(null);
      setEditNewLocDraft('');
      setActionMessage(`Saved changes to "${editInstName.trim()}".`);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setBusyInstId(null);
    }
  }

  async function handleAddLocationToInstitution(inst: CampusInstitution, e: FormEvent) {
    e.preventDefault();
    const raw = (locationInputs[inst.id] || '').trim();
    if (raw.length < 2) return;
    setActionError(null);
    setActionMessage(null);
    setBusyInstId(inst.id);
    try {
      const extras = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      const nextLocs = [...inst.locations, ...extras];
      await adminUpdateInstitution(inst.id, {
        name: inst.name,
        locations: nextLocs,
      });
      upsertInstitutionLocal({
        ...inst,
        locations: nextLocs,
        updatedAt: new Date(),
      });
      await refreshInstitutions();
      setLocationInputs((prev) => ({ ...prev, [inst.id]: '' }));
      setActionMessage(`Updated campus locations for ${inst.name}.`);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setBusyInstId(null);
    }
  }

  async function handleRemoveLocationFromInstitution(inst: CampusInstitution, locationToRemove: string) {
    setActionError(null);
    setActionMessage(null);
    setBusyInstId(inst.id);
    try {
      const nextLocs = inst.locations.filter((loc) => loc !== locationToRemove);
      await adminUpdateInstitution(inst.id, {
        name: inst.name,
        locations: nextLocs,
      });
      upsertInstitutionLocal({
        ...inst,
        locations: nextLocs,
        updatedAt: new Date(),
      });
      await refreshInstitutions();
      setActionMessage(`Removed "${locationToRemove}" from ${inst.name}.`);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setBusyInstId(null);
    }
  }

  async function handleDeleteInstitution(inst: CampusInstitution) {
    setActionError(null);
    setActionMessage(null);
    setBusyInstId(inst.id);
    try {
      await adminDeleteInstitution(inst.id);
      removeInstitutionLocal(inst.id);
      await refreshInstitutions();
      setConfirmDeleteInstId(null);
      setActionMessage(`Removed institution "${inst.name}".`);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setBusyInstId(null);
    }
  }

  async function handleSaveAdminPassword(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    if (newAdminPassword.trim().length < 6) {
      setActionError('Admin password must be at least 6 characters.');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setActionError('Passwords do not match.');
      return;
    }
    setSavingAdminPassword(true);
    try {
      await adminSetOrUpdatePassword(newAdminPassword);
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setActionMessage(`Updated the administrator password for ${user?.email} in MongoDB.`);
    } catch (err) {
      setActionError(extractFriendlyError(err));
    } finally {
      setSavingAdminPassword(false);
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto h-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">Admin Console Login</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sign in with your authorized campus administrator account to manage institutions, campus locations, notices, and banned numbers.
          </p>
        </div>

        <form onSubmit={handleEmailLogin} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Admin Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@campus.ac.ug"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
            />
          </div>

          {loginError && (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/45 border border-rose-200 dark:border-rose-800/70 rounded-xl p-3" role="alert">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50"
          >
            {signingIn ? 'Signing in...' : 'Sign In to Admin Console'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Admin Moderation Console
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Signed in as {user.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={purging}
            onClick={handlePurgeEvidence}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
            <span>{purging ? 'Purging...' : 'Purge >30d Evidence'}</span>
          </button>
          <button
            type="button"
            onClick={() => loadData()}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => adminSignOut()}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-white inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-4 py-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        {(
          [
            { id: 'institutions', label: `Institutions & Locations (${institutions.length})` },
            { id: 'notices', label: `All Notices (${data?.notices.length || 0})` },
            { id: 'claims', label: `All Claims (${data?.claims.length || 0})` },
            {
              id: 'reports',
              label: `Abuse Reports (${data?.reports.filter((r) => r.status === 'open').length || 0})`,
            },
            { id: 'banned', label: `Banned Numbers (${data?.bannedNumbers.length || 0})` },
            { id: 'security', label: 'Admin Password' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'security' ? (
        <div className="max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Update Admin Password</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Update the password for your administrator account (<span className="font-mono">{user.email}</span>) stored securely in MongoDB.
            </p>
          </div>

          <form onSubmit={handleSaveAdminPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-admin-pw" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                New Admin Password (min. 6 characters)
              </label>
              <input
                id="new-admin-pw"
                type="password"
                required
                minLength={6}
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-admin-pw" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirm New Password
              </label>
              <input
                id="confirm-admin-pw"
                type="password"
                required
                minLength={6}
                value={confirmAdminPassword}
                onChange={(e) => setConfirmAdminPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={savingAdminPassword}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-50"
            >
              {savingAdminPassword ? 'Saving Password...' : 'Update Admin Password'}
            </button>
          </form>
        </div>
      ) : activeTab === 'institutions' ? (
        <div className="space-y-6">
          {/* Create Institution + Locations Form */}
          <form
            onSubmit={handleCreateInstitution}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4"
          >
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Add Campus Institution &amp; Possible Locations</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Students select from these institutions when creating an account, and only see notices and campus locations attached to their institution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="new-inst-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Institution / University Name
                </label>
                <input
                  id="new-inst-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={newInstName}
                  onChange={(e) => setNewInstName(e.target.value)}
                  placeholder="e.g. Makerere University Business School"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-inst-loc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Add Possible Campus Locations (comma-separated or one at a time)
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-inst-loc"
                    type="text"
                    value={newInstLocationDraft}
                    onChange={(e) => setNewInstLocationDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDraftLocation();
                      }
                    }}
                    placeholder="e.g. Main Library, Block A, Security Desk"
                    className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={addDraftLocation}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>

            {newInstLocations.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Staged Locations ({newInstLocations.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {newInstLocations.map((loc) => (
                    <span
                      key={loc}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      <MapPin className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                      <span>{loc}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewInstLocations((prev) => prev.filter((item) => item !== loc))
                        }
                        aria-label={`Remove ${loc}`}
                        className="text-slate-400 dark:text-slate-500 hover:text-rose-700 dark:hover:text-rose-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {createInstError && (
              <p className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200" role="alert">
                {createInstError}
              </p>
            )}
            {createInstSuccess && (
              <p className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                {createInstSuccess}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creatingInst}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{creatingInst ? 'Saving Institution...' : 'Create Institution'}</span>
              </button>
            </div>
          </form>

          {/* Existing Institutions & Location Lists */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Added Campus Institutions ({institutions.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  View all configured institutions, edit their names, or update their campus locations.
                </p>
              </div>
              {institutions.length > 0 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={instSearch}
                    onChange={(e) => setInstSearch(e.target.value)}
                    placeholder="Filter institutions or locations..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>

            {institutionsError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/45 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
                Could not load institutions: {institutionsError}
              </div>
            )}

            {institutionsLoading ? (
              <div className="h-36 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
            ) : institutions.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-500 dark:text-slate-400">
                No campus institutions configured yet. Create your first institution above.
              </div>
            ) : (
              (() => {
                const q = instSearch.trim().toLowerCase();
                const visibleInstitutions = q
                  ? institutions.filter(
                      (inst) =>
                        inst.name.toLowerCase().includes(q) ||
                        inst.locations.some((l) => l.toLowerCase().includes(q))
                    )
                  : institutions;

                if (visibleInstitutions.length === 0) {
                  return (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-500 dark:text-slate-400">
                      No added institutions match "{instSearch}".
                    </div>
                  );
                }

                return visibleInstitutions.map((inst) => {
                  const isBusy = busyInstId === inst.id;
                  const isEditing = editingInstId === inst.id;
                  const isConfirmDelete = confirmDeleteInstId === inst.id;
                  const noticeCount =
                    data?.notices.filter((n) => n.institutionId === inst.id).length || 0;

                  if (isEditing) {
                    return (
                      <form
                        key={inst.id}
                        onSubmit={(e) => handleSaveEditInstitution(inst, e)}
                        className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-700 dark:border-emerald-500 p-4 sm:p-6 space-y-5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div>
                            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                              Edit Institution &amp; Locations
                            </h3>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{inst.id}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingInstId(null)}
                            className="self-start sm:self-auto min-h-[34px] px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor={`edit-inst-name-${inst.id}`}
                            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                          >
                            Institution Name
                          </label>
                          <input
                            id={`edit-inst-name-${inst.id}`}
                            type="text"
                            required
                            minLength={2}
                            maxLength={100}
                            value={editInstName}
                            onChange={(e) => setEditInstName(e.target.value)}
                            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                          />
                        </div>

                        <div className="space-y-2.5">
                          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Campus Locations ({editInstLocations.length})
                          </span>
                          {editInstLocations.length === 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              No locations listed yet. Add locations below.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {editInstLocations.map((loc, idx) => (
                                <div key={`${inst.id}-loc-${idx}`} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    required
                                    minLength={2}
                                    maxLength={120}
                                    value={loc}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditInstLocations((prev) =>
                                        prev.map((item, i) => (i === idx ? val : item))
                                      );
                                    }}
                                    className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditInstLocations((prev) =>
                                        prev.filter((_, i) => i !== idx)
                                      )
                                    }
                                    aria-label={`Remove location ${loc}`}
                                    className="min-h-[38px] px-2.5 rounded-xl border border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              value={editNewLocDraft}
                              onChange={(e) => setEditNewLocDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addEditLocationDraft();
                                }
                              }}
                              placeholder="Add more locations (comma-separated or one at a time)..."
                              className="flex-1 min-w-0 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={addEditLocationDraft}
                              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0 inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setEditingInstId(null)}
                            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isBusy}
                            className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {isBusy ? 'Saving Changes...' : 'Save Changes'}
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <section
                      key={inst.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 break-words">
                              {inst.name}
                            </h3>
                            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              · {inst.locations.length} campus location{inst.locations.length === 1 ? '' : 's'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              · {noticeCount} notice{noticeCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                            {inst.id} · Updated {formatShortDate(inst.updatedAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditingInstitution(inst)}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                            <span>Edit Institution</span>
                          </button>
                          {isConfirmDelete ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDeleteInstitution(inst)}
                                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-700 dark:bg-rose-600 text-white text-xs font-semibold hover:bg-rose-800 dark:hover:bg-rose-500"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteInstId(null)}
                                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteInstId(inst.id)}
                              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Locations list */}
                      <div className="space-y-3">
                        {inst.locations.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            No campus locations added yet. Add locations below so reporters at {inst.name} can select them.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {inst.locations.map((loc) => (
                              <span
                                key={loc}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
                              >
                                <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                                <span>{loc}</span>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRemoveLocationFromInstitution(inst, loc)}
                                  aria-label={`Remove ${loc} from ${inst.name}`}
                                  className="ml-0.5 text-slate-400 dark:text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 disabled:opacity-40"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <form
                          onSubmit={(e) => handleAddLocationToInstitution(inst, e)}
                          className="flex flex-col sm:flex-row gap-2 pt-1"
                        >
                          <input
                            type="text"
                            required
                            minLength={2}
                            value={locationInputs[inst.id] || ''}
                            onChange={(e) =>
                              setLocationInputs((prev) => ({ ...prev, [inst.id]: e.target.value }))
                            }
                            placeholder={`Add new location at ${inst.name} (comma-separated supported)...`}
                            className="flex-1 min-w-0 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                          />
                          <button
                            type="submit"
                            disabled={isBusy}
                            className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Location</span>
                          </button>
                        </form>
                      </div>
                    </section>
                  );
                });
              })()
            )}
          </div>
        </div>
      ) : dataLoading || !data ? (
        <div className="h-48 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
      ) : (
        <>
          {/* Tab 1: All Notices */}
          {activeTab === 'notices' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {data.notices.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No notices recorded.</p>
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
                          <span className="font-semibold uppercase text-slate-600 dark:text-slate-300">{n.type}</span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <NoticeStatusIndicator status={eff} />
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">{n.institutionName}</span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">{formatShortDate(n.createdAt)}</span>
                        </div>
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 break-words">{n.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
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
                            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
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
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-700 dark:bg-rose-600 text-white text-xs font-semibold hover:bg-rose-800 dark:hover:bg-rose-500"
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {data.claims.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No claims recorded.</p>
              ) : (
                data.claims.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <ClaimStatusIndicator status={c.status} />
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatShortDate(c.createdAt)}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {c.evidenceUrls.length} evidence file(s)
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 break-words">
                        Claim by {c.claimantName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
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
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
                      >
                        <Ban className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {data.reports.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No abuse reports submitted.</p>
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
                            r.status === 'open' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {r.status === 'open' ? 'Open Report' : 'Resolved'}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="uppercase font-medium text-slate-600 dark:text-slate-300">{r.targetType}</span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">{formatShortDate(r.createdAt)}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.reason}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
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
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 inline-flex items-center gap-1.5 shrink-0"
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
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
              >
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    WhatsApp Number (+256...)
                  </label>
                  <input
                    type="tel"
                    required
                    value={banPhoneInput}
                    onChange={(e) => setBanPhoneInput(e.target.value)}
                    placeholder="+256772123456"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Reason</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    placeholder="Repeated false claims or spam"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-700 dark:bg-rose-600 text-white text-sm font-semibold hover:bg-rose-800 dark:hover:bg-rose-500"
                >
                  Ban Number
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                {data.bannedNumbers.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No numbers currently banned.</p>
                ) : (
                  data.bannedNumbers.map((b) => (
                    <div
                      key={b.phoneNumber}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {b.phoneNumber}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 break-words">
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
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
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
