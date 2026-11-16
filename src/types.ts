export type NoticeType = 'found' | 'lost';
export type NoticeStatus = 'open' | 'returned' | 'archived' | 'removed';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type NotificationKind =
  | 'new_claim'
  | 'claim_resubmitted'
  | 'claim_approved'
  | 'claim_rejected';

export const CATEGORIES = [
  'Electronics',
  'IDs/Cards',
  'Bags',
  'Keys',
  'Clothing',
  'Books',
  'Other',
] as const;

export type ItemCategory = (typeof CATEGORIES)[number];

export const CAMPUS_LOCATIONS = [
  'Main Library',
  'Senate Courtyard',
  'Freedom Square',
  'Computing & IT Block',
  'Engineering Wing',
  'Science Complex',
  'Student Guild Canteen',
  'Campus Security Desk',
] as const;

export interface CampusInstitution {
  id: string;
  name: string;
  locations: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationQuestion {
  question: string;
  expectedAnswer: string;
}

export interface PublicNotice {
  id: string;
  type: NoticeType;
  status: NoticeStatus;
  category: string;
  title: string;
  publicDescription: string;
  location: string;
  institutionId: string;
  institutionName: string;
  itemDate: string;
  photos: string[];
  reporterFirstName: string;
  verificationPrompts: string[];
  reporterPhoneHash: string;
  approvedClaimId: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface NoticeSecret {
  noticeId: string;
  reporterName: string;
  reporterWhatsApp: string;
  verificationQuestions: VerificationQuestion[];
  createdAt: Date;
}

export interface ClaimAnswer {
  question: string;
  answer: string;
}

export interface ClaimRecord {
  id: string;
  claimCodeHash: string;
  noticeId: string;
  claimantName: string;
  claimantPhoneHash: string;
  answers: ClaimAnswer[];
  evidenceUrls: string[];
  status: ClaimStatus;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  claimantWhatsApp?: string;
}

export interface ClaimHandover {
  claimId: string;
  noticeId: string;
  reporterName: string;
  reporterWhatsApp: string;
  approvedAt: Date;
}

export interface StudentAccountSession {
  name: string;
  phoneNumber: string;
  phoneHash: string;
  accessKey: string;
  institutionId: string;
  institutionName: string;
  previousPhoneHashes?: string[];
}

export interface AppNotification {
  id: string;
  recipientPhoneHash: string;
  institutionId?: string;
  kind: NotificationKind;
  noticeId: string;
  claimId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface AbuseReport {
  id: string;
  targetType: 'notice' | 'claim';
  targetId: string;
  reason: string;
  status: 'open' | 'resolved';
  createdAt: Date;
}

export interface BannedNumber {
  phoneNumber: string;
  reason: string;
  bannedAt: Date;
}

export interface LocalManagedNotice {
  noticeId: string;
  managementToken: string;
  title: string;
  type: NoticeType;
  createdAt: string;
}

export interface LocalTrackedClaim {
  claimCode: string;
  claimId: string;
  noticeId: string;
  noticeTitle: string;
  createdAt: string;
}
