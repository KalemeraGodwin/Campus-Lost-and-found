import { initializeApp } from 'firebase/app';
import {
  User,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AbuseReport,
  BannedNumber,
  ClaimAnswer,
  ClaimHandover,
  ClaimRecord,
  NoticeSecret,
  NoticeType,
  PublicNotice,
  VerificationQuestion,
} from '../types';
import {
  compressImageToDataUrl,
  generateClaimCode,
  generateDocId,
  generateManagementToken,
  isOlderThanDays,
  isValidUgPhone,
  normalizeUgPhone,
  sha256Hex,
} from '../utils/cryptoAndValidation';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const hasFirebaseConfig = Boolean(
  firebaseConfig?.apiKey &&
    firebaseConfig?.projectId &&
    firebaseConfig?.projectId !== 'remixed-project-id'
);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractFriendlyError(err: unknown): string {
  if (!(err instanceof Error)) return 'An unexpected error occurred.';
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.includes('Missing or insufficient permissions')) {
        return 'Permission denied by database security rules. Please verify your session or inputs.';
      }
      if (parsed.error.includes('Quota exceeded')) {
        return 'Daily database quota exceeded. Please try again tomorrow.';
      }
      return parsed.error;
    }
  } catch {
    // Plain error message
  }
  return err.message;
}

async function testConnection() {
  if (!hasFirebaseConfig) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function mapNoticeDoc(id: string, data: Record<string, unknown>): PublicNotice {
  return {
    id,
    type: (data.type as NoticeType) || 'found',
    status: (data.status as PublicNotice['status']) || 'open',
    category: String(data.category || 'Other'),
    title: String(data.title || ''),
    publicDescription: String(data.publicDescription || ''),
    location: String(data.location || ''),
    itemDate: String(data.itemDate || ''),
    photos: Array.isArray(data.photos) ? (data.photos as string[]) : [],
    reporterFirstName: String(data.reporterFirstName || 'Student'),
    verificationPrompts: Array.isArray(data.verificationPrompts)
      ? (data.verificationPrompts as string[])
      : [],
    reporterPhoneHash: String(data.reporterPhoneHash || ''),
    approvedClaimId: data.approvedClaimId ? String(data.approvedClaimId) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    closedAt: data.closedAt ? toDate(data.closedAt) : null,
  };
}

function mapClaimDoc(id: string, data: Record<string, unknown>): ClaimRecord {
  return {
    id,
    claimCodeHash: String(data.claimCodeHash || ''),
    noticeId: String(data.noticeId || ''),
    claimantName: String(data.claimantName || ''),
    claimantPhoneHash: String(data.claimantPhoneHash || ''),
    answers: Array.isArray(data.answers) ? (data.answers as ClaimAnswer[]) : [],
    evidenceUrls: Array.isArray(data.evidenceUrls) ? (data.evidenceUrls as string[]) : [],
    status: (data.status as ClaimRecord['status']) || 'pending',
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

// Fallback seed items when Firestore is unconfigured or offline
export const FALLBACK_SEED_NOTICES: PublicNotice[] = [
  {
    id: 'seed_notice_backpack_01',
    type: 'found',
    status: 'open',
    category: 'Bags',
    title: 'Charcoal Canvas Backpack with Leather Straps',
    publicDescription:
      'Found left beneath a reading desk near the east windows on Level 2 of the Main Library. Contains a notebook and stainless steel water bottle in the side pocket.',
    location: 'Main Library',
    itemDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    photos: ['/src/assets/images/campus_laptop_backpack_1794829991466.jpg'],
    reporterFirstName: 'Grace',
    verificationPrompts: [
      'What is the subject written on the hardcover book resting on top or inside?',
      'Describe the item clipped to the right carabiner strap.',
    ],
    reporterPhoneHash: '0'.repeat(64),
    approvedClaimId: null,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    closedAt: null,
  },
  {
    id: 'seed_notice_keys_02',
    type: 'found',
    status: 'open',
    category: 'Keys',
    title: 'Two Brass Keys on Dark Green Woven Lanyard',
    publicDescription:
      'Picked up from the stone bench along the walkway outside Senate Courtyard around 11:30 AM. Handed in safely for owner verification.',
    location: 'Senate Courtyard',
    itemDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    photos: ['/src/assets/images/campus_student_keys_1794829991929.jpg'],
    reporterFirstName: 'Samuel',
    verificationPrompts: [
      'What brand or number is stamped on the larger brass key?',
      'Which hall or room number does the smaller key open?',
    ],
    reporterPhoneHash: '0'.repeat(64),
    approvedClaimId: null,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    closedAt: null,
  },
  {
    id: 'seed_notice_earbuds_03',
    type: 'found',
    status: 'open',
    category: 'Electronics',
    title: 'White Wireless Earbuds Charging Case (USB-C)',
    publicDescription:
      'Found on the third-row wooden desk in Lecture Theatre B right after the morning session. Case still holds battery charge.',
    location: 'Computing & IT Block',
    itemDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    photos: ['/src/assets/images/campus_wireless_earbuds_1794829992623.jpg'],
    reporterFirstName: 'Daniel',
    verificationPrompts: [
      'What Bluetooth device name appears when the lid is opened?',
      'Is there any small engraving or mark inside the charging lid?',
    ],
    reporterPhoneHash: '0'.repeat(64),
    approvedClaimId: null,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    closedAt: null,
  },
  {
    id: 'seed_notice_calculator_04',
    type: 'lost',
    status: 'open',
    category: 'Electronics',
    title: 'Black Scientific Calculator Left at Courtyard Table',
    publicDescription:
      'Lost my black scientific calculator with red AC/DEL keys during lunch hour near the concrete tables. Needed urgently for upcoming engineering exams.',
    location: 'Freedom Square',
    itemDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    photos: ['/src/assets/images/campus_scientific_calculator_1794829992795.jpg'],
    reporterFirstName: 'Miriam',
    verificationPrompts: [
      'What initials or sticker are written on the back battery cover?',
      'Does it have the slide-on protective hard cover attached?',
    ],
    reporterPhoneHash: '0'.repeat(64),
    approvedClaimId: null,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    closedAt: null,
  },
];

let seedAttempted = false;

export async function seedCampusNoticesIfEmpty(): Promise<void> {
  if (!hasFirebaseConfig || seedAttempted) return;
  seedAttempted = true;
  if (localStorage.getItem('campustrace_seeded_v1') === 'true') return;

  try {
    const existingSnap = await getDocs(
      query(collection(db, 'notices'), where('status', 'in', ['open', 'returned', 'archived']))
    );
    if (!existingSnap.empty) {
      localStorage.setItem('campustrace_seeded_v1', 'true');
      return;
    }

    const seedPayloads = [
      {
        notice: FALLBACK_SEED_NOTICES[0],
        token: 'seed_token_backpack_01',
        reporterName: 'Grace Namukasa',
        reporterWhatsApp: '+256772110401',
        verificationQuestions: [
          {
            question: 'What is the subject written on the hardcover book resting on top or inside?',
            expectedAnswer: 'History of Art',
          },
          {
            question: 'Describe the item clipped to the right carabiner strap.',
            expectedAnswer: 'Silver house keys on a metal ring',
          },
        ],
      },
      {
        notice: FALLBACK_SEED_NOTICES[1],
        token: 'seed_token_keys_02',
        reporterName: 'Samuel Okello',
        reporterWhatsApp: '+256782220502',
        verificationQuestions: [
          {
            question: 'What brand or number is stamped on the larger brass key?',
            expectedAnswer: 'YALE 1987',
          },
          {
            question: 'Which hall or room number does the smaller key open?',
            expectedAnswer: '42 UK or hostel locker',
          },
        ],
      },
      {
        notice: FALLBACK_SEED_NOTICES[2],
        token: 'seed_token_earbuds_03',
        reporterName: 'Daniel Ssemogerere',
        reporterWhatsApp: '+256701330603',
        verificationQuestions: [
          {
            question: 'What Bluetooth device name appears when the lid is opened?',
            expectedAnswer: "Owner's name AirPods",
          },
          {
            question: 'Is there any small engraving or mark inside the charging lid?',
            expectedAnswer: 'Small scratch near the hinge',
          },
        ],
      },
      {
        notice: FALLBACK_SEED_NOTICES[3],
        token: 'seed_token_calculator_04',
        reporterName: 'Miriam Atuhaire',
        reporterWhatsApp: '+256752440704',
        verificationQuestions: [
          {
            question: 'What initials or sticker are written on the back battery cover?',
            expectedAnswer: 'M.A. in silver marker',
          },
          {
            question: 'Does it have the slide-on protective hard cover attached?',
            expectedAnswer: 'No, missing hard cover',
          },
        ],
      },
    ];

    const batch = writeBatch(db);
    for (const item of seedPayloads) {
      const phoneHash = await sha256Hex(item.reporterWhatsApp);
      const tokenHash = await sha256Hex(item.token);
      const noticeRef = doc(db, 'notices', item.notice.id);
      const secretRef = doc(db, 'noticeSecrets', tokenHash);

      batch.set(noticeRef, {
        type: item.notice.type,
        status: 'open',
        category: item.notice.category,
        title: item.notice.title,
        publicDescription: item.notice.publicDescription,
        location: item.notice.location,
        itemDate: item.notice.itemDate,
        photos: item.notice.photos,
        reporterFirstName: item.notice.reporterFirstName,
        verificationPrompts: item.notice.verificationPrompts,
        reporterPhoneHash: phoneHash,
        approvedClaimId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        closedAt: null,
      });

      batch.set(secretRef, {
        noticeId: item.notice.id,
        reporterName: item.reporterName,
        reporterWhatsApp: item.reporterWhatsApp,
        verificationQuestions: item.verificationQuestions,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    localStorage.setItem('campustrace_seeded_v1', 'true');
  } catch (err) {
    console.warn('Initial seed skipped or already completed:', err);
  }
}

export function subscribePublicNotices(
  onData: (notices: PublicNotice[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!hasFirebaseConfig) {
    onData(FALLBACK_SEED_NOTICES);
    return () => {};
  }

  const q = query(
    collection(db, 'notices'),
    where('status', 'in', ['open', 'returned', 'archived'])
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapNoticeDoc(d.id, d.data()));
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'notices');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function getNoticeById(noticeId: string): Promise<PublicNotice | null> {
  if (!hasFirebaseConfig) {
    return FALLBACK_SEED_NOTICES.find((n) => n.id === noticeId) || null;
  }
  const path = `notices/${noticeId}`;
  try {
    const snap = await getDoc(doc(db, 'notices', noticeId));
    if (!snap.exists()) return null;
    return mapNoticeDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function checkNumberBanned(phone: string): Promise<{ banned: boolean; reason?: string }> {
  const normalized = normalizeUgPhone(phone);
  if (!isValidUgPhone(normalized) || !hasFirebaseConfig) {
    return { banned: false };
  }
  const path = `bannedNumbers/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'bannedNumbers', normalized));
    if (snap.exists()) {
      const data = snap.data();
      return { banned: true, reason: String(data.reason || 'Policy violation') };
    }
    return { banned: false };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function checkDailyNoticeRateLimit(phoneHash: string): Promise<number> {
  if (!hasFirebaseConfig) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'notices'), where('status', 'in', ['open', 'returned', 'archived']))
    );
    return snap.docs.filter((d) => {
      const data = d.data();
      if (data.reporterPhoneHash !== phoneHash) return false;
      return !isOlderThanDays(toDate(data.createdAt), 1);
    }).length;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'notices');
  }
}

export async function checkDailyClaimRateLimit(phoneHash: string): Promise<number> {
  if (!hasFirebaseConfig) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'claims'), where('claimantPhoneHash', '==', phoneHash))
    );
    return snap.docs.filter((d) => {
      const data = d.data();
      return !isOlderThanDays(toDate(data.createdAt), 1);
    }).length;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'claims');
  }
}

async function uploadMediaFile(
  folder: 'notices' | 'claims',
  entityId: string,
  file: File,
  index: number
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

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageRef = ref(storage, `${folder}/${entityId}/${Date.now()}_${index}_${safeName}`);
    const uploadTask = uploadBytes(storageRef, file);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('storage-timeout')), 8000)
    );
    await Promise.race([uploadTask, timeoutPromise]);
    return await getDownloadURL(storageRef);
  } catch {
    if (isImage) {
      const compressed = await compressImageToDataUrl(file, 880, 0.68);
      if (compressed.length > 340000) {
        return await compressImageToDataUrl(file, 640, 0.55);
      }
      return compressed;
    }
    throw new Error(
      'PDF upload requires Firebase Storage rules to be enabled. Please upload an image screenshot (JPG/PNG) of your receipt or ID instead.'
    );
  }
}

export interface CreateNoticeInput {
  type: NoticeType;
  category: string;
  title: string;
  publicDescription: string;
  location: string;
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

  const banStatus = await checkNumberBanned(normalizedPhone);
  if (banStatus.banned) {
    throw new Error(
      `This WhatsApp number is banned from posting notices (${banStatus.reason || 'Policy violation'}).`
    );
  }

  const phoneHash = await sha256Hex(normalizedPhone);
  const recentCount = await checkDailyNoticeRateLimit(phoneHash);
  if (recentCount >= 3) {
    throw new Error(
      'Daily limit reached: you can post at most 3 notices per 24 hours with this WhatsApp number.'
    );
  }

  if (input.photoFiles.length < 1) {
    throw new Error('Please upload at least 1 photo of the item.');
  }

  const cleanedQuestions = input.verificationQuestions
    .map((q) => ({
      question: q.question.trim(),
      expectedAnswer: q.expectedAnswer.trim(),
    }))
    .filter((q) => q.question.length >= 3 && q.expectedAnswer.length >= 1);

  if (cleanedQuestions.length < 1) {
    throw new Error('Please provide at least 1 verification question and expected answer.');
  }

  const noticeId = generateDocId('ntc');
  const managementToken = generateManagementToken();
  const tokenHash = await sha256Hex(managementToken);

  const uploadedPhotos = await Promise.all(
    input.photoFiles.slice(0, 5).map((file, idx) => uploadMediaFile('notices', noticeId, file, idx))
  );

  const firstName = input.reporterName.trim().split(/\s+/)[0] || input.reporterName.trim();
  const prompts = cleanedQuestions.map((q) => q.question);

  const batch = writeBatch(db);
  batch.set(doc(db, 'notices', noticeId), {
    type: input.type,
    status: 'open',
    category: input.category,
    title: input.title.trim(),
    publicDescription: input.publicDescription.trim(),
    location: input.location.trim(),
    itemDate: input.itemDate,
    photos: uploadedPhotos,
    reporterFirstName: firstName,
    verificationPrompts: prompts,
    reporterPhoneHash: phoneHash,
    approvedClaimId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    closedAt: null,
  });

  batch.set(doc(db, 'noticeSecrets', tokenHash), {
    noticeId,
    reporterName: input.reporterName.trim(),
    reporterWhatsApp: normalizedPhone,
    verificationQuestions: cleanedQuestions,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `notices/${noticeId}`);
  }

  const now = new Date();
  return {
    noticeId,
    managementToken,
    notice: {
      id: noticeId,
      type: input.type,
      status: 'open',
      category: input.category,
      title: input.title.trim(),
      publicDescription: input.publicDescription.trim(),
      location: input.location.trim(),
      itemDate: input.itemDate,
      photos: uploadedPhotos,
      reporterFirstName: firstName,
      verificationPrompts: prompts,
      reporterPhoneHash: phoneHash,
      approvedClaimId: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    },
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
  const tokenHash = await sha256Hex(token);

  let secretSnap;
  try {
    secretSnap = await getDoc(doc(db, 'noticeSecrets', tokenHash));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `noticeSecrets/${tokenHash}`);
  }

  if (!secretSnap.exists()) return null;
  const secretData = secretSnap.data();
  const noticeId = String(secretData.noticeId);

  const notice = await getNoticeById(noticeId);
  if (!notice) return null;

  let claimsSnap;
  try {
    claimsSnap = await getDocs(query(collection(db, 'claims'), where('noticeId', '==', noticeId)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'claims');
  }

  const claims = claimsSnap.docs
    .map((d) => mapClaimDoc(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    notice,
    secret: {
      noticeId,
      reporterName: String(secretData.reporterName || ''),
      reporterWhatsApp: String(secretData.reporterWhatsApp || ''),
      verificationQuestions: Array.isArray(secretData.verificationQuestions)
        ? (secretData.verificationQuestions as VerificationQuestion[])
        : [],
      createdAt: toDate(secretData.createdAt),
    },
    claims,
    managementToken: token,
  };
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
  const path = `notices/${noticeId}`;
  try {
    await updateDoc(doc(db, 'notices', noticeId), {
      title: updates.title.trim(),
      publicDescription: updates.publicDescription.trim(),
      location: updates.location.trim(),
      category: updates.category,
      itemDate: updates.itemDate,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markNoticeReturned(noticeId: string): Promise<void> {
  const path = `notices/${noticeId}`;
  try {
    await updateDoc(doc(db, 'notices', noticeId), {
      status: 'returned',
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function approveClaimOnNotice(params: {
  noticeId: string;
  claimId: string;
  claimCodeHash: string;
  reporterName: string;
  reporterWhatsApp: string;
}): Promise<void> {
  const noticeRef = doc(db, 'notices', params.noticeId);
  const noticeSnap = await getDoc(noticeRef);
  if (!noticeSnap.exists()) {
    throw new Error('Notice not found.');
  }
  const noticeData = noticeSnap.data();
  if (noticeData.approvedClaimId) {
    throw new Error(
      'Another claim is already approved for this notice. Revoke/reject that approval first before approving a different claimant.'
    );
  }

  const batch = writeBatch(db);
  batch.update(noticeRef, {
    approvedClaimId: params.claimId,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'claims', params.claimId), {
    status: 'approved',
    rejectionReason: null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'claimHandovers', params.claimCodeHash), {
    claimId: params.claimId,
    noticeId: params.noticeId,
    reporterName: params.reporterName,
    reporterWhatsApp: params.reporterWhatsApp,
    approvedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `notices/${params.noticeId}`);
  }
}

export async function rejectClaimOnNotice(params: {
  noticeId: string;
  claimId: string;
  rejectionReason: string;
  wasApproved: boolean;
}): Promise<void> {
  const reason = params.rejectionReason.trim();
  if (reason.length < 3) {
    throw new Error('Please provide a clear rejection reason (at least 3 characters).');
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'claims', params.claimId), {
    status: 'rejected',
    rejectionReason: reason,
    updatedAt: serverTimestamp(),
  });

  if (params.wasApproved) {
    batch.update(doc(db, 'notices', params.noticeId), {
      approvedClaimId: null,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `claims/${params.claimId}`);
  }
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

  const banStatus = await checkNumberBanned(normalizedPhone);
  if (banStatus.banned) {
    throw new Error(
      `This WhatsApp number is banned from submitting claims (${banStatus.reason || 'Policy violation'}).`
    );
  }

  const phoneHash = await sha256Hex(normalizedPhone);
  const recentCount = await checkDailyClaimRateLimit(phoneHash);
  if (recentCount >= 5) {
    throw new Error(
      'Daily limit reached: you can submit at most 5 claims per 24 hours with this WhatsApp number.'
    );
  }

  if (input.evidenceFiles.length < 1) {
    throw new Error('Please upload at least 1 evidence file (photo, receipt, or redacted ID).');
  }

  const claimId = generateDocId('clm');
  const claimCode = generateClaimCode();
  const claimCodeHash = await sha256Hex(claimCode);

  const evidenceUrls = await Promise.all(
    input.evidenceFiles
      .slice(0, 5)
      .map((file, idx) => uploadMediaFile('claims', claimId, file, idx))
  );

  const batch = writeBatch(db);
  batch.set(doc(db, 'claims', claimId), {
    claimCodeHash,
    noticeId: input.noticeId,
    claimantName: input.claimantName.trim(),
    claimantPhoneHash: phoneHash,
    answers: input.answers.map((a) => ({
      question: a.question.trim(),
      answer: a.answer.trim(),
    })),
    evidenceUrls,
    status: 'pending',
    rejectionReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'claimContacts', claimId), {
    claimId,
    claimantWhatsApp: normalizedPhone,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'claimCodeLookups', claimCodeHash), {
    claimId,
    noticeId: input.noticeId,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `claims/${claimId}`);
  }

  return { claimId, claimCode };
}

export interface TrackedClaimBundle {
  claim: ClaimRecord;
  notice: PublicNotice | null;
  handover: ClaimHandover | null;
}

export async function trackClaimByCode(rawCode: string): Promise<TrackedClaimBundle | null> {
  const normalizedCode = rawCode.trim().toUpperCase();
  if (!normalizedCode) return null;

  const codeHash = await sha256Hex(normalizedCode);
  let lookupSnap;
  try {
    lookupSnap = await getDoc(doc(db, 'claimCodeLookups', codeHash));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `claimCodeLookups/${codeHash}`);
  }

  if (!lookupSnap.exists()) return null;
  const { claimId, noticeId } = lookupSnap.data() as { claimId: string; noticeId: string };

  let claimSnap;
  try {
    claimSnap = await getDoc(doc(db, 'claims', claimId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `claims/${claimId}`);
  }

  if (!claimSnap.exists()) return null;
  const claim = mapClaimDoc(claimSnap.id, claimSnap.data());
  const notice = await getNoticeById(noticeId);

  let handover: ClaimHandover | null = null;
  if (claim.status === 'approved') {
    try {
      const handoverSnap = await getDoc(doc(db, 'claimHandovers', codeHash));
      if (handoverSnap.exists()) {
        const h = handoverSnap.data();
        handover = {
          claimId: String(h.claimId),
          noticeId: String(h.noticeId),
          reporterName: String(h.reporterName),
          reporterWhatsApp: String(h.reporterWhatsApp),
          approvedAt: toDate(h.approvedAt),
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `claimHandovers/${codeHash}`);
    }
  }

  return { claim, notice, handover };
}

export async function resubmitRejectedClaim(params: {
  claimId: string;
  answers: ClaimAnswer[];
  newEvidenceFiles: File[];
  existingEvidenceUrls: string[];
}): Promise<void> {
  const uploadedNew = await Promise.all(
    params.newEvidenceFiles
      .slice(0, 5)
      .map((file, idx) => uploadMediaFile('claims', params.claimId, file, idx))
  );
  const combinedEvidence = [...params.existingEvidenceUrls, ...uploadedNew].slice(0, 5);
  if (combinedEvidence.length < 1) {
    throw new Error('At least 1 evidence file is required.');
  }

  const path = `claims/${params.claimId}`;
  try {
    await updateDoc(doc(db, 'claims', params.claimId), {
      answers: params.answers.map((a) => ({
        question: a.question.trim(),
        answer: a.answer.trim(),
      })),
      evidenceUrls: combinedEvidence,
      status: 'pending',
      rejectionReason: null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitAbuseReport(params: {
  targetType: 'notice' | 'claim';
  targetId: string;
  reason: string;
}): Promise<void> {
  const reportId = generateDocId('rpt');
  const path = `reports/${reportId}`;
  try {
    await setDoc(doc(db, 'reports', reportId), {
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason.trim(),
      status: 'open',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// --- Admin Auth & Moderation Services ---

export function subscribeAdminAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function adminSignInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function adminSignInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function adminSignOut(): Promise<void> {
  await signOut(auth);
}

export async function verifyAdminAuthorization(user: User): Promise<boolean> {
  if (user.email === 'kalemeragodie@gmail.com' && user.emailVerified) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export interface AdminDashboardData {
  notices: PublicNotice[];
  noticeContacts: Record<string, { reporterName: string; reporterWhatsApp: string }>;
  claims: ClaimRecord[];
  reports: AbuseReport[];
  bannedNumbers: BannedNumber[];
}

export async function adminFetchDashboardData(): Promise<AdminDashboardData> {
  try {
    const [noticesSnap, noticeSecretsSnap, claimsSnap, contactsSnap, reportsSnap, bannedSnap] =
      await Promise.all([
        getDocs(collection(db, 'notices')),
        getDocs(collection(db, 'noticeSecrets')),
        getDocs(collection(db, 'claims')),
        getDocs(collection(db, 'claimContacts')),
        getDocs(collection(db, 'reports')),
        getDocs(collection(db, 'bannedNumbers')),
      ]);

    const noticeContacts: Record<string, { reporterName: string; reporterWhatsApp: string }> = {};
    noticeSecretsSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.noticeId) {
        noticeContacts[String(data.noticeId)] = {
          reporterName: String(data.reporterName || ''),
          reporterWhatsApp: String(data.reporterWhatsApp || ''),
        };
      }
    });

    const contactMap = new Map<string, string>();
    contactsSnap.docs.forEach((d) => {
      const data = d.data();
      contactMap.set(d.id, String(data.claimantWhatsApp || ''));
    });

    const notices = noticesSnap.docs
      .map((d) => mapNoticeDoc(d.id, d.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const claims = claimsSnap.docs
      .map((d) => {
        const mapped = mapClaimDoc(d.id, d.data());
        mapped.claimantWhatsApp = contactMap.get(d.id);
        return mapped;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const reports: AbuseReport[] = reportsSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          targetType: (data.targetType as 'notice' | 'claim') || 'notice',
          targetId: String(data.targetId || ''),
          reason: String(data.reason || ''),
          status: (data.status as 'open' | 'resolved') || 'open',
          createdAt: toDate(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const bannedNumbers: BannedNumber[] = bannedSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          phoneNumber: String(data.phoneNumber || d.id),
          reason: String(data.reason || ''),
          bannedAt: toDate(data.bannedAt),
        };
      })
      .sort((a, b) => b.bannedAt.getTime() - a.bannedAt.getTime());

    return { notices, noticeContacts, claims, reports, bannedNumbers };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'admin_dashboard');
  }
}

export async function adminRemoveNotice(noticeId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notices', noticeId), {
      status: 'removed',
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notices/${noticeId}`);
  }
}

export async function adminBanNumber(phoneInput: string, reason: string): Promise<void> {
  const normalized = normalizeUgPhone(phoneInput);
  if (!isValidUgPhone(normalized)) {
    throw new Error('Banned number must match +256 followed by 9 digits.');
  }
  try {
    await setDoc(doc(db, 'bannedNumbers', normalized), {
      phoneNumber: normalized,
      reason: reason.trim(),
      bannedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bannedNumbers/${normalized}`);
  }
}

export async function adminUnbanNumber(phoneNumber: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'bannedNumbers', phoneNumber));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `bannedNumbers/${phoneNumber}`);
  }
}

export async function adminResolveReport(reportId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status: 'resolved',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminPurgeOldEvidence(): Promise<{ purgedClaims: number }> {
  try {
    const [noticesSnap, claimsSnap] = await Promise.all([
      getDocs(collection(db, 'notices')),
      getDocs(collection(db, 'claims')),
    ]);

    const expiredClosedNoticeIds = new Set<string>();
    noticesSnap.docs.forEach((d) => {
      const n = mapNoticeDoc(d.id, d.data());
      if (
        (n.status === 'returned' || n.status === 'archived' || n.status === 'removed') &&
        isOlderThanDays(n.closedAt || n.updatedAt, 30)
      ) {
        expiredClosedNoticeIds.add(n.id);
      }
    });

    let purgedClaims = 0;
    for (const claimDoc of claimsSnap.docs) {
      const claim = mapClaimDoc(claimDoc.id, claimDoc.data());
      if (expiredClosedNoticeIds.has(claim.noticeId) && claim.evidenceUrls.length > 0) {
        for (const url of claim.evidenceUrls) {
          if (url.startsWith('https://firebasestorage.googleapis.com')) {
            try {
              await deleteObject(ref(storage, url));
            } catch {
              // Storage object may already be deleted
            }
          }
        }
        await updateDoc(doc(db, 'claims', claim.id), {
          evidenceUrls: [],
          updatedAt: serverTimestamp(),
        });
        purgedClaims++;
      }
    }

    return { purgedClaims };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'claims_evidence_purge');
  }
}
