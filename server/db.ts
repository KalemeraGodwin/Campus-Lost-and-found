import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { Collection, Db, Document } from 'mongodb';

export const DB_NAME = 'myAppDatabase';

export interface InstitutionDoc {
  _id: string;
  name: string;
  locations: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NoticeDoc {
  _id: string;
  type: 'found' | 'lost';
  status: 'open' | 'returned' | 'archived' | 'removed';
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

export interface NoticeSecretDoc {
  _id: string;
  noticeId: string;
  reporterName: string;
  reporterWhatsApp: string;
  verificationQuestions: { question: string; expectedAnswer: string }[];
  createdAt: Date;
}

export interface ClaimDoc {
  _id: string;
  claimCodeHash: string;
  noticeId: string;
  claimantName: string;
  claimantPhoneHash: string;
  answers: { question: string; answer: string }[];
  evidenceUrls: string[];
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimContactDoc {
  _id: string;
  claimId: string;
  claimantWhatsApp: string;
  createdAt: Date;
}

export interface ClaimCodeLookupDoc {
  _id: string;
  claimId: string;
  noticeId: string;
  createdAt: Date;
}

export interface ClaimHandoverDoc {
  _id: string;
  claimId: string;
  noticeId: string;
  reporterName: string;
  reporterWhatsApp: string;
  approvedAt: Date;
}

export interface AccountDoc {
  _id: string;
  name: string;
  phoneNumber: string;
  pinHash: string;
  institutionId: string;
  institutionName: string;
  previousPhoneHashes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountVaultDoc {
  _id: string;
  notices: {
    noticeId: string;
    managementToken: string;
    title: string;
    type: 'found' | 'lost';
    createdAt: string;
  }[];
  claims: {
    claimId: string;
    claimCode: string;
    noticeId: string;
    noticeTitle: string;
    createdAt: string;
  }[];
  updatedAt: Date;
}

export interface NotificationDoc {
  _id: string;
  recipientPhoneHash: string;
  institutionId?: string;
  kind: 'new_claim' | 'claim_resubmitted' | 'claim_approved' | 'claim_rejected';
  noticeId: string;
  claimId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface AbuseReportDoc {
  _id: string;
  targetType: 'notice' | 'claim';
  targetId: string;
  reason: string;
  status: 'open' | 'resolved';
  createdAt: Date;
}

export interface BannedNumberDoc {
  _id: string;
  phoneNumber: string;
  reason: string;
  bannedAt: Date;
}

export interface AdminDoc {
  _id: string;
  email: string;
  passwordHash: string;
  passwordCustomized?: boolean;
  role: 'admin';
  createdAt: Date;
  updatedAt: Date;
}

interface CachedMongo {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
  initialized: boolean;
  initPromise: Promise<void> | null;
}

const globalForMongo = globalThis as typeof globalThis & {
  __campustraceMongoCache?: CachedMongo;
};

const cached: CachedMongo = globalForMongo.__campustraceMongoCache ?? {
  client: null,
  promise: null,
  initialized: false,
  initPromise: null,
};

globalForMongo.__campustraceMongoCache = cached;

export function sha256HexServer(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashAdminPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyAdminPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cached.client) {
    return cached.client;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    throw new Error(
      'MONGODB_URI environment variable is missing. Configure MONGODB_URI to connect to MongoDB Atlas.'
    );
  }

  if (!cached.promise) {
    const client = new MongoClient(uri.trim(), {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    cached.promise = client
      .connect()
      .then((connected) => {
        cached.client = connected;
        return connected;
      })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }

  return cached.promise;
}

export async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}

export async function getCollection<T extends Document = Document>(
  name: string
): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(name);
}

const DEFAULT_INSTITUTIONS: Omit<InstitutionDoc, 'createdAt' | 'updatedAt'>[] = [
  {
    _id: 'inst_makerere',
    name: 'Makerere University',
    locations: [
      'Main Library',
      'Senate Courtyard',
      'Freedom Square',
      'Computing & IT Block',
      'Engineering Wing',
      'Science Complex',
      'Student Guild Canteen',
      'Campus Security Desk',
    ],
  },
  {
    _id: 'inst_kyambogo',
    name: 'Kyambogo University',
    locations: [
      'Barclays Library',
      'Faculty of Engineering',
      'Central Teaching Facility',
      'West End Dining Hall',
      'Peace Park',
      'Campus Security Post',
    ],
  },
];

async function runInitialization(): Promise<void> {
  const db = await getDatabase();

  // Create indexes idempotently
  await Promise.all([
    db.collection<NoticeDoc>('notices').createIndex({ institutionId: 1, status: 1, createdAt: -1 }),
    db.collection<NoticeDoc>('notices').createIndex({ reporterPhoneHash: 1, createdAt: -1 }),
    db.collection<NoticeSecretDoc>('noticeSecrets').createIndex({ noticeId: 1 }),
    db.collection<ClaimDoc>('claims').createIndex({ noticeId: 1, createdAt: -1 }),
    db.collection<ClaimDoc>('claims').createIndex({ claimantPhoneHash: 1, createdAt: -1 }),
    db.collection<NotificationDoc>('notifications').createIndex({ recipientPhoneHash: 1, createdAt: -1 }),
  ]);

  // Seed default institutions if empty
  const instCol = db.collection<InstitutionDoc>('institutions');
  const instCount = await instCol.countDocuments();
  if (instCount === 0) {
    const now = new Date();
    await instCol.insertMany(
      DEFAULT_INSTITUTIONS.map((inst) => ({
        ...inst,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  // Seed initial campus notices if empty
  const noticesCol = db.collection<NoticeDoc>('notices');
  const noticeCount = await noticesCol.countDocuments({
    status: { $in: ['open', 'returned', 'archived'] },
  });
  if (noticeCount === 0) {
    const now = Date.now();
    const secretsCol = db.collection<NoticeSecretDoc>('noticeSecrets');
    const seedEntries = [
      {
        notice: {
          _id: 'seed_notice_backpack_01',
          type: 'found' as const,
          status: 'open' as const,
          category: 'Bags',
          title: 'Charcoal Canvas Backpack with Leather Straps',
          publicDescription:
            'Found left beneath a reading desk near the east windows on Level 2 of the Main Library. Contains a notebook and stainless steel water bottle in the side pocket.',
          location: 'Main Library',
          institutionId: 'inst_makerere',
          institutionName: 'Makerere University',
          itemDate: new Date(now - 1 * 86400000).toISOString().slice(0, 10),
          photos: ['/src/assets/images/campus_laptop_backpack_1794829991466.jpg'],
          reporterFirstName: 'Grace',
          verificationPrompts: [
            'What is the subject written on the hardcover book resting on top or inside?',
            'Describe the item clipped to the right carabiner strap.',
          ],
          reporterPhoneHash: sha256HexServer('+256772110401'),
          approvedClaimId: null,
          createdAt: new Date(now - 1 * 86400000),
          updatedAt: new Date(now - 1 * 86400000),
          closedAt: null,
        },
        secret: {
          _id: sha256HexServer('seed_token_backpack_01'),
          noticeId: 'seed_notice_backpack_01',
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
          createdAt: new Date(now - 1 * 86400000),
        },
      },
      {
        notice: {
          _id: 'seed_notice_keys_02',
          type: 'found' as const,
          status: 'open' as const,
          category: 'Keys',
          title: 'Two Brass Keys on Dark Green Woven Lanyard',
          publicDescription:
            'Picked up from the stone bench along the walkway outside Senate Courtyard around 11:30 AM. Handed in safely for owner verification.',
          location: 'Senate Courtyard',
          institutionId: 'inst_makerere',
          institutionName: 'Makerere University',
          itemDate: new Date(now - 2 * 86400000).toISOString().slice(0, 10),
          photos: ['/src/assets/images/campus_student_keys_1794829991929.jpg'],
          reporterFirstName: 'Samuel',
          verificationPrompts: [
            'What brand or number is stamped on the larger brass key?',
            'Which hall or room number does the smaller key open?',
          ],
          reporterPhoneHash: sha256HexServer('+256782220502'),
          approvedClaimId: null,
          createdAt: new Date(now - 2 * 86400000),
          updatedAt: new Date(now - 2 * 86400000),
          closedAt: null,
        },
        secret: {
          _id: sha256HexServer('seed_token_keys_02'),
          noticeId: 'seed_notice_keys_02',
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
          createdAt: new Date(now - 2 * 86400000),
        },
      },
      {
        notice: {
          _id: 'seed_notice_earbuds_03',
          type: 'found' as const,
          status: 'open' as const,
          category: 'Electronics',
          title: 'White Wireless Earbuds Charging Case (USB-C)',
          publicDescription:
            'Found on the third-row wooden desk in Lecture Theatre B right after the morning session. Case still holds battery charge.',
          location: 'Computing & IT Block',
          institutionId: 'inst_makerere',
          institutionName: 'Makerere University',
          itemDate: new Date(now - 3 * 86400000).toISOString().slice(0, 10),
          photos: ['/src/assets/images/campus_wireless_earbuds_1794829992623.jpg'],
          reporterFirstName: 'Daniel',
          verificationPrompts: [
            'What Bluetooth device name appears when the lid is opened?',
            'Is there any small engraving or mark inside the charging lid?',
          ],
          reporterPhoneHash: sha256HexServer('+256701330603'),
          approvedClaimId: null,
          createdAt: new Date(now - 3 * 86400000),
          updatedAt: new Date(now - 3 * 86400000),
          closedAt: null,
        },
        secret: {
          _id: sha256HexServer('seed_token_earbuds_03'),
          noticeId: 'seed_notice_earbuds_03',
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
          createdAt: new Date(now - 3 * 86400000),
        },
      },
      {
        notice: {
          _id: 'seed_notice_calculator_04',
          type: 'lost' as const,
          status: 'open' as const,
          category: 'Electronics',
          title: 'Black Scientific Calculator Left at Courtyard Table',
          publicDescription:
            'Lost my black scientific calculator with red AC/DEL keys during lunch hour near the concrete tables. Needed urgently for upcoming engineering exams.',
          location: 'Freedom Square',
          institutionId: 'inst_makerere',
          institutionName: 'Makerere University',
          itemDate: new Date(now - 4 * 86400000).toISOString().slice(0, 10),
          photos: ['/src/assets/images/campus_scientific_calculator_1794829992795.jpg'],
          reporterFirstName: 'Miriam',
          verificationPrompts: [
            'What initials or sticker are written on the back battery cover?',
            'Does it have the slide-on protective hard cover attached?',
          ],
          reporterPhoneHash: sha256HexServer('+256752440704'),
          approvedClaimId: null,
          createdAt: new Date(now - 4 * 86400000),
          updatedAt: new Date(now - 4 * 86400000),
          closedAt: null,
        },
        secret: {
          _id: sha256HexServer('seed_token_calculator_04'),
          noticeId: 'seed_notice_calculator_04',
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
          createdAt: new Date(now - 4 * 86400000),
        },
      },
    ];

    for (const entry of seedEntries) {
      await noticesCol.updateOne(
        { _id: entry.notice._id },
        { $setOnInsert: entry.notice },
        { upsert: true }
      );
      await secretsCol.updateOne(
        { _id: entry.secret._id },
        { $setOnInsert: entry.secret },
        { upsert: true }
      );
    }
  }

  // Ensure primary admin exists in admins collection with password kalem1111
  const primaryEmails = Array.from(
    new Set(
      [
        'kalemeragodie@gmail.com',
        (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
      ].filter(Boolean)
    )
  );
  const adminDefaultPw = 'kalem1111';
  const adminsCol = db.collection<AdminDoc>('admins');

  for (const adminEmail of primaryEmails) {
    const existingAdmin = await adminsCol.findOne({
      $or: [{ _id: adminEmail }, { email: adminEmail }],
    });
    if (!existingAdmin) {
      const now = new Date();
      await adminsCol.insertOne({
        _id: adminEmail,
        email: adminEmail,
        passwordHash: hashAdminPassword(adminDefaultPw),
        passwordCustomized: false,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[AdminInit] Created admin ${adminEmail}`);
    } else {
      const matches = verifyAdminPassword(adminDefaultPw, String(existingAdmin.passwordHash || ''));
      console.log(
        `[AdminInit] Found admin _id=${existingAdmin._id} customized=${Boolean(existingAdmin.passwordCustomized)} matchesDefault=${matches}`
      );
      if (!existingAdmin.passwordCustomized && !matches) {
        await adminsCol.updateOne(
          { _id: existingAdmin._id },
          {
            $set: {
              email: adminEmail,
              passwordHash: hashAdminPassword(adminDefaultPw),
              updatedAt: new Date(),
            },
          }
        );
        console.log(`[AdminInit] Reset uncustomized password for ${adminEmail}`);
      }
    }
  }
}

export async function ensureDbInitialized(): Promise<void> {
  if (cached.initialized) return;
  if (!cached.initPromise) {
    cached.initPromise = runInitialization()
      .then(() => {
        cached.initialized = true;
      })
      .catch((err) => {
        cached.initPromise = null;
        throw err;
      });
  }
  await cached.initPromise;
}
