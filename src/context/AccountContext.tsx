import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  extractFriendlyError,
  fetchAccountVault,
  fetchInstitutions,
  markAllNotificationsRead,
  markNotificationRead,
  registerStudentAccount,
  saveClaimToAccountVault,
  saveNoticeToAccountVault,
  seedCampusInstitutionsIfEmpty,
  signInStudentAccount,
  subscribeAccountNotifications,
  subscribeInstitutions,
  updateStudentAccountProfile,
} from '../services/firebase';
import {
  AppNotification,
  CampusInstitution,
  LocalManagedNotice,
  LocalTrackedClaim,
  StudentAccountSession,
} from '../types';
import {
  clearAccountSession,
  clearGuestInstitutionId,
  clearManagedNotices,
  getSavedAccountSession,
  getSavedGuestInstitutionId,
  getSavedManagedNotices,
  getSavedTrackedClaims,
  saveAccountSession,
  saveGuestInstitutionId,
  saveManagedNotice,
  saveTrackedClaim,
} from '../utils/localStorageStore';

interface AccountContextValue {
  account: StudentAccountSession | null;
  institutions: CampusInstitution[];
  institutionsLoading: boolean;
  institutionsError: string | null;
  refreshInstitutions: () => Promise<void>;
  upsertInstitutionLocal: (inst: CampusInstitution) => void;
  removeInstitutionLocal: (institutionId: string) => void;
  guestInstitutionId: string | null;
  setGuestInstitutionId: (id: string | null) => void;
  activeInstitutionId: string | null;
  activeInstitution: CampusInstitution | null;
  notifications: AppNotification[];
  unreadCount: number;
  activeToast: AppNotification | null;
  browserNotifPermission: NotificationPermission | 'unsupported';
  registerAccount: (params: {
    name: string;
    phoneNumber: string;
    pin: string;
    institutionId: string;
    institutionName: string;
  }) => Promise<StudentAccountSession>;
  loginAccount: (params: { phoneNumber: string; pin: string }) => Promise<StudentAccountSession>;
  updateProfile: (params: {
    name: string;
    phoneNumber: string;
    institutionId: string;
    institutionName: string;
  }) => Promise<StudentAccountSession>;
  logoutAccount: () => void;
  saveNoticeToAccount: (entry: LocalManagedNotice, overrideAccessKey?: string) => Promise<void>;
  saveClaimToAccount: (entry: LocalTrackedClaim, overrideAccessKey?: string) => Promise<void>;
  syncVault: (accessKey: string) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  requestBrowserNotifications: () => Promise<void>;
  dismissToast: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function playSoftNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Ignore audio context restrictions
  }
}

function fireBrowserNotification(notif: AppNotification) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(notif.title, {
        body: notif.message,
        tag: notif.id,
      });
    } catch {
      // Fallback safely if browser blocks Notification constructor
    }
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<StudentAccountSession | null>(() =>
    getSavedAccountSession()
  );
  const [institutions, setInstitutions] = useState<CampusInstitution[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [institutionsError, setInstitutionsError] = useState<string | null>(null);
  const [guestInstitutionId, setGuestInstitutionIdState] = useState<string | null>(() =>
    getSavedGuestInstitutionId()
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const initialSnapshotDoneRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const refreshInstitutions = useCallback(async () => {
    try {
      const list = await fetchInstitutions();
      setInstitutions(list);
      setInstitutionsError(null);
    } catch (err) {
      setInstitutionsError(extractFriendlyError(err));
    } finally {
      setInstitutionsLoading(false);
    }
  }, []);

  const upsertInstitutionLocal = useCallback((inst: CampusInstitution) => {
    setInstitutions((prev) => {
      const exists = prev.some((item) => item.id === inst.id);
      const next = exists
        ? prev.map((item) => (item.id === inst.id ? inst : item))
        : [...prev, inst];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setInstitutionsError(null);
    setInstitutionsLoading(false);
  }, []);

  const removeInstitutionLocal = useCallback((institutionId: string) => {
    setInstitutions((prev) => prev.filter((item) => item.id !== institutionId));
  }, []);

  useEffect(() => {
    seedCampusInstitutionsIfEmpty();
    const unsub = subscribeInstitutions(
      (list) => {
        setInstitutions(list);
        setInstitutionsError(null);
        setInstitutionsLoading(false);
      },
      (err) => {
        setInstitutionsError(extractFriendlyError(err));
        setInstitutionsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const setGuestInstitutionId = useCallback((id: string | null) => {
    if (id && id.trim()) {
      saveGuestInstitutionId(id.trim());
      setGuestInstitutionIdState(id.trim());
    } else {
      clearGuestInstitutionId();
      setGuestInstitutionIdState(null);
    }
  }, []);

  const activeInstitutionId = useMemo(() => {
    if (account) {
      return account.institutionId || null;
    }
    if (guestInstitutionId && institutions.length > 0) {
      const exists = institutions.some((inst) => inst.id === guestInstitutionId);
      return exists ? guestInstitutionId : null;
    }
    return guestInstitutionId;
  }, [account, guestInstitutionId, institutions]);

  const activeInstitution = useMemo<CampusInstitution | null>(() => {
    if (!activeInstitutionId) return null;
    const matched = institutions.find((inst) => inst.id === activeInstitutionId);
    if (matched) return matched;
    if (account && account.institutionId === activeInstitutionId) {
      return {
        id: account.institutionId,
        name: account.institutionName || 'Your Institution',
        locations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return null;
  }, [activeInstitutionId, institutions, account]);

  const syncVault = useCallback(async (accessKey: string) => {
    try {
      const remote = await fetchAccountVault(accessKey);
      remote.notices.forEach((n) => saveManagedNotice(n));
      remote.claims.forEach((c) => saveTrackedClaim(c));

      // Also push any locally created notices/claims that aren't in remote vault yet
      const remoteNoticeIds = new Set(remote.notices.map((n) => n.noticeId));
      const remoteClaimIds = new Set(remote.claims.map((c) => c.claimId));
      const localNotices = getSavedManagedNotices();
      const localClaims = getSavedTrackedClaims();

      await Promise.all([
        ...localNotices
          .filter((n) => !remoteNoticeIds.has(n.noticeId))
          .map((n) => saveNoticeToAccountVault(accessKey, n).catch(() => {})),
        ...localClaims
          .filter((c) => !remoteClaimIds.has(c.claimId))
          .map((c) => saveClaimToAccountVault(accessKey, c).catch(() => {})),
      ]);
    } catch {
      // Non-fatal sync error
    }
  }, []);

  useEffect(() => {
    initialSnapshotDoneRef.current = false;
    knownIdsRef.current = new Set();

    if (!account) {
      setNotifications([]);
      setActiveToast(null);
      return;
    }

    syncVault(account.accessKey);

    const hashesToWatch = [account.phoneHash, ...(account.previousPhoneHashes || [])];
    const unsub = subscribeAccountNotifications(hashesToWatch, (rawItems) => {
      const items = account.institutionId
        ? rawItems.filter((n) => !n.institutionId || n.institutionId === account.institutionId)
        : rawItems;

      setNotifications(items);

      if (!initialSnapshotDoneRef.current) {
        initialSnapshotDoneRef.current = true;
        items.forEach((i) => knownIdsRef.current.add(i.id));
        const freshUnread = items.find(
          (i) => !i.read && Date.now() - i.createdAt.getTime() < 30000
        );
        if (freshUnread) {
          setActiveToast(freshUnread);
          playSoftNotificationChime();
          fireBrowserNotification(freshUnread);
        }
        return;
      }

      const newlyArrived = items.filter((i) => !i.read && !knownIdsRef.current.has(i.id));
      items.forEach((i) => knownIdsRef.current.add(i.id));

      if (newlyArrived.length > 0) {
        const latest = newlyArrived[0];
        setActiveToast(latest);
        playSoftNotificationChime();
        fireBrowserNotification(latest);
      }
    });

    return () => unsub();
  }, [account, syncVault]);

  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => setActiveToast(null), 10000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  const registerAccount = useCallback(
    async (params: {
      name: string;
      phoneNumber: string;
      pin: string;
      institutionId: string;
      institutionName: string;
    }) => {
      const session = await registerStudentAccount(params);
      saveAccountSession(session);
      setAccount(session);
      await syncVault(session.accessKey);
      return session;
    },
    [syncVault]
  );

  const loginAccount = useCallback(
    async (params: { phoneNumber: string; pin: string }) => {
      const session = await signInStudentAccount(params);
      saveAccountSession(session);
      setAccount(session);
      await syncVault(session.accessKey);
      return session;
    },
    [syncVault]
  );

  const updateProfile = useCallback(
    async (params: {
      name: string;
      phoneNumber: string;
      institutionId: string;
      institutionName: string;
    }) => {
      if (!account) {
        throw new Error('You must be signed in to update your profile.');
      }
      const updated = await updateStudentAccountProfile({
        currentSession: account,
        newName: params.name,
        newPhoneNumber: params.phoneNumber,
        newInstitutionId: params.institutionId,
        newInstitutionName: params.institutionName,
      });
      saveAccountSession(updated);
      setAccount(updated);
      await syncVault(updated.accessKey);
      return updated;
    },
    [account, syncVault]
  );

  const logoutAccount = useCallback(() => {
    clearAccountSession();
    clearManagedNotices();
    setAccount(null);
    setNotifications([]);
    setActiveToast(null);
  }, []);

  const saveNoticeToAccount = useCallback(
    async (entry: LocalManagedNotice, overrideAccessKey?: string) => {
      const key = overrideAccessKey || account?.accessKey;
      if (!key) return;
      await saveNoticeToAccountVault(key, entry);
    },
    [account]
  );

  const saveClaimToAccount = useCallback(
    async (entry: LocalTrackedClaim, overrideAccessKey?: string) => {
      const key = overrideAccessKey || account?.accessKey;
      if (!key) return;
      await saveClaimToAccountVault(key, entry);
    },
    [account]
  );

  const markAsRead = useCallback(async (notificationId: string) => {
    await markNotificationRead(notificationId);
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    await markAllNotificationsRead(unreadIds);
  }, [notifications]);

  const requestBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotifPermission('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setBrowserNotifPermission(result);
    if (result === 'granted') {
      try {
        new Notification('CampusTrace Alerts Enabled', {
          body: 'You will receive alerts here when someone responds to your notices or reviews your claims.',
        });
      } catch {
        // Ignore
      }
    }
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value: AccountContextValue = {
    account,
    institutions,
    institutionsLoading,
    institutionsError,
    refreshInstitutions,
    upsertInstitutionLocal,
    removeInstitutionLocal,
    guestInstitutionId,
    setGuestInstitutionId,
    activeInstitutionId,
    activeInstitution,
    notifications,
    unreadCount,
    activeToast,
    browserNotifPermission,
    registerAccount,
    loginAccount,
    updateProfile,
    logoutAccount,
    saveNoticeToAccount,
    saveClaimToAccount,
    syncVault,
    markAsRead,
    markAllAsRead,
    requestBrowserNotifications,
    dismissToast: () => setActiveToast(null),
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
}
