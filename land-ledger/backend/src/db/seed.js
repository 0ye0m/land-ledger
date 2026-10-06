'use strict';

/**
 * LAND LEDGER - development/demo seed (MongoDB Atlas).
 *
 * CONTROLLED DEMONSTRATION ENVIRONMENT:
 *   Identities come exclusively from the 8-address email allowlist
 *   (src/config/allowlist.js). Role assignment is deterministic - running the
 *   seed repeatedly can never shuffle roles, so the demonstration stays
 *   predictable.
 *
 * Idempotent: skips when the allowlisted registrar account already exists
 * (use --force to wipe + reseed). Existing user IDs/relationships are
 * preserved; identities are aligned to the allowlist on reseed.
 *
 * Creates believable fictional data around the 8 users: properties across
 * every workflow stage, REAL document files with real SHA-256 fingerprints,
 * an application-level multi-owner record (MongoDB parties vs. the chain's
 * single current owner), consent-gated transfers, genuine fraud-engine runs,
 * and - only when the Hardhat node is reachable - REAL on-chain registrations
 * with real transaction hashes. Blockchain records are never fabricated.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectMongo } = require('./mongo');
const User = require('../models/User');
const Property = require('../models/Property');
const Document = require('../models/Document');
const TransferRequest = require('../models/TransferRequest');
const FraudCheck = require('../models/FraudCheck');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const Counter = require('../models/Counter');
const PropertyParty = require('../models/PropertyParty');
const TransferConsent = require('../models/TransferConsent');
const MfaChallenge = require('../models/MfaChallenge');
const { ensureIndexes } = require('./mongo-indexes');
const auditService = require('../services/auditService');
const blockchainService = require('../services/blockchainService');
const fraudService = require('../services/fraudService');
const { sha256Buffer } = require('../utils/hash');
const { bumpPropertyCursor, readCursor } = require('../utils/chainCursor');
const { ALLOWED_DEMO_USERS } = require('../config/allowlist');

const env = require('../config/env');

/** Deterministic demo password for every seeded account (presentation ease). */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'LandLedger@123';

// Well-known Hardhat accounts (test network only - valueless keys, never mainnet).
const W = {
  operator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  om: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  shruti: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  ganesh: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  kavita: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  registrar: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
};

/** Stable role map (Part 3) - >=2 citizens, 1 surveyor, 1 clerk, 1 registrar, 1 admin. */
const ROLE_BY_EMAIL = Object.fromEntries(ALLOWED_DEMO_USERS.map((u) => [u.email, u.role]));
const NAME_BY_EMAIL = Object.fromEntries(ALLOWED_DEMO_USERS.map((u) => [u.email, u.name]));
const WALLET_BY_EMAIL = {
  'mandwadeom2616@gmail.com': W.om,
  'shrutipethe111@gmail.com': W.shruti,
  'panpaliyaag@rknec.edu': null,
  'tekdiwalnishant@gmail.com': null,
  'omdummy101@gmail.com': W.registrar,
  'omdummy102@gmail.com': null,
  'alphadummy103@gmail.com': W.ganesh,
  'alpha20051610@gmail.com': W.kavita,
};
const PHONE_BY_EMAIL = {
  'mandwadeom2616@gmail.com': '+91 98220 11001',
  'shrutipethe111@gmail.com': '+91 98220 11002',
  'panpaliyaag@rknec.edu': '+91 98220 11003',
  'tekdiwalnishant@gmail.com': '+91 98220 11004',
  'omdummy101@gmail.com': '+91 98220 11005',
  'omdummy102@gmail.com': '+91 98220 11006',
  'alphadummy103@gmail.com': '+91 98220 11007',
  'alpha20051610@gmail.com': '+91 98220 11008',
};
const PLACE_BY_EMAIL = {
  'mandwadeom2616@gmail.com': { district: 'Pune', state: 'Maharashtra' },
  'shrutipethe111@gmail.com': { district: 'Pune', state: 'Maharashtra' },
  'panpaliyaag@rknec.edu': { district: 'Nagpur', state: 'Maharashtra' },
  'tekdiwalnishant@gmail.com': { district: 'Nagpur', state: 'Maharashtra' },
  'omdummy101@gmail.com': { district: 'Pune', state: 'Maharashtra' },
  'omdummy102@gmail.com': { district: 'Pune', state: 'Maharashtra' },
  'alphadummy103@gmail.com': { district: 'Pune', state: 'Maharashtra' },
  'alpha20051610@gmail.com': { district: 'Bengaluru Urban', state: 'Karnataka' },
};

// ---------- minimal but valid PDF generator ----------
function escapePdfText(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ' ');
}

function makeSeedPdf(title, lines) {
  const contentParts = ['BT /F1 16 Tf 50 800 Td (' + escapePdfText(title) + ') Tj ET'];
  let y = 770;
  for (const line of lines) {
    contentParts.push(`BT /F1 10 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`);
    y -= 16;
  }
  const content = contentParts.join('\n');
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ---------- helpers ----------
const uploadRoot = path.resolve(process.cwd(), env.uploads.dir);

function writeSeedFile(propertyDir, fileName, buffer) {
  const dir = path.join(uploadRoot, 'seed', propertyDir);
  fs.mkdirSync(dir, { recursive: true });
  const absolute = path.join(dir, fileName);
  fs.writeFileSync(absolute, buffer);
  return path.relative(uploadRoot, absolute);
}

async function upsertUser({ email, password }) {
  const normalized = String(email).trim().toLowerCase();
  const name = NAME_BY_EMAIL[normalized];
  const role = ROLE_BY_EMAIL[normalized];
  if (!name || !role) throw new Error(`seed: email ${normalized} is not on the demo allowlist`);

  const existing = await User.findOne({ email: normalized }).lean();
  if (existing) {
    // Deterministic alignment: identity + role follow the allowlist; the
    // password hash is preserved so admin/user password changes survive.
    if (existing.full_name !== name || existing.role !== role) {
      await User.updateOne({ _id: existing._id }, { $set: { full_name: name, role } });
    }
    return User.findOne({ email: normalized }).lean();
  }
  const hash = await bcrypt.hash(password, 10);
  await User.create({
    full_name: name,
    email: normalized,
    password_hash: hash,
    phone: PHONE_BY_EMAIL[normalized] || null,
    district: PLACE_BY_EMAIL[normalized].district,
    state: PLACE_BY_EMAIL[normalized].state,
    wallet_address: WALLET_BY_EMAIL[normalized] || null,
    role,
    last_activity_at: new Date(Date.now() - 3 * 3600000),
  });
  return User.findOne({ email: normalized }).lean();
}

async function insertProperty(p) {
  const now = Date.now();
  await Property.create({
    property_id: p.propertyId,
    reference_number: p.referenceNumber,
    title: p.title,
    address_line: p.addressLine,
    city: p.city,
    district: p.district,
    state: p.state,
    area_value: p.areaValue,
    area_unit: p.areaUnit,
    property_type: p.propertyType,
    description: p.description,
    submitted_by_id: p.submittedBy._id,
    current_owner_id: p.ownerId,
    current_owner_wallet: p.ownerWallet,
    status: p.status,
    review_notes: p.reviewNotes || null,
    registered_at: p.registeredAt || null,
  });
  const doc = await Property.findOne({ property_id: p.propertyId }).lean();
  // Preserve the intended seed ages (timestamps option set them to "now").
  await Property.updateOne(
    { _id: doc._id },
    { $set: { created_at: new Date(now - p.createdDaysAgo * 86400000), updated_at: new Date(now - p.updatedHoursAgo * 3600000) } }
  );
  return Property.findOne({ property_id: p.propertyId }).lean();
}

/** Application-level associated parties (distinct from the chain's single owner). */
async function insertParties(property, parties, addedBy) {
  for (const party of parties) {
    await PropertyParty.create({
      property_id: property._id,
      user_id: party.user._id,
      party_role: party.role,
      share_percent: party.share || null,
      notes: party.notes || null,
      added_by: addedBy ? addedBy._id : null,
    });
  }
}

async function insertDocument({ property, uploadedBy, documentType, fileName, title, lines, verifiedBy, status, daysAgo }) {
  const buffer = makeSeedPdf(title, lines);
  const sha = sha256Buffer(buffer);
  const storagePath = writeSeedFile(property.property_id, fileName, buffer);
  const createdAt = new Date(Date.now() - daysAgo * 86400000);
  const verifiedAt = verifiedBy ? new Date(Date.now() - (daysAgo - 1) * 86400000) : null;
  await Document.create({
    property_id: property._id,
    uploaded_by: uploadedBy._id,
    document_type: documentType,
    file_name: fileName,
    file_size: buffer.length,
    mime_type: 'application/pdf',
    storage_path: storagePath,
    sha256_hash: sha,
    verification_status: status,
    verified_by: verifiedBy ? verifiedBy._id : null,
    verified_at: verifiedAt,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return Document.findOne({ property_id: property._id, file_name: fileName }).lean();
}

/**
 * Seed a transfer with its explicit consent board (no emails from the seed;
 * consent rows carry realistic mixed states for the demonstration).
 */
async function insertTransfer({ reference, property, seller, buyer, status, riskLevel, details, consents, docVerify, daysAgo, rejectionStage, rejectionReason }) {
  const created = await TransferRequest.create({
    transfer_reference: reference,
    property_id: property._id,
    seller_id: seller._id,
    seller_wallet: seller.wallet_address || null,
    buyer_id: buyer._id,
    buyer_wallet: buyer.wallet_address || null,
    status,
    risk_level: riskLevel || 'LOW',
    request_details: details || null,
    rejection_stage: rejectionStage || null,
    rejection_reason: rejectionReason || null,
    doc_verified_by: docVerify ? docVerify.clerk._id : null,
    doc_verified_at: docVerify ? new Date(Date.now() - 0.5 * 86400000) : null,
    doc_notes: docVerify ? docVerify.notes : null,
  });
  for (const c of consents) {
    await TransferConsent.create({
      transfer_id: created._id,
      property_id: property._id,
      user_id: c.user._id,
      party_role: c.role,
      status: c.status,
      created_at: new Date(Date.now() - (daysAgo + 0.2) * 86400000),
      responded_at: c.status === 'PENDING' ? null : new Date(Date.now() - (c.respondedDaysAgo ?? daysAgo - 0.1) * 86400000),
      rejection_reason: c.rejection_reason || null,
      decided_via: c.decided_via || 'SEEDED',
    });
  }
  const createdAgo = new Date(Date.now() - daysAgo * 86400000);
  await TransferRequest.updateOne({ _id: created._id }, { $set: { created_at: createdAgo, updated_at: createdAgo } });
  return TransferRequest.findOne({ transfer_reference: reference }).lean();
}

const userRow = (u) => ({ id: u._id, full_name: u.full_name, role: u.role, email: u.email });

async function seed() {
  const force = process.argv.includes('--force');
  const registrarEmail = 'omdummy101@gmail.com';
  const registrarExists = await User.findOne({ email: registrarEmail }).lean();

  if (registrarExists && !force) {
    console.log('Seed data already present - skipping. Use --force to reseed.');
    return;
  }
  if (force) {
    console.log('Force reseed: clearing registry collections...');
    for (const Model of [User, Property, Document, TransferRequest, FraudCheck, BlockchainTransaction, PropertyParty, TransferConsent, MfaChallenge]) {
      await Model.deleteMany({});
    }
    await mongoose.connection.db.collection('audit_events').deleteMany({});
    await mongoose.connection.db.collection('login_events').deleteMany({});
    await mongoose.connection.db.collection('counters').deleteMany({});
  }
  await ensureIndexes(mongoose.connection.db);

  const chain = await blockchainService.getStatus();
  const chainUp = chain.available;
  console.log(`Blockchain: ${chainUp ? `AVAILABLE at ${chain.contractAddress}` : 'unavailable - REGISTERED seeds will be skipped (no fabricated chain records)'}`);

  // ---------- users (the 8 allowlisted identities, deterministic roles) ----------
  const byEmail = {};
  for (const entry of ALLOWED_DEMO_USERS) {
    byEmail[entry.email] = await upsertUser({ email: entry.email, password: DEMO_PASSWORD });
  }
  const om = byEmail['mandwadeom2616@gmail.com'];
  const shruti = byEmail['shrutipethe111@gmail.com'];
  const surveyor = byEmail['panpaliyaag@rknec.edu'];
  const clerk = byEmail['tekdiwalnishant@gmail.com'];
  const registrar = byEmail['omdummy101@gmail.com'];
  const admin = byEmail['omdummy102@gmail.com'];
  const ganesh = byEmail['alphadummy103@gmail.com'];
  const kavita = byEmail['alpha20051610@gmail.com'];

  for (const u of Object.values(byEmail)) {
    await auditService.record({ actor: userRow(u), action: 'USER_REGISTER', entityType: 'user', entityId: u._id, metadata: { seeded: true, role: u.role, allowlisted: true } });
  }

  // ---------- properties (spread across every workflow stage) ----------
  const registeredOr = chainUp ? 'REGISTERED' : 'DOCS_VERIFIED';
  const p1 = await insertProperty({
    propertyId: 'PROP-2026-0001', referenceNumber: 'LL/REG/2026/100001',
    title: 'Survey 142/2, Koregaon Park', addressLine: 'Survey 142/2, Lane 7, Koregaon Park',
    city: 'Pune', district: 'Pune', state: 'Maharashtra', areaValue: 4200, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_PLOT', description: 'Corner residential plot jointly held by two siblings; clear chain of title across three prior transfers.',
    submittedBy: om, ownerId: om._id, ownerWallet: W.om,
    status: registeredOr, createdDaysAgo: 21, updatedHoursAgo: 20,
  });
  const p2 = await insertProperty({
    propertyId: 'PROP-2026-0002', referenceNumber: 'LL/REG/2026/100002',
    title: 'Flat 503, Sunrise Residency', addressLine: '503, Sunrise Residency, Baner Road',
    city: 'Pune', district: 'Pune', state: 'Maharashtra', areaValue: 1380, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_BUILDING', description: '3BHK apartment, phase II completion certificate attached.',
    submittedBy: om, ownerId: om._id, ownerWallet: W.om,
    status: 'SUBMITTED', createdDaysAgo: 4, updatedHoursAgo: 30,
  });
  const p3 = await insertProperty({
    propertyId: 'PROP-2026-0003', referenceNumber: 'LL/REG/2026/100003',
    title: 'Khasra 88, Devanahalli Farmland', addressLine: 'Khasra 88, near Nandi Road',
    city: 'Devanahalli', district: 'Bengaluru Rural', state: 'Karnataka', areaValue: 21780, areaUnit: 'sq ft',
    propertyType: 'AGRICULTURAL', description: 'Half-acre agricultural parcel with borewell easement recorded.',
    submittedBy: shruti, ownerId: shruti._id, ownerWallet: W.shruti,
    status: registeredOr, createdDaysAgo: 15, updatedHoursAgo: 14,
  });
  const p4 = await insertProperty({
    propertyId: 'PROP-2026-0004', referenceNumber: 'LL/REG/2026/100004',
    title: 'Shop 12, Marine Drive Commercial', addressLine: 'Shop 12, Ground Floor, Marine Drive',
    city: 'Kochi', district: 'Ernakulam', state: 'Kerala', areaValue: 640, areaUnit: 'sq ft',
    propertyType: 'COMMERCIAL', description: 'Retail unit with transfer of leasehold recorded in the deed.',
    submittedBy: ganesh, ownerId: ganesh._id, ownerWallet: W.ganesh,
    status: 'DOCS_VERIFIED', createdDaysAgo: 2, updatedHoursAgo: 10,
  });
  const p6 = await insertProperty({
    propertyId: 'PROP-2026-0006', referenceNumber: 'LL/REG/2026/100006',
    title: 'House 4, Shanti Nagar', addressLine: 'House 4, Shanti Nagar, Wakad Road',
    city: 'Pune', district: 'Pune', state: 'Maharashtra', areaValue: 1850, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_BUILDING', description: 'Independent house with occupation certificate and updated tax receipts attached.',
    submittedBy: shruti, ownerId: shruti._id, ownerWallet: W.shruti,
    status: 'SURVEY_VERIFIED', createdDaysAgo: 3, updatedHoursAgo: 8,
  });
  const p5 = await insertProperty({
    propertyId: 'PROP-2026-0005', referenceNumber: 'LL/REG/2026/100005',
    title: 'Plot 9, Emerald Enclave', addressLine: 'Plot 9, Emerald Enclave Phase 3',
    city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', areaValue: 2400, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_PLOT', description: 'Layout plot submission missing approved survey sketch.',
    submittedBy: kavita, ownerId: kavita._id, ownerWallet: W.kavita,
    status: 'REJECTED', reviewNotes: 'Survey sketch does not match the recorded layout plan. Resubmit with the endorsed survey document.',
    createdDaysAgo: 9, updatedHoursAgo: 7,
  });
  const p7 = await insertProperty({
    propertyId: 'PROP-2026-0007', referenceNumber: 'LL/REG/2026/100007',
    title: 'Office 3, Ashoka Chambers', addressLine: 'Office 3, First Floor, Ashoka Chambers, M.G. Road',
    city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra', areaValue: 920, areaUnit: 'sq ft',
    propertyType: 'COMMERCIAL', description: 'Compact office unit purchased for a consultancy practice; lease-freehold converted.',
    submittedBy: ganesh, ownerId: ganesh._id, ownerWallet: W.ganesh,
    status: registeredOr, createdDaysAgo: 12, updatedHoursAgo: 11,
  });
  const p8 = await insertProperty({
    propertyId: 'PROP-2026-0008', referenceNumber: 'LL/REG/2026/100008',
    title: 'Unit 11, Silver Business Park', addressLine: 'Unit 11, Silver Business Park, Whitefield Main Road',
    city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', areaValue: 1560, areaUnit: 'sq ft',
    propertyType: 'INDUSTRIAL', description: 'Warehouse unit with clear access easement and updated khata extract.',
    submittedBy: kavita, ownerId: kavita._id, ownerWallet: W.kavita,
    status: registeredOr, createdDaysAgo: 10, updatedHoursAgo: 9,
  });

  // ---------- application-level parties (MongoDB) vs chain owner ----------
  // PROP-2026-0001 is jointly held: Om (OWNER) + Shruti (CO_OWNER). The
  // blockchain keeps Om as the single current owner (contract unchanged);
  // transfers on this parcel therefore require BOTH parties plus the buyer.
  await insertParties(p1, [
    { user: om, role: 'OWNER', share: 60 },
    { user: shruti, role: 'CO_OWNER', share: 40, notes: 'Joint holder per registered family settlement deed.' },
  ], registrar);
  await insertParties(p3, [{ user: shruti, role: 'OWNER', share: 100 }], registrar);
  await insertParties(p4, [{ user: ganesh, role: 'OWNER', share: 100 }], registrar);
  await insertParties(p6, [{ user: shruti, role: 'OWNER', share: 100 }], registrar);
  await insertParties(p7, [{ user: ganesh, role: 'OWNER', share: 100 }], registrar);
  await insertParties(p8, [{ user: kavita, role: 'OWNER', share: 100 }], registrar);

  const submitterOf = (p) => {
    if (p.submitted_by_id === om._id) return userRow(om);
    if (p.submitted_by_id === shruti._id) return userRow(shruti);
    if (p.submitted_by_id === ganesh._id) return userRow(ganesh);
    return userRow(kavita);
  };
  for (const p of [p1, p2, p3, p4, p5, p6, p7, p8]) {
    await auditService.record({
      actor: submitterOf(p),
      action: 'PROPERTY_CREATE', entityType: 'property', entityId: p.property_id, metadata: { seeded: true, status: p.status },
    });
  }

  // ---------- workflow stage history (realistic multi-office trail) ----------
  const daysAgoAt = (d) => new Date(Date.now() - d * 86400000);
  const histEntries = [];
  // p4 (Shop 12): cleared survey + documents, now at the registrar desk.
  histEntries.push(['PROP-2026-0004', [
    { stage: 'SURVEY', action: 'SURVEY_PASSED', by_id: surveyor._id, by_name: surveyor.full_name, by_role: 'surveyor', notes: 'Ground visit done - boundaries match the sale deed sketch.', at: daysAgoAt(1.6) },
    { stage: 'DOCUMENT_VERIFICATION', action: 'DOCS_VERIFIED', by_id: clerk._id, by_name: clerk.full_name, by_role: 'clerk', notes: 'Title deed and lease records consistent.', at: daysAgoAt(0.9) },
  ]]);
  // p6 (House 4): surveyor cleared, clerk verification pending.
  histEntries.push(['PROP-2026-0006', [
    { stage: 'SURVEY', action: 'SURVEY_PASSED', by_id: surveyor._id, by_name: surveyor.full_name, by_role: 'surveyor', notes: 'Structure matches recorded plinth area; no encroachment observed.', at: daysAgoAt(1.2) },
  ]]);
  // p2 (Flat 503): fresh application awaiting the surveyor.
  histEntries.push(['PROP-2026-0002', [
    { stage: 'SURVEY', action: 'SUBMITTED', by_id: om._id, by_name: om.full_name, by_role: 'citizen', notes: 'Application filed with sale agreement.', at: daysAgoAt(4) },
  ]]);
  if (chainUp) {
    for (const [prop, owner] of [[p1, om], [p3, shruti], [p7, ganesh], [p8, kavita]]) {
      histEntries.push([prop.property_id, [
        { stage: 'SURVEY', action: 'SURVEY_PASSED', by_id: surveyor._id, by_name: surveyor.full_name, by_role: 'surveyor', notes: 'Parcel measured on ground; boundaries match the deed sketch.', at: daysAgoAt(9) },
        { stage: 'DOCUMENT_VERIFICATION', action: 'DOCS_VERIFIED', by_id: clerk._id, by_name: clerk.full_name, by_role: 'clerk', notes: 'Supporting documents consistent and complete.', at: daysAgoAt(8) },
        { stage: 'REGISTRAR_REVIEW', action: 'REGISTRAR_APPROVED', by_id: registrar._id, by_name: registrar.full_name, by_role: 'registrar', notes: 'Legal scrutiny passed - registered on the ledger.', at: daysAgoAt(7) },
      ]]);
    }
  }
  for (const [businessId, entries] of histEntries) {
    await Property.updateOne({ property_id: businessId }, { $set: { stage_history: entries } });
  }
  if (p5.status === 'REJECTED') {
    await auditService.record({ actor: userRow(registrar), action: 'PROPERTY_REJECT', entityType: 'property', entityId: p5.property_id, result: 'FAILURE', metadata: { seeded: true, reason: p5.review_notes } });
  }

  // ---------- documents (real files + real SHA-256) ----------
  const d1 = await insertDocument({
    property: p1, uploadedBy: om, documentType: 'TITLE_DEED', fileName: 'title-deed-survey142.pdf',
    title: 'Title Deed - Survey 142/2 Koregaon Park',
    lines: ['Deed No: PN-KP-8891', 'Grantor: Deshpande Family Trust', 'Grantees: Om Mandwade and Shruti Pethe',
            'Area: 4200 sq ft', 'Consideration: INR 84,00,000', 'Registered at: SRO Pune-1'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 20,
  });
  const d2 = await insertDocument({
    property: p1, uploadedBy: om, documentType: 'SURVEY_REPORT', fileName: 'survey-report-survey142.pdf',
    title: 'Survey Report - Survey 142/2',
    lines: ['Surveyor: M. Kulkarni, Licensed Surveyor', 'Boundaries verified on ground',
            'North: Lane 7 | South: Survey 143', 'Area measured: 4200 sq ft (+/- 0.5%)'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 19,
  });
  const d3 = await insertDocument({
    property: p2, uploadedBy: om, documentType: 'SALE_AGREEMENT', fileName: 'sale-agreement-sunrise503.pdf',
    title: 'Agreement to Sell - Flat 503 Sunrise Residency',
    lines: ['Builder: Sunrise Builders LLP', 'Allottee: Om Mandwade', 'Flat No: 503, Wing B',
            'Carpet area: 1380 sq ft', 'Possession: completed phase II'],
    verifiedBy: null, status: 'PENDING', daysAgo: 4,
  });
  const d4 = await insertDocument({
    property: p3, uploadedBy: shruti, documentType: 'TAX_RECEIPT', fileName: 'tax-receipt-khasra88.pdf',
    title: 'Land Revenue Receipt - Khasra 88',
    lines: ['Year: 2025-26', 'Owner: Shruti Pethe', 'Assessment: INR 3,420', 'Status: PAID'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 12,
  });
  const d5 = await insertDocument({
    property: p4, uploadedBy: ganesh, documentType: 'TITLE_DEED', fileName: 'title-deed-shop12.pdf',
    title: 'Title Deed - Shop 12 Marine Drive Commercial',
    lines: ['Deed No: EKM-MD-2210', 'Grantor: Kovoor Investments', 'Grantee: Ganesh Patil', 'Area: 640 sq ft'],
    verifiedBy: null, status: 'PENDING', daysAgo: 2,
  });
  const d6 = await insertDocument({
    property: p6, uploadedBy: shruti, documentType: 'TAX_RECEIPT', fileName: 'occupation-cert-house4.pdf',
    title: 'Occupation Certificate - House 4 Shanti Nagar',
    lines: ['Cert No: PCMC-WK-4471', 'Owner: Shruti Pethe', 'Structure: Ground + 1', 'Issued: two years prior'],
    verifiedBy: null, status: 'PENDING', daysAgo: 3,
  });
  const d7 = await insertDocument({
    property: p7, uploadedBy: ganesh, documentType: 'TITLE_DEED', fileName: 'title-deed-ashoka3.pdf',
    title: 'Title Deed - Office 3 Ashoka Chambers',
    lines: ['Deed No: NGP-AG-7742', 'Grantor: Ashoka Estates LLP', 'Grantee: Ganesh Patil', 'Area: 920 sq ft'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 11,
  });
  const d8 = await insertDocument({
    property: p8, uploadedBy: kavita, documentType: 'TITLE_DEED', fileName: 'title-deed-silver11.pdf',
    title: 'Title Deed - Unit 11 Silver Business Park',
    lines: ['Deed No: BLR-WF-5518', 'Grantor: Silver Park Developers', 'Grantee: Kavita Sharma', 'Area: 1560 sq ft'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 9,
  });
  for (const d of [d1, d2, d3, d4, d5, d6, d7, d8]) {
    await auditService.record({
      actor: submitterOf({ submitted_by_id: d.uploaded_by }),
      action: 'DOCUMENT_UPLOAD', entityType: 'document', entityId: d._id,
      metadata: { seeded: true, propertyId: d.property_id, sha256: d.sha256_hash },
    });
    if (d.verification_status === 'VERIFIED') {
      await auditService.record({ actor: userRow(registrar), action: 'DOCUMENT_VERIFY', entityType: 'document', entityId: d._id, metadata: { seeded: true, outcome: 'VERIFIED' } });
    }
  }

  // ---------- real on-chain registrations for REGISTERED seeds ----------
  // Chain-session aware: a long-lived Hardhat node may already know these
  // business ids from a previous demo cycle. Never fabricate - resolve the
  // actual on-chain state and reconcile it honestly:
  //   unknown id            -> register for real
  //   already ours          -> skip (idempotent reseed, no fake duplicate tx)
  //   owned by someone else -> operator re-point back to the seed owner (real tx)
  if (chainUp) {
    const { getPropertyOwnerOnChain, registerPropertyOnChain, transferOwnershipOnChain } = blockchainService;
    const KNOWN_WALLETS = [...new Set([W.om, W.shruti, W.ganesh, W.kavita, W.registrar, W.operator])];
    for (const p of [p1, p3, p7, p8]) {
      try {
        const onChainOwner = await getPropertyOwnerOnChain(p.property_id);
        let receipt = null;
        if (!onChainOwner) {
          receipt = await registerPropertyOnChain(p.property_id, p.current_owner_wallet);
          await BlockchainTransaction.create({
            property_id: p._id,
            transaction_hash: receipt.transactionHash,
            block_number: receipt.blockNumber,
            network: 'hardhat',
            contract_address: blockchainService.getContractAddress(),
            operation: 'PROPERTY_REGISTER',
            from_address: receipt.fromAddress,
            to_address: p.current_owner_wallet,
            status: 'CONFIRMED',
            timestamp: new Date(),
          });
          await auditService.record({
            actor: userRow(registrar), action: 'BLOCKCHAIN_TX', entityType: 'blockchain', entityId: receipt.transactionHash,
            metadata: { seeded: true, operation: 'PROPERTY_REGISTER', propertyId: p.property_id, block: receipt.blockNumber },
          });
          console.log(`On-chain registration: ${p.property_id} -> ${receipt.transactionHash}`);
        } else if (onChainOwner.toLowerCase() === String(p.current_owner_wallet).toLowerCase()) {
          console.log(`On-chain registration: ${p.property_id} already settled to the seed owner - skipping (idempotent)`);
        } else {
          // Chain drift from an earlier demo cycle: re-point to the seed owner.
          receipt = await transferOwnershipOnChain(p.property_id, onChainOwner, p.current_owner_wallet);
          await BlockchainTransaction.create({
            property_id: p._id,
            transaction_hash: receipt.transactionHash,
            block_number: receipt.blockNumber,
            network: 'hardhat',
            contract_address: blockchainService.getContractAddress(),
            operation: 'OWNERSHIP_TRANSFER',
            from_address: onChainOwner,
            to_address: p.current_owner_wallet,
            status: 'CONFIRMED',
            timestamp: new Date(),
          });
          await auditService.record({
            actor: userRow(registrar), action: 'BLOCKCHAIN_TX', entityType: 'blockchain', entityId: receipt.transactionHash,
            metadata: { seeded: true, operation: 'OWNERSHIP_TRANSFER', propertyId: p.property_id, block: receipt.blockNumber, note: 'chain re-pointed to seed owner' },
          });
          console.log(`On-chain re-point: ${p.property_id} -> ${receipt.transactionHash}`);
        }
        const suffixMatch = String(p.property_id).match(/(\d+)$/);
        if (suffixMatch) bumpPropertyCursor(parseInt(suffixMatch[1], 10));
      } catch (err) {
        console.warn(`On-chain registration failed for ${p.property_id}: ${err.message} (known wallets probed: ${KNOWN_WALLETS.length})`);
      }
    }
  }

  // ---------- counters ----------
  // Floor above every business id the CURRENT chain session has ever seen
  // (disk cursor) so new registrations never collide with on-chain history.
  const year = new Date().getFullYear();
  const cursor = readCursor();
  const props = await Property.find().select('property_id').lean();
  const maxSuffix = (values) => values.reduce((m, v) => {
    const match = String(v || '').match(/(\d+)$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  await Counter.ensureFloor(`property_${year}`, Math.max(maxSuffix(props.map((p) => p.property_id)), cursor.property));
  const transfers = await TransferRequest.find().select('transfer_reference').lean();
  await Counter.ensureFloor(`transfer_${year}`, Math.max(maxSuffix(transfers.map((t) => t.transfer_reference)), cursor.transfer));

  // ---------- transfers with explicit consent boards ----------
  if (chainUp) {
    // TRF-2026-0001 - LIVE multi-party consent demo on the co-owned parcel.
    // Om (seller) initiated; co-owner Shruti and buyer Ganesh must still act.
    const fraud1 = await fraudService.runFraudChecks({
      propertyId: p1.property_id, sellerId: om._id, buyerId: ganesh._id, buyerWallet: W.ganesh,
    });
    const t1 = await insertTransfer({
      reference: 'TRF-2026-0001', property: p1, seller: om, buyer: ganesh,
      status: 'CONSENT_PENDING', riskLevel: fraud1.riskLevel,
      details: 'Sale of the Koregaon Park plot to Ganesh Patil under private sale agreement. Joint holder consent required per the family settlement deed.',
      daysAgo: 1.1,
      consents: [
        { user: om, role: 'SELLER', status: 'APPROVED', decided_via: 'INITIATION', respondedDaysAgo: 1.1 },
        { user: shruti, role: 'CO_OWNER', status: 'PENDING' },
        { user: ganesh, role: 'BUYER', status: 'PENDING' },
      ],
    });
    await fraudService.persistFraudCheck(t1._id, fraud1);
    await auditService.record({ actor: userRow(om), action: 'TRANSFER_CREATE', entityType: 'transfer', entityId: 'TRF-2026-0001', metadata: { seeded: true, propertyId: p1.property_id, riskLevel: fraud1.riskLevel } });
    await auditService.record({ actor: userRow(om), action: 'CONSENT_REQUESTED', entityType: 'transfer', entityId: 'TRF-2026-0001', metadata: { seeded: true, requiredParties: 3, pendingParties: 2 } });
    await auditService.record({ actor: userRow(om), action: 'FRAUD_CHECK', entityType: 'transfer', entityId: 'TRF-2026-0001', result: fraud1.isFraudulent ? 'FAILURE' : 'SUCCESS', metadata: { seeded: true, riskLevel: fraud1.riskLevel } });

    // TRF-2026-0002 - consent already complete; sitting at the clerk desk.
    const fraud2 = await fraudService.runFraudChecks({
      propertyId: p3.property_id, sellerId: shruti._id, buyerId: om._id, buyerWallet: W.om,
    });
    const t2 = await insertTransfer({
      reference: 'TRF-2026-0002', property: p3, seller: shruti, buyer: om,
      status: 'PENDING', riskLevel: fraud2.riskLevel,
      details: 'Devanahalli farmland sold to Om Mandwade; sale deed executed and consent of all parties recorded.',
      daysAgo: 2,
      consents: [
        { user: shruti, role: 'SELLER', status: 'APPROVED', decided_via: 'INITIATION', respondedDaysAgo: 2 },
        { user: om, role: 'BUYER', status: 'APPROVED', respondedDaysAgo: 1 },
      ],
    });
    await fraudService.persistFraudCheck(t2._id, fraud2);
    await auditService.record({ actor: userRow(shruti), action: 'TRANSFER_CREATE', entityType: 'transfer', entityId: 'TRF-2026-0002', metadata: { seeded: true, propertyId: p3.property_id } });
    await auditService.record({ actor: userRow(shruti), action: 'TRANSFER_CONSENT_COMPLETE', entityType: 'transfer', entityId: 'TRF-2026-0002', metadata: { seeded: true, nextStage: 'DOCUMENT_VERIFICATION' } });

    // TRF-2026-0003 - clerk verified; waiting at the registrar desk (+ on-chain ready).
    const fraud3 = await fraudService.runFraudChecks({
      propertyId: p7.property_id, sellerId: ganesh._id, buyerId: kavita._id, buyerWallet: W.kavita,
    });
    const t3 = await insertTransfer({
      reference: 'TRF-2026-0003', property: p7, seller: ganesh, buyer: kavita,
      status: 'DOCS_VERIFIED', riskLevel: fraud3.riskLevel,
      details: 'Ashoka Chambers office unit sold to Kavita Sharma. Consent complete; documents verified by the clerk.',
      daysAgo: 1.5,
      docVerify: { clerk, notes: 'Title deed and khata extract consistent.' },
      consents: [
        { user: ganesh, role: 'SELLER', status: 'APPROVED', decided_via: 'INITIATION', respondedDaysAgo: 1.5 },
        { user: kavita, role: 'BUYER', status: 'APPROVED', respondedDaysAgo: 1.3 },
      ],
    });
    await fraudService.persistFraudCheck(t3._id, fraud3);
    await auditService.record({ actor: userRow(ganesh), action: 'TRANSFER_CREATE', entityType: 'transfer', entityId: 'TRF-2026-0003', metadata: { seeded: true, propertyId: p7.property_id } });
    await auditService.record({ actor: userRow(clerk), action: 'TRANSFER_DOCS_VERIFIED', entityType: 'transfer', entityId: 'TRF-2026-0003', metadata: { seeded: true, notes: 'Title deed and khata extract consistent.' } });

    // TRF-2026-0004 - buyer (Om) still owes consent; his "Pending Actions" item.
    const fraud4 = await fraudService.runFraudChecks({
      propertyId: p8.property_id, sellerId: kavita._id, buyerId: om._id, buyerWallet: W.om,
    });
    const t4 = await insertTransfer({
      reference: 'TRF-2026-0004', property: p8, seller: kavita, buyer: om,
      status: 'CONSENT_PENDING', riskLevel: fraud4.riskLevel,
      details: 'Silver Business Park warehouse unit to be acquired by Om Mandwade. Buyer consent recorded in-app after sign-in.',
      daysAgo: 0.8,
      consents: [
        { user: kavita, role: 'SELLER', status: 'APPROVED', decided_via: 'INITIATION', respondedDaysAgo: 0.8 },
        { user: om, role: 'BUYER', status: 'PENDING' },
      ],
    });
    await fraudService.persistFraudCheck(t4._id, fraud4);
    await auditService.record({ actor: userRow(kavita), action: 'TRANSFER_CREATE', entityType: 'transfer', entityId: 'TRF-2026-0004', metadata: { seeded: true, propertyId: p8.property_id } });
    await auditService.record({ actor: userRow(kavita), action: 'CONSENT_REQUESTED', entityType: 'transfer', entityId: 'TRF-2026-0004', metadata: { seeded: true, requiredParties: 2, pendingParties: 1 } });

    console.log('Seeded transfers: TRF-2026-0001 (CONSENT_PENDING, live demo), TRF-2026-0002 (clerk desk), TRF-2026-0003 (registrar desk), TRF-2026-0004 (buyer consent pending)');
  } else {
    console.log('Blockchain unavailable - transfer seeds skipped (they require REGISTERED parcels).');
  }

  // ---------- login security telemetry sample (for the admin oversight view) ----------
  const loginEventDocs = [
    { email: om.email, userId: om._id, role: om.role, outcome: 'SUCCESS', reason: 'LOGIN_PASSWORD_SUCCESS_MFA_REQUIRED', ip: '10.20.0.14', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) demo', created_at: daysAgoAt(0.3) },
    { email: om.email, userId: om._id, role: om.role, outcome: 'SUCCESS', reason: 'MFA_SUCCESS', ip: '10.20.0.14', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) demo', created_at: daysAgoAt(0.29) },
    { email: shruti.email, userId: shruti._id, role: shruti.role, outcome: 'SUCCESS', reason: 'MFA_SUCCESS', ip: '10.20.0.22', userAgent: 'Mozilla/5.0 (Windows NT 10.0) demo', created_at: daysAgoAt(0.6) },
    { email: registrar.email, userId: registrar._id, role: registrar.role, outcome: 'SUCCESS', reason: 'MFA_SUCCESS', ip: '10.20.1.5', userAgent: 'Mozilla/5.0 (Macintosh) demo', created_at: daysAgoAt(0.5) },
    { email: 'unknown.probe@example.com', userId: null, role: null, outcome: 'FAILURE', reason: 'unknown_account', ip: '10.20.9.9', userAgent: 'curl/8.0 probe', created_at: daysAgoAt(0.4) },
  ];
  await mongoose.connection.collection('login_events').insertMany(loginEventDocs);

  // ---------- done ----------
  console.log('\nSeed complete. Demo accounts (email OTP MFA is active - password alone cannot sign in):');
  for (const entry of ALLOWED_DEMO_USERS) {
    console.log(`  ${entry.role.padEnd(9)} : ${entry.email} / ${DEMO_PASSWORD}  (${entry.name})`);
  }
  console.log('\nDemo flow: login with password -> OTP -> verify. Multi-party consent demo: TRF-2026-0001 waits for Shruti Pethe (co-owner) and Ganesh Patil (buyer).');
}

if (require.main === module) {
  (async () => {
    try {
      const ok = await connectMongo();
      if (!ok) throw new Error('Cannot reach MongoDB Atlas - check MONGODB_URI / Network Access');
      await seed();
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error('Seed failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { seed };
