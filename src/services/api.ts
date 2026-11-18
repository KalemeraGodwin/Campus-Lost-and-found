import {
  AbuseReport,
  AppNotification,
  BannedNumber,
  CAMPUS_LOCATIONS,
  CampusInstitution,
  ClaimAnswer,
  ClaimHandover,
  ClaimRecord,
  LocalManagedNotice,
  LocalTrackedClaim,
  NoticeSecret,
  NoticeType,
  NotificationKind,
  PublicNotice,
  StudentAccountSession,
  VerificationQuestion,
} from '../types';
import {
  compressImageToDataUrl,
  isValidUgPhone,
  normalizeUgPhone,
} from '../utils/cryptoAndValidation';

const ADMIN_TOKEN_KEY = 'campustrace_admin_token_v1';

export interface AdminUserSession {
  email: string;
}

const EVT_INSTITUTIONS = 'campustrace:institutions-updated';
const EVT_NOTICES = 'campustrace:notices-updated';
const EVT_NOTIFICATIONS = 'campustrace:notifications-updated';
const EVT_ADMIN_AUTH = 'campustrace:admin-auth-updated';

function emitEvent(name: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name));
  }
}

export function extractFriendlyError(err: unknown): string {
  if (!(err instanceof Error)) return 'An unexpected error occurred.';
  return err.message || 'An unexpected error occurred.';
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function hydrateInstitution(raw: Record<string, unknown>): CampusInstitution {
  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    locations: Array.isArray(raw.locations) ? raw.locations.map(String).filter(Boolean) : [],
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

function hydrateNotice(raw: Record<string, unknown>): PublicNotice {
  return {
    id: String(raw.id || ''),
    type: (raw.type as NoticeType) || 'found',
    status: (raw.status as PublicNotice['status']) || 'open',
    category: String(raw.category || 'Other'),
    title: String(raw.title || ''),
    publicDescription: String(raw.publicDescription || ''),
    location: String(raw.location || ''),
    institutionId: String(raw.institutionId || 'inst_makerere'),
    institutionName: String(raw.institutionName || 'Makerere University'),
    itemDate: String(raw.itemDate || ''),
    photos: Array.isArray(raw.photos) ? raw.photos.map(String) : [],
    reporterFirstName: String(raw.reporterFirstName || 'Student'),
    verificationPrompts: Array.isArray(raw.verificationPrompts)
      ? raw.verificationPrompts.map(String)
      : [],
    reporterPhoneHash: String(raw.reporterPhoneHash || ''),
    approvedClaimId: raw.approvedClaimId ? String(raw.approvedClaimId) : null,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    closedAt: raw.closedAt ? toDate(raw.closedAt) : null,
  };
}

function hydrateClaim(raw: Record<string, unknown>): ClaimRecord {
  return {
    id: String(raw.id || ''),
    claimCodeHash: String(raw.claimCodeHash || ''),
    noticeId: String(raw.noticeId || ''),
    claimantName: String(raw.claimantName || ''),
    claimantPhoneHash: String(raw.claimantPhoneHash || ''),
    answers: Array.isArray(raw.answers) ? (raw.answers as ClaimAnswer[]) : [],
    evidenceUrls: Array.isArray(raw.evidenceUrls) ? raw.evidenceUrls.map(String) : [],
    status: (raw.status as ClaimRecord['status']) || 'pending',
    rejectionReason: raw.rejectionReason ? String(raw.rejectionReason) : null,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    ...(raw.claimantWhatsApp ? { claimantWhatsApp: String(raw.claimantWhatsApp) } : {}),
  };
}

function hydrateNotification(raw: Record<string, unknown>): AppNotification {
  return {
    id: String(raw.id || ''),
    recipientPhoneHash: String(raw.recipientPhoneHash || ''),
    institutionId: raw.institutionId ? String(raw.institutionId) : undefined,
    kind: (raw.kind as NotificationKind) || 'new_claim',
    noticeId: String(raw.noticeId || ''),
    claimId: String(raw.claimId || ''),
    title: String(raw.title || ''),
    message: String(raw.message || ''),
    read: Boolean(raw.read),
    createdAt: toDate(raw.createdAt),
  };
}

function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAdminToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit & { adminAuth?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.adminAuth) {
    const token = getAdminToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        throw new Error(`Server error (${res.status}).`);
      }
    }
  }

  if (!res.ok) {
    if (res.status === 401 && options.adminAuth) {
      setAdminToken(null);
      emitEvent(EVT_ADMIN_AUTH);
    }
    const msg =
      typeof json.error === 'string' && json.error
        ? json.error
        : `Request failed (${res.status}).`;
    throw new Error(msg);
  }

  return json as T;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function prepareMediaDataUrl(
  folder: 'notices' | 'claims',
  file: File
): Promise<string> {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';

  if (!isImage && !(folder === 'claims' && isPdf)) {
    throw new Error(
      folder === 'notices'
        ? 'Only image files (JPG, PNG, WebP) are allowed for item photos.'
        : 'Only image files or PDF documents are allowed for evidence.'
    );
  }

  if (isImage) {
    const compressed = await compressImageToDataUrl(file, 880, 0.72);
    if (compressed.length > 360000) {
      return await compressImageToDataUrl(file, 640, 0.56);
    }
    return compressed;
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error('PDF evidence files must be under 2 MB.');
  }
  return await fileToDataUrl(file);
}

export const FALLBACK_INSTITUTIONS: CampusInstitution[] = [
  {
    id: 'inst_makerere',
    name: 'Makerere University',
    locations: [...CAMPUS_LOCATIONS],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// --- Seeding ---

let seedInstDone = false;
export async function seedCampusInstitutionsIfEmpty(): Promise<void> {
  if (seedInstDone) return;
  seedInstDone = true;
  try {
    await apiRequest('/api/seed', { method: 'POST' });
  } catch {
    seedInstDone = false;
  }
}

let seedNoticesDone = false;
export async function seedCampusNoticesIfEmpty(): Promise<void> {
  if (seedNoticesDone) return;
  seedNoticesDone = true;
  try {
    await apiRequest('/api/seed', { method: 'POST' });
  } catch {
    seedNoticesDone = false;
  }
}

// --- Institutions ---

export async function fetchInstitutions(): Promise<CampusInstitution[]> {
  const data = await apiRequest<{ institutions: Record<string, unknown>[] }>('/api/institutions');
  return (data.institutions || []).map(hydrateInstitution);
}

export function subscribeInstitutions(
  onData: (institutions: CampusInstitution[]) => void,
  onError?: (err: Error) => void
): () => void {
  let active = true;

  const load = async () => {
    try {
      const items = await fetchInstitutions();
      if (active) onData(items);
    } catch (err) {
      if (active && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  load();
  const interval = window.setInterval(load, 15000);
  const handleEvent = () => {
    load();
  };
  window.addEventListener(EVT_INSTITUTIONS, handleEvent);

  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener(EVT_INSTITUTIONS, handleEvent);
  };
}

export async function adminCreateInstitution(params: {
  name: string;
  locations: string[];
}): Promise<CampusInstitution> {
  const data = await apiRequest<{ institution: Record<string, unknown> }>('/api/institutions', {
    method: 'POST',
    adminAuth: true,
    body: JSON.stringify(params),
  });
  emitEvent(EVT_INSTITUTIONS);
  return hydrateInstitution(data.institution);
}

export async function adminUpdateInstitution(
  institutionId: string,
  params: { name: string; locations: string[]; previousName?: string }
): Promise<void> {
  await apiRequest(`/api/institutions/${encodeURIComponent(institutionId)}`, {
    method: 'PUT',
    adminAuth: true,
    body: JSON.stringify(params),
  });
  emitEvent(EVT_INSTITUTIONS);
  emitEvent(EVT_NOTICES);
}

export async function adminDeleteInstitution(institutionId: string): Promise<void> {
  await apiRequest(`/api/institutions/${encodeURIComponent(institutionId)}`, {
    method: 'DELETE',
    adminAuth: true,
  });
  emitEvent(EVT_INSTITUTIONS);
}

// --- Public Notices ---

export function subscribePublicNotices(
  institutionId: string | null,
  onData: (notices: PublicNotice[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!institutionId) {
    onData([]);
    return () => {};
  }

  let active = true;

  const load = async () => {
    try {
      const data = await apiRequest<{ notices: Record<string, unknown>[] }>(
        `/api/notices?institutionId=${encodeURIComponent(institutionId)}`
      );
      if (active) {
        onData((data.notices || []).map(hydrateNotice));
      }
    } catch (err) {
      if (active && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  load();
  const interval = window.setInterval(load, 12000);
  const handleEvent = () => {
    load();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') load();
  };
  window.addEventListener(EVT_NOTICES, handleEvent);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener(EVT_NOTICES, handleEvent);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

export async function getNoticeById(noticeId: string): Promise<PublicNotice | null> {
  try {
    const data = await apiRequest<{ notice: Record<string, unknown> }>(
      `/api/notices/${encodeURIComponent(noticeId)}`
    );
    return data.notice ? hydrateNotice(data.notice) : null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return null;
    }
    throw err;
  }
}

export interface CreateNoticeInput {
  type: NoticeType;
  category: string;
  title: string;
  publicDescription: string;
  location: string;
  institutionId: string;
  institutionName: string;
  itemDate: string;
  photoFiles: File[];
  verificationQuestions: VerificationQuestion[];
  reporterName: string;
  reporterWhatsApp: string;
}

export async function createNotice(
  input: CreateNoticeInput
): Promise<{ noticeId: string; managementToken: string; notice: PublicNotice }> {
  const normalizedPhone = normalizeUgPhone(input.reporterWhatsApp);
  if (!isValidUgPhone(normalizedPhone)) {
    throw new Error('WhatsApp number must match +256 followed by 9 digits (e.g. +256772123456).');
  }

  if (input.photoFiles.length < 1) {
    throw new Error('Please upload at least 1 photo of the item.');
  }

  const photos = await Promise.all(
    input.photoFiles.slice(0, 5).map((file) => prepareMediaDataUrl('notices', file))
  );

  const data = await apiRequest<{
    noticeId: string;
    managementToken: string;
    notice: Record<string, unknown>;
  }>('/api/notices', {
    method: 'POST',
    body: JSON.stringify({
      type: input.type,
      category: input.category,
      title: input.title,
      publicDescription: input.publicDescription,
      location: input.location,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      itemDate: input.itemDate,
      photos,
      verificationQuestions: input.verificationQuestions,
      reporterName: input.reporterName,
      reporterWhatsApp: normalizedPhone,
    }),
  });

  emitEvent(EVT_NOTICES);
  return {
    noticeId: data.noticeId,
    managementToken: data.managementToken,
    notice: hydrateNotice(data.notice),
  };
}

export interface ManagedNoticeBundle {
  notice: PublicNotice;
  secret: NoticeSecret;
  claims: ClaimRecord[];
  managementToken: string;
}

export async function getNoticeBundleByToken(rawToken: string): Promise<ManagedNoticeBundle | null> {
  const token = rawToken.trim();
  if (!token) return null;
  try {
    const data = await apiRequest<{
      notice: Record<string, unknown>;
      secret: Record<string, unknown>;
      claims: Record<string, unknown>[];
      managementToken: string;
    }>(`/api/manage-notice?token=${encodeURIComponent(token)}`);

    return {
      notice: hydrateNotice(data.notice),
      secret: {
        noticeId: String(data.secret.noticeId || ''),
        reporterName: String(data.secret.reporterName || ''),
        reporterWhatsApp: String(data.secret.reporterWhatsApp || ''),
        verificationQuestions: Array.isArray(data.secret.verificationQuestions)
          ? (data.secret.verificationQuestions as VerificationQuestion[])
          : [],
        createdAt: toDate(data.secret.createdAt),
      },
      claims: (data.claims || []).map(hydrateClaim),
      managementToken: data.managementToken,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return null;
    }
    throw err;
  }
}

export async function updateNoticeDetails(
  noticeId: string,
  updates: {
    title: string;
    publicDescription: string;
    location: string;
    category: string;
    itemDate: string;
  }
): Promise<void> {
  await apiRequest(`/api/notices/${encodeURIComponent(noticeId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  emitEvent(EVT_NOTICES);
}

export async function markNoticeReturned(noticeId: string): Promise<void> {
  await apiRequest(`/api/notices/${encodeURIComponent(noticeId)}/return`, {
    method: 'POST',
  });
  emitEvent(EVT_NOTICES);
}

export async function approveClaimOnNotice(params: {
  noticeId: string;
  claimId: string;
  claimCodeHash: string;
  reporterName: string;
  reporterWhatsApp: string;
}): Promise<void> {
  await apiRequest(`/api/claims/${encodeURIComponent(params.claimId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      noticeId: params.noticeId,
      claimCodeHash: params.claimCodeHash,
      reporterName: params.reporterName,
      reporterWhatsApp: params.reporterWhatsApp,
    }),
  });
  emitEvent(EVT_NOTICES);
  emitEvent(EVT_NOTIFICATIONS);
}

export async function rejectClaimOnNotice(params: {
  noticeId: string;
  claimId: string;
  rejectionReason: string;
  wasApproved: boolean;
}): Promise<void> {
  await apiRequest(`/api/claims/${encodeURIComponent(params.claimId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({
      noticeId: params.noticeId,
      rejectionReason: params.rejectionReason,
      wasApproved: params.wasApproved,
    }),
  });
  emitEvent(EVT_NOTICES);
  emitEvent(EVT_NOTIFICATIONS);
}

export interface SubmitClaimInput {
  noticeId: string;
  claimantName: string;
  claimantWhatsApp: string;
  answers: ClaimAnswer[];
  evidenceFiles: File[];
}

export async function submitClaim(
  input: SubmitClaimInput
): Promise<{ claimId: string; claimCode: string }> {
  const normalizedPhone = normalizeUgPhone(input.claimantWhatsApp);
  if (!isValidUgPhone(normalizedPhone)) {
    throw new Error('WhatsApp number must match +256 followed by 9 digits (e.g. +256772123456).');
  }

  if (input.evidenceFiles.length < 1) {
    throw new Error('Please upload at least 1 evidence file (photo, receipt, or redacted ID).');
  }

  const evidenceUrls = await Promise.all(
    input.evidenceFiles.slice(0, 5).map((file) => prepareMediaDataUrl('claims', file))
  );

  const data = await apiRequest<{ claimId: string; claimCode: string }>('/api/claims', {
    method: 'POST',
    body: JSON.stringify({
      noticeId: input.noticeId,
      claimantName: input.claimantName,
      claimantWhatsApp: normalizedPhone,
      answers: input.answers,
      evidenceUrls,
    }),
  });

  emitEvent(EVT_NOTIFICATIONS);
  return data;
}

export interface TrackedClaimBundle {
  claim: ClaimRecord;
  notice: PublicNotice | null;
  handover: ClaimHandover | null;
}

export async function trackClaimByCode(rawCode: string): Promise<TrackedClaimBundle | null> {
  const normalizedCode = rawCode.trim().toUpperCase();
  if (!normalizedCode) return null;

  try {
    const data = await apiRequest<{
      claim: Record<string, unknown>;
      notice: Record<string, unknown> | null;
      handover: Record<string, unknown> | null;
    }>(`/api/claims/track?code=${encodeURIComponent(normalizedCode)}`);

    return {
      claim: hydrateClaim(data.claim),
      notice: data.notice ? hydrateNotice(data.notice) : null,
      handover: data.handover
        ? {
            claimId: String(data.handover.claimId || ''),
            noticeId: String(data.handover.noticeId || ''),
            reporterName: String(data.handover.reporterName || ''),
            reporterWhatsApp: String(data.handover.reporterWhatsApp || ''),
            approvedAt: toDate(data.handover.approvedAt),
          }
        : null,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return null;
    }
    throw err;
  }
}

export async function resubmitRejectedClaim(params: {
  claimId: string;
  answers: ClaimAnswer[];
  newEvidenceFiles: File[];
  existingEvidenceUrls: string[];
}): Promise<void> {
  const uploadedNew = await Promise.all(
    params.newEvidenceFiles.slice(0, 5).map((file) => prepareMediaDataUrl('claims', file))
  );
  const combinedEvidence = [...params.existingEvidenceUrls, ...uploadedNew].slice(0, 5);
  if (combinedEvidence.length < 1) {
    throw new Error('At least 1 evidence file is required.');
  }

  await apiRequest(`/api/claims/${encodeURIComponent(params.claimId)}/resubmit`, {
    method: 'POST',
    body: JSON.stringify({
      answers: params.answers,
      evidenceUrls: combinedEvidence,
    }),
  });
  emitEvent(EVT_NOTIFICATIONS);
}

export async function submitAbuseReport(params: {
  targetType: 'notice' | 'claim';
  targetId: string;
  reason: string;
}): Promise<void> {
  await apiRequest('/api/reports', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// --- Admin Auth & Moderation Services ---

export function subscribeAdminAuth(callback: (user: AdminUserSession | null) => void): () => void {
  let active = true;

  const check = async () => {
    const token = getAdminToken();
    if (!token) {
      if (active) callback(null);
      return;
    }
    try {
      const data = await apiRequest<{ admin: AdminUserSession }>('/api/admin/me', {
        adminAuth: true,
      });
      if (active) callback(data.admin);
    } catch {
      setAdminToken(null);
      if (active) callback(null);
    }
  };

  check();
  const handleEvent = () => {
    check();
  };
  window.addEventListener(EVT_ADMIN_AUTH, handleEvent);
  return () => {
    active = false;
    window.removeEventListener(EVT_ADMIN_AUTH, handleEvent);
  };
}

export async function adminSignInWithEmail(
  email: string,
  password: string
): Promise<AdminUserSession> {
  const data = await apiRequest<{ token: string; admin: AdminUserSession }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
  setAdminToken(data.token);
  emitEvent(EVT_ADMIN_AUTH);
  return data.admin;
}

export async function adminSignOut(): Promise<void> {
  setAdminToken(null);
  emitEvent(EVT_ADMIN_AUTH);
}

export async function adminSetOrUpdatePassword(newPassword: string): Promise<'updated'> {
  await apiRequest('/api/admin/password', {
    method: 'PUT',
    adminAuth: true,
    body: JSON.stringify({ newPassword }),
  });
  return 'updated';
}

export interface AdminDashboardData {
  notices: PublicNotice[];
  noticeContacts: Record<string, { reporterName: string; reporterWhatsApp: string }>;
  claims: ClaimRecord[];
  reports: AbuseReport[];
  bannedNumbers: BannedNumber[];
}

export async function adminFetchDashboardData(): Promise<AdminDashboardData> {
  const data = await apiRequest<{
    notices: Record<string, unknown>[];
    noticeContacts: Record<string, { reporterName: string; reporterWhatsApp: string }>;
    claims: Record<string, unknown>[];
    reports: Record<string, unknown>[];
    bannedNumbers: Record<string, unknown>[];
  }>('/api/admin/dashboard', { adminAuth: true });

  return {
    notices: (data.notices || []).map(hydrateNotice),
    noticeContacts: data.noticeContacts || {},
    claims: (data.claims || []).map(hydrateClaim),
    reports: (data.reports || []).map((r) => ({
      id: String(r.id || ''),
      targetType: (r.targetType as 'notice' | 'claim') || 'notice',
      targetId: String(r.targetId || ''),
      reason: String(r.reason || ''),
      status: (r.status as 'open' | 'resolved') || 'open',
      createdAt: toDate(r.createdAt),
    })),
    bannedNumbers: (data.bannedNumbers || []).map((b) => ({
      phoneNumber: String(b.phoneNumber || ''),
      reason: String(b.reason || ''),
      bannedAt: toDate(b.bannedAt),
    })),
  };
}

export async function adminRemoveNotice(noticeId: string): Promise<void> {
  await apiRequest(`/api/admin/notices/${encodeURIComponent(noticeId)}/remove`, {
    method: 'POST',
    adminAuth: true,
  });
  emitEvent(EVT_NOTICES);
}

export async function adminBanNumber(phoneInput: string, reason: string): Promise<void> {
  await apiRequest('/api/admin/banned', {
    method: 'POST',
    adminAuth: true,
    body: JSON.stringify({ phoneNumber: phoneInput, reason }),
  });
}

export async function adminUnbanNumber(phoneNumber: string): Promise<void> {
  await apiRequest(`/api/admin/banned/${encodeURIComponent(phoneNumber)}`, {
    method: 'DELETE',
    adminAuth: true,
  });
}

export async function adminResolveReport(reportId: string): Promise<void> {
  await apiRequest(`/api/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: 'POST',
    adminAuth: true,
  });
}

export async function adminPurgeOldEvidence(): Promise<{ purgedClaims: number }> {
  return await apiRequest<{ purgedClaims: number }>('/api/admin/purge-evidence', {
    method: 'POST',
    adminAuth: true,
  });
}

// --- Student Follow-Up Account & Notifications ---

export async function registerStudentAccount(params: {
  name: string;
  phoneNumber: string;
  pin: string;
  institutionId: string;
  institutionName: string;
}): Promise<StudentAccountSession> {
  const data = await apiRequest<{ session: StudentAccountSession }>('/api/accounts/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.session;
}

export async function signInStudentAccount(params: {
  phoneNumber: string;
  pin: string;
}): Promise<StudentAccountSession> {
  const data = await apiRequest<{ session: StudentAccountSession }>('/api/accounts/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.session;
}

export async function updateStudentAccountProfile(params: {
  currentSession: StudentAccountSession;
  newName: string;
  newPhoneNumber: string;
  newInstitutionId: string;
  newInstitutionName: string;
}): Promise<StudentAccountSession> {
  const data = await apiRequest<{ session: StudentAccountSession }>('/api/accounts/profile', {
    method: 'PUT',
    body: JSON.stringify(params),
  });
  emitEvent(EVT_NOTIFICATIONS);
  return data.session;
}

export async function saveNoticeToAccountVault(
  accessKey: string,
  entry: LocalManagedNotice
): Promise<void> {
  if (!accessKey) return;
  await apiRequest('/api/accounts/vault/notices', {
    method: 'POST',
    body: JSON.stringify({ accessKey, entry }),
  });
}

export async function saveClaimToAccountVault(
  accessKey: string,
  entry: LocalTrackedClaim
): Promise<void> {
  if (!accessKey) return;
  await apiRequest('/api/accounts/vault/claims', {
    method: 'POST',
    body: JSON.stringify({ accessKey, entry }),
  });
}

export async function fetchAccountVault(accessKey: string): Promise<{
  notices: LocalManagedNotice[];
  claims: LocalTrackedClaim[];
}> {
  if (!accessKey) return { notices: [], claims: [] };
  return await apiRequest<{
    notices: LocalManagedNotice[];
    claims: LocalTrackedClaim[];
  }>(`/api/accounts/vault?accessKey=${encodeURIComponent(accessKey)}`);
}

export function subscribeAccountNotifications(
  recipientPhoneHashes: string | string[],
  onData: (items: AppNotification[]) => void,
  onError?: (err: Error) => void
): () => void {
  const hashList = Array.from(
    new Set(
      (Array.isArray(recipientPhoneHashes) ? recipientPhoneHashes : [recipientPhoneHashes]).filter(
        (h) => typeof h === 'string' && h.length === 64
      )
    )
  ).slice(0, 10);

  if (hashList.length === 0) {
    onData([]);
    return () => {};
  }

  let active = true;
  const hashesParam = encodeURIComponent(hashList.join(','));

  const load = async () => {
    try {
      const data = await apiRequest<{ notifications: Record<string, unknown>[] }>(
        `/api/notifications?hashes=${hashesParam}`
      );
      if (active) {
        onData((data.notifications || []).map(hydrateNotification));
      }
    } catch (err) {
      if (active && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  load();
  const interval = window.setInterval(load, 8000);
  const handleEvent = () => {
    load();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') load();
  };
  window.addEventListener(EVT_NOTIFICATIONS, handleEvent);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener(EVT_NOTIFICATIONS, handleEvent);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiRequest(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
  emitEvent(EVT_NOTIFICATIONS);
}

export async function markAllNotificationsRead(notificationIds: string[]): Promise<void> {
  if (!notificationIds.length) return;
  await apiRequest('/api/notifications/mark-all-read', {
    method: 'POST',
    body: JSON.stringify({ ids: notificationIds }),
  });
  emitEvent(EVT_NOTIFICATIONS);
}
