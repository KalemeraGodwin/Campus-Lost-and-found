import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  DB_NAME,
  ensureDbInitialized,
  getCollection,
  getDatabase,
  hashAdminPassword,
  sha256HexServer,
  verifyAdminPassword,
} from './server/db.ts';
import type {
  AbuseReportDoc,
  AccountDoc,
  AccountVaultDoc,
  AdminDoc,
  BannedNumberDoc,
  ClaimCodeLookupDoc,
  ClaimContactDoc,
  ClaimDoc,
  ClaimHandoverDoc,
  InstitutionDoc,
  NoticeDoc,
  NoticeSecretDoc,
  NotificationDoc,
} from './server/db.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const UG_PHONE_REGEX = /^\+256\d{9}$/;

function normalizeUgPhone(input: string): string {
  const cleaned = String(input || '').replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+256${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('256') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return cleaned;
}

function isValidUgPhone(input: string): boolean {
  return UG_PHONE_REGEX.test(input.trim());
}

function generateDocId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function generateManagementToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateClaimCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `CLM-${code}`;
}

function sanitizeLocations(rawLocations: unknown): string[] {
  if (!Array.isArray(rawLocations)) return [];
  const unique = new Map<string, string>();
  for (const item of rawLocations) {
    const clean = String(item || '').trim();
    if (clean.length >= 2 && clean.length <= 120) {
      const key = clean.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, clean);
      }
    }
  }
  return Array.from(unique.values()).slice(0, 40);
}

function isOlderThanDays(date: Date | string | null | undefined, days: number): boolean {
  if (!date) return false;
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) return false;
  return Date.now() - target.getTime() > days * 24 * 60 * 60 * 1000;
}

// Ephemeral fallback secret per server process if ADMIN_SESSION_SECRET is not provided
const FALLBACK_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || FALLBACK_SESSION_SECRET;
}

interface AdminTokenPayload {
  email: string;
  role: 'admin';
  exp: number;
}

function signAdminToken(email: string): string {
  const payload: AdminTokenPayload = {
    email: email.toLowerCase(),
    role: 'admin',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAdminToken(token: string): AdminTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminTokenPayload;
    if (!parsed || parsed.role !== 'admin' || !parsed.email || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  adminEmail?: string;
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  const verified = verifyAdminToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Admin session expired or invalid. Please sign in again.' });
    return;
  }
  req.adminEmail = verified.email;
  next();
}

function serializeInstitution(doc: InstitutionDoc) {
  return {
    id: doc._id,
    name: doc.name,
    locations: doc.locations,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeNotice(doc: NoticeDoc) {
  return {
    id: doc._id,
    type: doc.type,
    status: doc.status,
    category: doc.category,
    title: doc.title,
    publicDescription: doc.publicDescription,
    location: doc.location,
    institutionId: doc.institutionId,
    institutionName: doc.institutionName,
    itemDate: doc.itemDate,
    photos: doc.photos,
    reporterFirstName: doc.reporterFirstName,
    verificationPrompts: doc.verificationPrompts,
    reporterPhoneHash: doc.reporterPhoneHash,
    approvedClaimId: doc.approvedClaimId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    closedAt: doc.closedAt,
  };
}

function serializeClaim(doc: ClaimDoc, claimantWhatsApp?: string) {
  return {
    id: doc._id,
    claimCodeHash: doc.claimCodeHash,
    noticeId: doc.noticeId,
    claimantName: doc.claimantName,
    claimantPhoneHash: doc.claimantPhoneHash,
    answers: doc.answers,
    evidenceUrls: doc.evidenceUrls,
    status: doc.status,
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(claimantWhatsApp !== undefined ? { claimantWhatsApp } : {}),
  };
}

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  // Ensure MongoDB connection & initial collections/seeds before API handlers
  app.use('/api', asyncHandler(async (_req, _res, next) => {
    await ensureDbInitialized();
    next();
  }));

  // --- Health ---
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const db = await getDatabase();
      await db.command({ ping: 1 });
      res.json({ ok: true, database: DB_NAME });
    })
  );

  // --- Seed endpoint (idempotent) ---
  app.post(
    '/api/seed',
    asyncHandler(async (_req, res) => {
      await ensureDbInitialized();
      res.json({ ok: true });
    })
  );

  // --- Institutions CRUD ---
  app.get(
    '/api/institutions',
    asyncHandler(async (_req, res) => {
      const col = await getCollection<InstitutionDoc>('institutions');
      const docs = await col.find({}).sort({ name: 1 }).toArray();
      res.json({ institutions: docs.map(serializeInstitution) });
    })
  );

  app.post(
    '/api/institutions',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const cleanName = String(req.body?.name || '').trim();
      if (cleanName.length < 2 || cleanName.length > 100) {
        res.status(400).json({ error: 'Institution name must be between 2 and 100 characters.' });
        return;
      }
      const cleanLocations = sanitizeLocations(req.body?.locations);
      const col = await getCollection<InstitutionDoc>('institutions');
      const now = new Date();
      const doc: InstitutionDoc = {
        _id: generateDocId('inst'),
        name: cleanName,
        locations: cleanLocations,
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(doc);
      res.status(201).json({ institution: serializeInstitution(doc) });
    })
  );

  app.put(
    '/api/institutions/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const institutionId = String(req.params.id || '').trim();
      const cleanName = String(req.body?.name || '').trim();
      if (cleanName.length < 2 || cleanName.length > 100) {
        res.status(400).json({ error: 'Institution name must be between 2 and 100 characters.' });
        return;
      }
      const cleanLocations = sanitizeLocations(req.body?.locations);
      const col = await getCollection<InstitutionDoc>('institutions');
      const now = new Date();
      const result = await col.findOneAndUpdate(
        { _id: institutionId },
        {
          $set: {
            name: cleanName,
            locations: cleanLocations,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Institution not found.' });
        return;
      }

      const previousName = String(req.body?.previousName || '').trim();
      if (previousName && previousName !== cleanName) {
        const noticesCol = await getCollection<NoticeDoc>('notices');
        await noticesCol.updateMany(
          { institutionId },
          { $set: { institutionName: cleanName, updatedAt: now } }
        );
      }

      res.json({ institution: serializeInstitution(result) });
    })
  );

  app.delete(
    '/api/institutions/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const institutionId = String(req.params.id || '').trim();
      const col = await getCollection<InstitutionDoc>('institutions');
      await col.deleteOne({ _id: institutionId });
      res.json({ ok: true });
    })
  );

  // --- Notices CRUD ---
  app.get(
    '/api/notices',
    asyncHandler(async (req, res) => {
      const institutionId = String(req.query.institutionId || '').trim();
      if (!institutionId) {
        res.json({ notices: [] });
        return;
      }
      const col = await getCollection<NoticeDoc>('notices');
      const docs = await col
        .find({
          institutionId,
          status: { $in: ['open', 'returned', 'archived'] },
        })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ notices: docs.map(serializeNotice) });
    })
  );

  app.get(
    '/api/notices/:id',
    asyncHandler(async (req, res) => {
      const noticeId = String(req.params.id || '').trim();
      const col = await getCollection<NoticeDoc>('notices');
      const doc = await col.findOne({ _id: noticeId });
      if (!doc) {
        res.status(404).json({ error: 'Notice not found.' });
        return;
      }
      res.json({ notice: serializeNotice(doc) });
    })
  );

  app.post(
    '/api/notices',
    asyncHandler(async (req, res) => {
      const cleanInstId = String(req.body?.institutionId || '').trim();
      const cleanInstName = String(req.body?.institutionName || '').trim();
      if (!cleanInstId || !cleanInstName) {
        res.status(400).json({
          error: 'Please select your campus institution in your Profile before posting a notice.',
        });
        return;
      }

      const normalizedPhone = normalizeUgPhone(String(req.body?.reporterWhatsApp || ''));
      if (!isValidUgPhone(normalizedPhone)) {
        res.status(400).json({
          error: 'WhatsApp number must match +256 followed by 9 digits (e.g. +256772123456).',
        });
        return;
      }

      const bannedCol = await getCollection<BannedNumberDoc>('bannedNumbers');
      const banned = await bannedCol.findOne({ _id: normalizedPhone });
      if (banned) {
        res.status(403).json({
          error: `This WhatsApp number is banned from posting notices (${banned.reason || 'Policy violation'}).`,
        });
        return;
      }

      const phoneHash = sha256HexServer(normalizedPhone);
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await noticesCol.countDocuments({
        reporterPhoneHash: phoneHash,
        status: { $in: ['open', 'returned', 'archived'] },
        createdAt: { $gte: oneDayAgo },
      });

      if (recentCount >= 3) {
        res.status(429).json({
          error: 'Daily limit reached: you can post at most 3 notices per 24 hours with this WhatsApp number.',
        });
        return;
      }

      const photos = Array.isArray(req.body?.photos)
        ? req.body.photos.map(String).filter(Boolean).slice(0, 5)
        : [];
      if (photos.length < 1) {
        res.status(400).json({ error: 'Please upload at least 1 photo of the item.' });
        return;
      }

      const rawQuestions = Array.isArray(req.body?.verificationQuestions)
        ? req.body.verificationQuestions
        : [];
      const cleanedQuestions = rawQuestions
        .map((q: { question?: unknown; expectedAnswer?: unknown }) => ({
          question: String(q?.question || '').trim(),
          expectedAnswer: String(q?.expectedAnswer || '').trim(),
        }))
        .filter((q: { question: string; expectedAnswer: string }) => q.question.length >= 3 && q.expectedAnswer.length >= 1);

      if (cleanedQuestions.length < 1) {
        res.status(400).json({
          error: 'Please provide at least 1 verification question and expected answer.',
        });
        return;
      }

      const reporterName = String(req.body?.reporterName || '').trim();
      const firstName = reporterName.split(/\s+/)[0] || reporterName || 'Student';
      const noticeType = req.body?.type === 'lost' ? 'lost' : 'found';
      const noticeId = generateDocId('ntc');
      const managementToken = generateManagementToken();
      const tokenHash = sha256HexServer(managementToken);
      const now = new Date();

      const noticeDoc: NoticeDoc = {
        _id: noticeId,
        type: noticeType,
        status: 'open',
        category: String(req.body?.category || 'Other'),
        title: String(req.body?.title || '').trim(),
        publicDescription: String(req.body?.publicDescription || '').trim(),
        location: String(req.body?.location || '').trim(),
        institutionId: cleanInstId,
        institutionName: cleanInstName,
        itemDate: String(req.body?.itemDate || ''),
        photos,
        reporterFirstName: firstName,
        verificationPrompts: cleanedQuestions.map((q: { question: string }) => q.question),
        reporterPhoneHash: phoneHash,
        approvedClaimId: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      };

      const secretDoc: NoticeSecretDoc = {
        _id: tokenHash,
        noticeId,
        reporterName,
        reporterWhatsApp: normalizedPhone,
        verificationQuestions: cleanedQuestions,
        createdAt: now,
      };

      const secretsCol = await getCollection<NoticeSecretDoc>('noticeSecrets');
      await Promise.all([noticesCol.insertOne(noticeDoc), secretsCol.insertOne(secretDoc)]);

      res.status(201).json({
        noticeId,
        managementToken,
        notice: serializeNotice(noticeDoc),
      });
    })
  );

  app.put(
    '/api/notices/:id',
    asyncHandler(async (req, res) => {
      const noticeId = String(req.params.id || '').trim();
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const now = new Date();
      const result = await noticesCol.findOneAndUpdate(
        { _id: noticeId },
        {
          $set: {
            title: String(req.body?.title || '').trim(),
            publicDescription: String(req.body?.publicDescription || '').trim(),
            location: String(req.body?.location || '').trim(),
            category: String(req.body?.category || 'Other'),
            itemDate: String(req.body?.itemDate || ''),
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );
      if (!result) {
        res.status(404).json({ error: 'Notice not found.' });
        return;
      }
      res.json({ notice: serializeNotice(result) });
    })
  );

  app.post(
    '/api/notices/:id/return',
    asyncHandler(async (req, res) => {
      const noticeId = String(req.params.id || '').trim();
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const now = new Date();
      const result = await noticesCol.findOneAndUpdate(
        { _id: noticeId },
        {
          $set: {
            status: 'returned',
            closedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );
      if (!result) {
        res.status(404).json({ error: 'Notice not found.' });
        return;
      }
      res.json({ ok: true });
    })
  );

  // --- Manage Notice by Token ---
  app.get(
    '/api/manage-notice',
    asyncHandler(async (req, res) => {
      const token = String(req.query.token || '').trim();
      if (!token) {
        res.status(400).json({ error: 'Management token is required.' });
        return;
      }
      const tokenHash = sha256HexServer(token);
      const secretsCol = await getCollection<NoticeSecretDoc>('noticeSecrets');
      const secretDoc = await secretsCol.findOne({ _id: tokenHash });
      if (!secretDoc) {
        res.status(404).json({ error: 'Notice management token not found.' });
        return;
      }

      const noticesCol = await getCollection<NoticeDoc>('notices');
      const noticeDoc = await noticesCol.findOne({ _id: secretDoc.noticeId });
      if (!noticeDoc) {
        res.status(404).json({ error: 'Notice not found.' });
        return;
      }

      const claimsCol = await getCollection<ClaimDoc>('claims');
      const claimDocs = await claimsCol
        .find({ noticeId: secretDoc.noticeId })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        notice: serializeNotice(noticeDoc),
        secret: {
          noticeId: secretDoc.noticeId,
          reporterName: secretDoc.reporterName,
          reporterWhatsApp: secretDoc.reporterWhatsApp,
          verificationQuestions: secretDoc.verificationQuestions,
          createdAt: secretDoc.createdAt,
        },
        claims: claimDocs.map((c) => serializeClaim(c)),
        managementToken: token,
      });
    })
  );

  // --- Claims CRUD ---
  app.post(
    '/api/claims',
    asyncHandler(async (req, res) => {
      const normalizedPhone = normalizeUgPhone(String(req.body?.claimantWhatsApp || ''));
      if (!isValidUgPhone(normalizedPhone)) {
        res.status(400).json({
          error: 'WhatsApp number must match +256 followed by 9 digits (e.g. +256772123456).',
        });
        return;
      }

      const bannedCol = await getCollection<BannedNumberDoc>('bannedNumbers');
      const banned = await bannedCol.findOne({ _id: normalizedPhone });
      if (banned) {
        res.status(403).json({
          error: `This WhatsApp number is banned from submitting claims (${banned.reason || 'Policy violation'}).`,
        });
        return;
      }

      const phoneHash = sha256HexServer(normalizedPhone);
      const claimsCol = await getCollection<ClaimDoc>('claims');
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await claimsCol.countDocuments({
        claimantPhoneHash: phoneHash,
        createdAt: { $gte: oneDayAgo },
      });

      if (recentCount >= 5) {
        res.status(429).json({
          error: 'Daily limit reached: you can submit at most 5 claims per 24 hours with this WhatsApp number.',
        });
        return;
      }

      const evidenceUrls = Array.isArray(req.body?.evidenceUrls)
        ? req.body.evidenceUrls.map(String).filter(Boolean).slice(0, 5)
        : [];
      if (evidenceUrls.length < 1) {
        res.status(400).json({
          error: 'Please upload at least 1 evidence file (photo, receipt, or redacted ID).',
        });
        return;
      }

      const noticeId = String(req.body?.noticeId || '').trim();
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const noticeDoc = await noticesCol.findOne({ _id: noticeId });
      if (!noticeDoc) {
        res.status(404).json({ error: 'Target notice no longer exists.' });
        return;
      }

      const claimId = generateDocId('clm');
      const claimCode = generateClaimCode();
      const claimCodeHash = sha256HexServer(claimCode);
      const claimantName = String(req.body?.claimantName || '').trim();
      const answers = Array.isArray(req.body?.answers)
        ? req.body.answers.map((a: { question?: unknown; answer?: unknown }) => ({
            question: String(a?.question || '').trim(),
            answer: String(a?.answer || '').trim(),
          }))
        : [];
      const now = new Date();

      const claimDoc: ClaimDoc = {
        _id: claimId,
        claimCodeHash,
        noticeId,
        claimantName,
        claimantPhoneHash: phoneHash,
        answers,
        evidenceUrls,
        status: 'pending',
        rejectionReason: null,
        createdAt: now,
        updatedAt: now,
      };

      const contactsCol = await getCollection<ClaimContactDoc>('claimContacts');
      const lookupsCol = await getCollection<ClaimCodeLookupDoc>('claimCodeLookups');

      const ops: Promise<unknown>[] = [
        claimsCol.insertOne(claimDoc),
        contactsCol.insertOne({
          _id: claimId,
          claimId,
          claimantWhatsApp: normalizedPhone,
          createdAt: now,
        }),
        lookupsCol.insertOne({
          _id: claimCodeHash,
          claimId,
          noticeId,
          createdAt: now,
        }),
      ];

      if (noticeDoc.reporterPhoneHash && noticeDoc.reporterPhoneHash.length === 64) {
        const notifCol = await getCollection<NotificationDoc>('notifications');
        ops.push(
          notifCol.insertOne({
            _id: generateDocId('ntf'),
            recipientPhoneHash: noticeDoc.reporterPhoneHash,
            ...(noticeDoc.institutionId ? { institutionId: noticeDoc.institutionId } : {}),
            kind: 'new_claim',
            noticeId,
            claimId,
            title: `Response on ${noticeDoc.title || 'your notice'}`.slice(0, 140),
            message: `${claimantName} answered your verification questions and uploaded evidence. Review on My Notices.`.slice(
              0,
              400
            ),
            read: false,
            createdAt: now,
          })
        );
      }

      await Promise.all(ops);
      res.status(201).json({ claimId, claimCode });
    })
  );

  app.post(
    '/api/claims/:claimId/approve',
    asyncHandler(async (req, res) => {
      const claimId = String(req.params.claimId || '').trim();
      const noticeId = String(req.body?.noticeId || '').trim();
      const claimCodeHash = String(req.body?.claimCodeHash || '').trim();
      const reporterName = String(req.body?.reporterName || '').trim();
      const reporterWhatsApp = String(req.body?.reporterWhatsApp || '').trim();

      const noticesCol = await getCollection<NoticeDoc>('notices');
      const claimsCol = await getCollection<ClaimDoc>('claims');
      const [noticeDoc, claimDoc] = await Promise.all([
        noticesCol.findOne({ _id: noticeId }),
        claimsCol.findOne({ _id: claimId }),
      ]);

      if (!noticeDoc) {
        res.status(404).json({ error: 'Notice not found.' });
        return;
      }
      if (noticeDoc.approvedClaimId) {
        res.status(409).json({
          error:
            'Another claim is already approved for this notice. Revoke/reject that approval first before approving a different claimant.',
        });
        return;
      }

      const now = new Date();
      const handoversCol = await getCollection<ClaimHandoverDoc>('claimHandovers');

      const ops: Promise<unknown>[] = [
        noticesCol.updateOne(
          { _id: noticeId },
          { $set: { approvedClaimId: claimId, updatedAt: now } }
        ),
        claimsCol.updateOne(
          { _id: claimId },
          { $set: { status: 'approved', rejectionReason: null, updatedAt: now } }
        ),
        handoversCol.updateOne(
          { _id: claimCodeHash },
          {
            $set: {
              claimId,
              noticeId,
              reporterName,
              reporterWhatsApp,
              approvedAt: now,
            },
          },
          { upsert: true }
        ),
      ];

      if (claimDoc && claimDoc.claimantPhoneHash.length === 64) {
        const notifCol = await getCollection<NotificationDoc>('notifications');
        ops.push(
          notifCol.insertOne({
            _id: generateDocId('ntf'),
            recipientPhoneHash: claimDoc.claimantPhoneHash,
            ...(noticeDoc.institutionId ? { institutionId: noticeDoc.institutionId } : {}),
            kind: 'claim_approved',
            noticeId,
            claimId,
            title: `Claim approved: ${noticeDoc.title || 'Campus Item'}`.slice(0, 140),
            message: `${reporterName} approved your claim. Open Track Claim to view their WhatsApp contact for handover.`.slice(
              0,
              400
            ),
            read: false,
            createdAt: now,
          })
        );
      }

      await Promise.all(ops);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/claims/:claimId/reject',
    asyncHandler(async (req, res) => {
      const claimId = String(req.params.claimId || '').trim();
      const noticeId = String(req.body?.noticeId || '').trim();
      const reason = String(req.body?.rejectionReason || '').trim();
      const wasApproved = Boolean(req.body?.wasApproved);

      if (reason.length < 3) {
        res.status(400).json({
          error: 'Please provide a clear rejection reason (at least 3 characters).',
        });
        return;
      }

      const noticesCol = await getCollection<NoticeDoc>('notices');
      const claimsCol = await getCollection<ClaimDoc>('claims');
      const [noticeDoc, claimDoc] = await Promise.all([
        noticesCol.findOne({ _id: noticeId }),
        claimsCol.findOne({ _id: claimId }),
      ]);

      const now = new Date();
      const ops: Promise<unknown>[] = [
        claimsCol.updateOne(
          { _id: claimId },
          { $set: { status: 'rejected', rejectionReason: reason, updatedAt: now } }
        ),
      ];

      if (wasApproved) {
        ops.push(
          noticesCol.updateOne(
            { _id: noticeId },
            { $set: { approvedClaimId: null, updatedAt: now } }
          )
        );
      }

      if (claimDoc && claimDoc.claimantPhoneHash.length === 64) {
        const notifCol = await getCollection<NotificationDoc>('notifications');
        const noticeTitle = noticeDoc?.title || 'Campus Item';
        ops.push(
          notifCol.insertOne({
            _id: generateDocId('ntf'),
            recipientPhoneHash: claimDoc.claimantPhoneHash,
            ...(noticeDoc?.institutionId ? { institutionId: noticeDoc.institutionId } : {}),
            kind: 'claim_rejected',
            noticeId,
            claimId,
            title: `Claim update: ${noticeTitle}`.slice(0, 140),
            message: `Claim rejected: ${reason}. You can resubmit with stronger evidence.`.slice(
              0,
              400
            ),
            read: false,
            createdAt: now,
          })
        );
      }

      await Promise.all(ops);
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/claims/track',
    asyncHandler(async (req, res) => {
      const normalizedCode = String(req.query.code || '').trim().toUpperCase();
      if (!normalizedCode) {
        res.status(400).json({ error: 'Claim code is required.' });
        return;
      }

      const codeHash = sha256HexServer(normalizedCode);
      const lookupsCol = await getCollection<ClaimCodeLookupDoc>('claimCodeLookups');
      const lookupDoc = await lookupsCol.findOne({ _id: codeHash });
      if (!lookupDoc) {
        res.status(404).json({ error: 'Claim code not found.' });
        return;
      }

      const claimsCol = await getCollection<ClaimDoc>('claims');
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const [claimDoc, noticeDoc] = await Promise.all([
        claimsCol.findOne({ _id: lookupDoc.claimId }),
        noticesCol.findOne({ _id: lookupDoc.noticeId }),
      ]);

      if (!claimDoc) {
        res.status(404).json({ error: 'Claim record not found.' });
        return;
      }

      let handover = null;
      if (claimDoc.status === 'approved') {
        const handoversCol = await getCollection<ClaimHandoverDoc>('claimHandovers');
        const handoverDoc = await handoversCol.findOne({ _id: codeHash });
        if (handoverDoc) {
          handover = {
            claimId: handoverDoc.claimId,
            noticeId: handoverDoc.noticeId,
            reporterName: handoverDoc.reporterName,
            reporterWhatsApp: handoverDoc.reporterWhatsApp,
            approvedAt: handoverDoc.approvedAt,
          };
        }
      }

      res.json({
        claim: serializeClaim(claimDoc),
        notice: noticeDoc ? serializeNotice(noticeDoc) : null,
        handover,
      });
    })
  );

  app.post(
    '/api/claims/:claimId/resubmit',
    asyncHandler(async (req, res) => {
      const claimId = String(req.params.claimId || '').trim();
      const combinedEvidence = Array.isArray(req.body?.evidenceUrls)
        ? req.body.evidenceUrls.map(String).filter(Boolean).slice(0, 5)
        : [];
      if (combinedEvidence.length < 1) {
        res.status(400).json({ error: 'At least 1 evidence file is required.' });
        return;
      }

      const answers = Array.isArray(req.body?.answers)
        ? req.body.answers.map((a: { question?: unknown; answer?: unknown }) => ({
            question: String(a?.question || '').trim(),
            answer: String(a?.answer || '').trim(),
          }))
        : [];

      const claimsCol = await getCollection<ClaimDoc>('claims');
      const claimDoc = await claimsCol.findOne({ _id: claimId });
      if (!claimDoc) {
        res.status(404).json({ error: 'Claim not found.' });
        return;
      }

      const noticesCol = await getCollection<NoticeDoc>('notices');
      const noticeDoc = claimDoc.noticeId
        ? await noticesCol.findOne({ _id: claimDoc.noticeId })
        : null;

      const now = new Date();
      const ops: Promise<unknown>[] = [
        claimsCol.updateOne(
          { _id: claimId },
          {
            $set: {
              answers,
              evidenceUrls: combinedEvidence,
              status: 'pending',
              rejectionReason: null,
              updatedAt: now,
            },
          }
        ),
      ];

      if (noticeDoc && noticeDoc.reporterPhoneHash.length === 64) {
        const notifCol = await getCollection<NotificationDoc>('notifications');
        ops.push(
          notifCol.insertOne({
            _id: generateDocId('ntf'),
            recipientPhoneHash: noticeDoc.reporterPhoneHash,
            ...(noticeDoc.institutionId ? { institutionId: noticeDoc.institutionId } : {}),
            kind: 'claim_resubmitted',
            noticeId: noticeDoc._id,
            claimId,
            title: `Updated claim on ${noticeDoc.title || 'your notice'}`.slice(0, 140),
            message: `${claimDoc.claimantName || 'A claimant'} resubmitted updated answers and evidence for review.`.slice(
              0,
              400
            ),
            read: false,
            createdAt: now,
          })
        );
      }

      await Promise.all(ops);
      res.json({ ok: true });
    })
  );

  // --- Abuse Reports ---
  app.post(
    '/api/reports',
    asyncHandler(async (req, res) => {
      const targetType = req.body?.targetType === 'claim' ? 'claim' : 'notice';
      const targetId = String(req.body?.targetId || '').trim();
      const reason = String(req.body?.reason || '').trim();
      if (!targetId || reason.length < 3) {
        res.status(400).json({ error: 'Please provide a valid report reason.' });
        return;
      }
      const col = await getCollection<AbuseReportDoc>('reports');
      await col.insertOne({
        _id: generateDocId('rpt'),
        targetType,
        targetId,
        reason,
        status: 'open',
        createdAt: new Date(),
      });
      res.status(201).json({ ok: true });
    })
  );

  // --- Student Follow-Up Accounts, Vaults & Notifications ---
  app.post(
    '/api/accounts/register',
    asyncHandler(async (req, res) => {
      const cleanName = String(req.body?.name || '').trim();
      if (cleanName.length < 2) {
        res.status(400).json({ error: 'Please enter your full name.' });
        return;
      }
      const cleanInstId = String(req.body?.institutionId || '').trim();
      const cleanInstName = String(req.body?.institutionName || '').trim();
      if (!cleanInstId || !cleanInstName) {
        res.status(400).json({ error: 'Please select your campus institution.' });
        return;
      }
      const normalizedPhone = normalizeUgPhone(String(req.body?.phoneNumber || ''));
      if (!isValidUgPhone(normalizedPhone)) {
        res.status(400).json({
          error: 'Enter a valid Ugandan WhatsApp number (+256 followed by 9 digits).',
        });
        return;
      }

      const bannedCol = await getCollection<BannedNumberDoc>('bannedNumbers');
      const banned = await bannedCol.findOne({ _id: normalizedPhone });
      if (banned) {
        res.status(403).json({
          error: `This WhatsApp number is suspended (${banned.reason || 'Policy violation'}).`,
        });
        return;
      }

      const cleanPin = String(req.body?.pin || '').trim();
      if (cleanPin.length < 4 || cleanPin.length > 12) {
        res.status(400).json({
          error: 'Choose a PIN between 4 and 12 characters to protect your follow-up account.',
        });
        return;
      }

      const phoneHash = sha256HexServer(normalizedPhone);
      const pinHash = sha256HexServer(cleanPin);
      const accessKey = sha256HexServer(`${normalizedPhone}:${pinHash}`);

      const accountsCol = await getCollection<AccountDoc>('accounts');
      const existing = await accountsCol.findOne({ _id: phoneHash });
      if (existing) {
        res.status(409).json({
          error:
            'An account already exists for this WhatsApp number. Switch to Sign In and enter your PIN.',
        });
        return;
      }

      const now = new Date();
      await accountsCol.insertOne({
        _id: phoneHash,
        name: cleanName,
        phoneNumber: normalizedPhone,
        pinHash,
        institutionId: cleanInstId,
        institutionName: cleanInstName,
        previousPhoneHashes: [],
        createdAt: now,
        updatedAt: now,
      });

      res.status(201).json({
        session: {
          name: cleanName,
          phoneNumber: normalizedPhone,
          phoneHash,
          accessKey,
          institutionId: cleanInstId,
          institutionName: cleanInstName,
          previousPhoneHashes: [],
        },
      });
    })
  );

  app.post(
    '/api/accounts/login',
    asyncHandler(async (req, res) => {
      const normalizedPhone = normalizeUgPhone(String(req.body?.phoneNumber || ''));
      if (!isValidUgPhone(normalizedPhone)) {
        res.status(400).json({
          error: 'Enter a valid Ugandan WhatsApp number (+256 followed by 9 digits).',
        });
        return;
      }
      const cleanPin = String(req.body?.pin || '').trim();
      if (cleanPin.length < 4) {
        res.status(400).json({ error: 'Enter your 4+ character account PIN.' });
        return;
      }

      const phoneHash = sha256HexServer(normalizedPhone);
      const pinHash = sha256HexServer(cleanPin);
      const accessKey = sha256HexServer(`${normalizedPhone}:${pinHash}`);

      const accountsCol = await getCollection<AccountDoc>('accounts');
      const doc = await accountsCol.findOne({ _id: phoneHash });
      if (!doc) {
        res.status(404).json({
          error: 'No account found for this WhatsApp number. Create an account first.',
        });
        return;
      }
      if (doc.pinHash !== pinHash) {
        res.status(401).json({ error: 'Incorrect PIN for this WhatsApp number.' });
        return;
      }

      res.json({
        session: {
          name: doc.name || 'Student',
          phoneNumber: normalizedPhone,
          phoneHash,
          accessKey,
          institutionId: doc.institutionId || '',
          institutionName: doc.institutionName || '',
          previousPhoneHashes: Array.isArray(doc.previousPhoneHashes)
            ? doc.previousPhoneHashes.filter((h) => h.length === 64)
            : [],
        },
      });
    })
  );

  app.put(
    '/api/accounts/profile',
    asyncHandler(async (req, res) => {
      const currentSession = req.body?.currentSession;
      const cleanName = String(req.body?.newName || '').trim();
      const cleanInstId = String(req.body?.newInstitutionId || '').trim();
      const cleanInstName = String(req.body?.newInstitutionName || '').trim();
      const normalizedNewPhone = normalizeUgPhone(String(req.body?.newPhoneNumber || ''));

      if (cleanName.length < 2 || cleanName.length > 80) {
        res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
        return;
      }
      if (!cleanInstId || !cleanInstName) {
        res.status(400).json({ error: 'Please select your campus institution.' });
        return;
      }
      if (!isValidUgPhone(normalizedNewPhone)) {
        res.status(400).json({
          error: 'Enter a valid Ugandan WhatsApp number (+256 followed by 9 digits).',
        });
        return;
      }

      const bannedCol = await getCollection<BannedNumberDoc>('bannedNumbers');
      const banned = await bannedCol.findOne({ _id: normalizedNewPhone });
      if (banned) {
        res.status(403).json({
          error: `This WhatsApp number is suspended (${banned.reason || 'Policy violation'}).`,
        });
        return;
      }

      const oldPhoneHash = String(currentSession?.phoneHash || '');
      const oldAccessKey = String(currentSession?.accessKey || '');
      const accountsCol = await getCollection<AccountDoc>('accounts');
      const oldDoc = await accountsCol.findOne({ _id: oldPhoneHash });
      if (!oldDoc) {
        res.status(404).json({
          error: 'Your account record could not be found. Please sign out and sign in again.',
        });
        return;
      }

      const vaultsCol = await getCollection<AccountVaultDoc>('accountVaults');
      const secretsCol = await getCollection<NoticeSecretDoc>('noticeSecrets');
      const oldVault = oldAccessKey ? await vaultsCol.findOne({ _id: oldAccessKey }) : null;
      const tokenHashes = (oldVault?.notices || []).map((n) => sha256HexServer(n.managementToken));
      const now = new Date();

      if (normalizedNewPhone === currentSession?.phoneNumber) {
        await accountsCol.updateOne(
          { _id: oldPhoneHash },
          {
            $set: {
              name: cleanName,
              institutionId: cleanInstId,
              institutionName: cleanInstName,
              updatedAt: now,
            },
          }
        );
        if (tokenHashes.length > 0) {
          await secretsCol.updateMany(
            { _id: { $in: tokenHashes } },
            { $set: { reporterName: cleanName } }
          );
        }
        res.json({
          session: {
            ...currentSession,
            name: cleanName,
            institutionId: cleanInstId,
            institutionName: cleanInstName,
          },
        });
        return;
      }

      const newPhoneHash = sha256HexServer(normalizedNewPhone);
      const targetExists = await accountsCol.findOne({ _id: newPhoneHash });
      if (targetExists) {
        res.status(409).json({
          error:
            'Another account is already registered with that WhatsApp number. Choose a different number.',
        });
        return;
      }

      const pinHash = oldDoc.pinHash;
      const newAccessKey = sha256HexServer(`${normalizedNewPhone}:${pinHash}`);
      const existingPrev = Array.isArray(oldDoc.previousPhoneHashes)
        ? oldDoc.previousPhoneHashes.filter((h) => h.length === 64)
        : [];
      const nextPrevHashes = Array.from(new Set([...existingPrev, oldPhoneHash]))
        .filter((h) => h !== newPhoneHash)
        .slice(-10);

      await accountsCol.insertOne({
        _id: newPhoneHash,
        name: cleanName,
        phoneNumber: normalizedNewPhone,
        pinHash,
        institutionId: cleanInstId,
        institutionName: cleanInstName,
        previousPhoneHashes: nextPrevHashes,
        createdAt: oldDoc.createdAt || now,
        updatedAt: now,
      });
      await accountsCol.deleteOne({ _id: oldPhoneHash });

      if (oldVault) {
        await vaultsCol.updateOne(
          { _id: newAccessKey },
          {
            $set: {
              notices: oldVault.notices || [],
              claims: oldVault.claims || [],
              updatedAt: now,
            },
          },
          { upsert: true }
        );
        await vaultsCol.deleteOne({ _id: oldAccessKey });
      }

      if (tokenHashes.length > 0) {
        await secretsCol.updateMany(
          { _id: { $in: tokenHashes } },
          { $set: { reporterName: cleanName, reporterWhatsApp: normalizedNewPhone } }
        );
      }

      res.json({
        session: {
          name: cleanName,
          phoneNumber: normalizedNewPhone,
          phoneHash: newPhoneHash,
          accessKey: newAccessKey,
          institutionId: cleanInstId,
          institutionName: cleanInstName,
          previousPhoneHashes: nextPrevHashes,
        },
      });
    })
  );

  // --- Account Vault ---
  app.get(
    '/api/accounts/vault',
    asyncHandler(async (req, res) => {
      const accessKey = String(req.query.accessKey || '').trim();
      if (!accessKey) {
        res.json({ notices: [], claims: [] });
        return;
      }
      const vaultsCol = await getCollection<AccountVaultDoc>('accountVaults');
      const vault = await vaultsCol.findOne({ _id: accessKey });
      res.json({
        notices: vault?.notices || [],
        claims: vault?.claims || [],
      });
    })
  );

  app.post(
    '/api/accounts/vault/notices',
    asyncHandler(async (req, res) => {
      const accessKey = String(req.body?.accessKey || '').trim();
      const entry = req.body?.entry;
      if (!accessKey || !entry?.noticeId) {
        res.status(400).json({ error: 'Invalid vault notice entry.' });
        return;
      }
      const vaultsCol = await getCollection<AccountVaultDoc>('accountVaults');
      const existing = await vaultsCol.findOne({ _id: accessKey });
      const prevNotices = (existing?.notices || []).filter(
        (n) => n.noticeId !== entry.noticeId
      );
      const nextNotices = [
        {
          noticeId: String(entry.noticeId),
          managementToken: String(entry.managementToken || ''),
          title: String(entry.title || 'Notice').slice(0, 120),
          type: entry.type === 'lost' ? ('lost' as const) : ('found' as const),
          createdAt: String(entry.createdAt || new Date().toISOString()),
        },
        ...prevNotices,
      ].slice(0, 50);

      await vaultsCol.updateOne(
        { _id: accessKey },
        {
          $set: {
            notices: nextNotices,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            claims: [],
          },
        },
        { upsert: true }
      );
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/accounts/vault/claims',
    asyncHandler(async (req, res) => {
      const accessKey = String(req.body?.accessKey || '').trim();
      const entry = req.body?.entry;
      if (!accessKey || !entry?.claimId) {
        res.status(400).json({ error: 'Invalid vault claim entry.' });
        return;
      }
      const vaultsCol = await getCollection<AccountVaultDoc>('accountVaults');
      const existing = await vaultsCol.findOne({ _id: accessKey });
      const prevClaims = (existing?.claims || []).filter(
        (c) => c.claimId !== entry.claimId
      );
      const nextClaims = [
        {
          claimId: String(entry.claimId),
          claimCode: String(entry.claimCode || ''),
          noticeId: String(entry.noticeId || ''),
          noticeTitle: String(entry.noticeTitle || 'Campus Item').slice(0, 120),
          createdAt: String(entry.createdAt || new Date().toISOString()),
        },
        ...prevClaims,
      ].slice(0, 50);

      await vaultsCol.updateOne(
        { _id: accessKey },
        {
          $set: {
            claims: nextClaims,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            notices: [],
          },
        },
        { upsert: true }
      );
      res.json({ ok: true });
    })
  );

  // --- Notifications ---
  app.get(
    '/api/notifications',
    asyncHandler(async (req, res) => {
      const rawHashes = String(req.query.hashes || '');
      const hashList = Array.from(
        new Set(
          rawHashes
            .split(',')
            .map((h) => h.trim())
            .filter((h) => h.length === 64)
        )
      ).slice(0, 10);

      if (hashList.length === 0) {
        res.json({ notifications: [] });
        return;
      }

      const col = await getCollection<NotificationDoc>('notifications');
      const docs = await col
        .find({ recipientPhoneHash: { $in: hashList } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      res.json({
        notifications: docs.map((d) => ({
          id: d._id,
          recipientPhoneHash: d.recipientPhoneHash,
          institutionId: d.institutionId,
          kind: d.kind,
          noticeId: d.noticeId,
          claimId: d.claimId,
          title: d.title,
          message: d.message,
          read: Boolean(d.read),
          createdAt: d.createdAt,
        })),
      });
    })
  );

  app.patch(
    '/api/notifications/:id/read',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id || '').trim();
      const col = await getCollection<NotificationDoc>('notifications');
      await col.updateOne({ _id: id }, { $set: { read: true } });
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/notifications/mark-all-read',
    asyncHandler(async (req, res) => {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map(String).filter(Boolean).slice(0, 100)
        : [];
      if (ids.length > 0) {
        const col = await getCollection<NotificationDoc>('notifications');
        await col.updateMany({ _id: { $in: ids } }, { $set: { read: true } });
      }
      res.json({ ok: true });
    })
  );

  // --- Admin Auth & Moderation Routes ---
  app.post(
    '/api/admin/login',
    asyncHandler(async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) {
        res.status(400).json({ error: 'Admin email and password are required.' });
        return;
      }
      const adminsCol = await getCollection<AdminDoc>('admins');
      const admin = await adminsCol.findOne({
        $or: [{ _id: email }, { email }],
      });
      if (!admin || !verifyAdminPassword(password, String(admin.passwordHash || ''))) {
        res.status(401).json({ error: 'Invalid admin email or password.' });
        return;
      }
      const token = signAdminToken(admin.email || email);
      res.json({ token, admin: { email: admin.email || email } });
    })
  );

  app.get(
    '/api/admin/me',
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json({ admin: { email: req.adminEmail } });
    })
  );

  app.put(
    '/api/admin/password',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const newPassword = String(req.body?.newPassword || '').trim();
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Admin password must be at least 6 characters.' });
        return;
      }
      const adminsCol = await getCollection<AdminDoc>('admins');
      await adminsCol.updateOne(
        { _id: req.adminEmail! },
        {
          $set: {
            passwordHash: hashAdminPassword(newPassword),
            passwordCustomized: true,
            updatedAt: new Date(),
          },
        }
      );
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/admin/dashboard',
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const [noticesCol, secretsCol, claimsCol, contactsCol, reportsCol, bannedCol] =
        await Promise.all([
          getCollection<NoticeDoc>('notices'),
          getCollection<NoticeSecretDoc>('noticeSecrets'),
          getCollection<ClaimDoc>('claims'),
          getCollection<ClaimContactDoc>('claimContacts'),
          getCollection<AbuseReportDoc>('reports'),
          getCollection<BannedNumberDoc>('bannedNumbers'),
        ]);

      const [noticeDocs, secretDocs, claimDocs, contactDocs, reportDocs, bannedDocs] =
        await Promise.all([
          noticesCol.find({}).sort({ createdAt: -1 }).toArray(),
          secretsCol.find({}).toArray(),
          claimsCol.find({}).sort({ createdAt: -1 }).toArray(),
          contactsCol.find({}).toArray(),
          reportsCol.find({}).sort({ createdAt: -1 }).toArray(),
          bannedCol.find({}).sort({ bannedAt: -1 }).toArray(),
        ]);

      const noticeContacts: Record<string, { reporterName: string; reporterWhatsApp: string }> = {};
      for (const s of secretDocs) {
        if (s.noticeId) {
          noticeContacts[s.noticeId] = {
            reporterName: s.reporterName,
            reporterWhatsApp: s.reporterWhatsApp,
          };
        }
      }

      const contactMap = new Map<string, string>();
      for (const c of contactDocs) {
        contactMap.set(c._id, c.claimantWhatsApp || '');
      }

      res.json({
        notices: noticeDocs.map(serializeNotice),
        noticeContacts,
        claims: claimDocs.map((c) => serializeClaim(c, contactMap.get(c._id))),
        reports: reportDocs.map((r) => ({
          id: r._id,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt,
        })),
        bannedNumbers: bannedDocs.map((b) => ({
          phoneNumber: b.phoneNumber || b._id,
          reason: b.reason,
          bannedAt: b.bannedAt,
        })),
      });
    })
  );

  app.post(
    '/api/admin/notices/:id/remove',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const noticeId = String(req.params.id || '').trim();
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const now = new Date();
      await noticesCol.updateOne(
        { _id: noticeId },
        { $set: { status: 'removed', closedAt: now, updatedAt: now } }
      );
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/banned',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const normalized = normalizeUgPhone(String(req.body?.phoneNumber || ''));
      if (!isValidUgPhone(normalized)) {
        res.status(400).json({ error: 'Banned number must match +256 followed by 9 digits.' });
        return;
      }
      const reason = String(req.body?.reason || '').trim();
      const bannedCol = await getCollection<BannedNumberDoc>('bannedNumbers');
      await bannedCol.updateOne(
        { _id: normalized },
        {
          $set: {
            phoneNumber: normalized,
            reason,
            bannedAt: new Date(),
          },
        },
        { upsert: true }
      );
      res.json({ ok: true });
    })
  );

  app.delete(
    '/api/admin/banned/:phoneNumber',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const phoneNumber = decodeURIComponent(String(req.params.phoneNumber || '').trim());
      const bannedCol = await getCollection<BannedNumberDoc>('bannedNumbers');
      await bannedCol.deleteOne({ _id: phoneNumber });
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/reports/:id/resolve',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const reportId = String(req.params.id || '').trim();
      const reportsCol = await getCollection<AbuseReportDoc>('reports');
      await reportsCol.updateOne({ _id: reportId }, { $set: { status: 'resolved' } });
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/purge-evidence',
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const noticesCol = await getCollection<NoticeDoc>('notices');
      const claimsCol = await getCollection<ClaimDoc>('claims');

      const allClosed = await noticesCol
        .find({ status: { $in: ['returned', 'archived', 'removed'] } })
        .toArray();

      const expiredClosedNoticeIds = allClosed
        .filter((n) => isOlderThanDays(n.closedAt || n.updatedAt, 30))
        .map((n) => n._id);

      let purgedClaims = 0;
      if (expiredClosedNoticeIds.length > 0) {
        const result = await claimsCol.updateMany(
          {
            noticeId: { $in: expiredClosedNoticeIds },
            evidenceUrls: { $exists: true, $ne: [] },
          },
          {
            $set: {
              evidenceUrls: [],
              updatedAt: new Date(),
            },
          }
        );
        purgedClaims = result.modifiedCount;
      }

      res.json({ purgedClaims });
    })
  );

  // Error handler for API routes
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[API Error]', err);
    res.status(500).json({ error: message });
  });

  // Frontend middleware / static serving
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

createApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`CampusTrace server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start CampusTrace server:', err);
    process.exit(1);
  });
