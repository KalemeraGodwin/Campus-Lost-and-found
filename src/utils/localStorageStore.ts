import { LocalManagedNotice, LocalTrackedClaim } from '../types';

const MANAGED_NOTICES_KEY = 'campustrace_managed_notices_v1';
const TRACKED_CLAIMS_KEY = 'campustrace_tracked_claims_v1';

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
