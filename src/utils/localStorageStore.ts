import { LocalManagedNotice, LocalTrackedClaim, StudentAccountSession } from '../types';

const MANAGED_NOTICES_KEY = 'campustrace_managed_notices_v1';
const TRACKED_CLAIMS_KEY = 'campustrace_tracked_claims_v1';
const ACCOUNT_SESSION_KEY = 'campustrace_account_session_v1';
const GUEST_INSTITUTION_KEY = 'campustrace_guest_institution_v1';

export function getSavedManagedNotices(): LocalManagedNotice[] {
  try {
    const raw = localStorage.getItem(MANAGED_NOTICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveManagedNotice(entry: LocalManagedNotice): void {
  const existing = getSavedManagedNotices().filter(
    (item) => item.managementToken !== entry.managementToken && item.noticeId !== entry.noticeId
  );
  const next = [entry, ...existing].slice(0, 25);
  localStorage.setItem(MANAGED_NOTICES_KEY, JSON.stringify(next));
}

export function removeSavedManagedNotice(noticeId: string): void {
  const next = getSavedManagedNotices().filter((item) => item.noticeId !== noticeId);
  localStorage.setItem(MANAGED_NOTICES_KEY, JSON.stringify(next));
}

export function getSavedTrackedClaims(): LocalTrackedClaim[] {
  try {
    const raw = localStorage.getItem(TRACKED_CLAIMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrackedClaim(entry: LocalTrackedClaim): void {
  const existing = getSavedTrackedClaims().filter(
    (item) => item.claimCode !== entry.claimCode && item.claimId !== entry.claimId
  );
  const next = [entry, ...existing].slice(0, 25);
  localStorage.setItem(TRACKED_CLAIMS_KEY, JSON.stringify(next));
}

export function getSavedAccountSession(): StudentAccountSession | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.phoneNumber === 'string' &&
      typeof parsed.phoneHash === 'string' &&
      typeof parsed.accessKey === 'string'
    ) {
      return {
        ...(parsed as StudentAccountSession),
        institutionId: typeof parsed.institutionId === 'string' ? parsed.institutionId : '',
        institutionName: typeof parsed.institutionName === 'string' ? parsed.institutionName : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAccountSession(session: StudentAccountSession): void {
  localStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(session));
}

export function clearAccountSession(): void {
  localStorage.removeItem(ACCOUNT_SESSION_KEY);
}

export function clearManagedNotices(): void {
  localStorage.removeItem(MANAGED_NOTICES_KEY);
}

export function getSavedGuestInstitutionId(): string | null {
  try {
    const val = localStorage.getItem(GUEST_INSTITUTION_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function saveGuestInstitutionId(institutionId: string): void {
  localStorage.setItem(GUEST_INSTITUTION_KEY, institutionId);
}

export function clearGuestInstitutionId(): void {
  localStorage.removeItem(GUEST_INSTITUTION_KEY);
}
