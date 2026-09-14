'use strict';

/**
 * LAND LEDGER - development/demo seed (MongoDB Atlas).
 * Idempotent: skips when the registrar account already exists (use --force to wipe+reseed).
 * Creates believable fictional users, properties, REAL document files with real
 * SHA-256 fingerprints, a pending transfer with a genuine fraud-engine run, and
 * - only when the Hardhat node is reachable - REAL on-chain registrations with
 * real transaction hashes. Blockchain records are never fabricated.
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
const { ensureIndexes } = require('./mongo-indexes');
const auditService = require('../services/auditService');
const blockchainService = require('../services/blockchainService');
const fraudService = require('../services/fraudService');
const { sha256Buffer } = require('../utils/hash');

const env = require('../config/env');

// Well-known Hardhat accounts (test network only - valueless keys, never mainnet).
const WALLETS = {
  registrar: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  asha: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  vikram: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  priya: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
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

async function upsertUser({ fullName, email, password, role, phone, district, state, wallet }) {
  const existing = await User.findOne({ email }).lean();
  if (existing) return existing;
  const hash = await bcrypt.hash(password, 10);
  await User.create({
    full_name: fullName,
    email,
    password_hash: hash,
    phone,
    district,
    state,
    wallet_address: wallet,
    role,
    last_activity_at: new Date(Date.now() - 3 * 3600000),
  });
  return User.findOne({ email }).lean();
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

async function seed() {
  const force = process.argv.includes('--force');
  const registrarExists = await User.findOne({ role: 'registrar' }).lean();

  if (registrarExists && !force) {
    console.log('Seed data already present - skipping. Use --force to reseed.');
    return;
  }
  if (force) {
    console.log('Force reseed: clearing registry collections...');
    for (const Model of [User, Property, Document, TransferRequest, FraudCheck, BlockchainTransaction]) {
      await Model.deleteMany({});
    }
    await mongoose.connection.db.collection('audit_events').deleteMany({});
    await mongoose.connection.db.collection('login_events').deleteMany({});
  }
  await ensureIndexes(mongoose.connection.db);

  const chain = await blockchainService.getStatus();
  const chainUp = chain.available;
  console.log(`Blockchain: ${chainUp ? `AVAILABLE at ${chain.contractAddress}` : 'unavailable - REGISTERED seeds will be skipped (no fabricated chain records)'}`);

  // ---------- users ----------
  const registrar = await upsertUser({
    fullName: 'Meera Krishnan', email: envSeed('SEED_REGISTRAR_EMAIL', 'meera.krishnan@landledger.gov'),
    password: envSeed('SEED_REGISTRAR_PASSWORD', 'Registrar@123'), role: 'registrar',
    phone: '+91 98200 11223', district: 'Pune', state: 'Maharashtra', wallet: WALLETS.registrar,
  });
  const asha = await upsertUser({
    fullName: 'Asha Rao', email: envSeed('SEED_CITIZEN_EMAIL', 'asha.rao@example.com'),
    password: envSeed('SEED_CITIZEN_PASSWORD', 'Citizen@123'), role: 'citizen',
    phone: '+91 98450 22334', district: 'Pune', state: 'Maharashtra', wallet: WALLETS.asha,
  });
  const vikram = await upsertUser({
    fullName: 'Vikram Mehta', email: 'vikram.mehta@example.com',
    password: 'Citizen@123', role: 'citizen',
    phone: '+91 99004 55667', district: 'Bengaluru Urban', state: 'Karnataka', wallet: WALLETS.vikram,
  });
  const priya = await upsertUser({
    fullName: 'Priya Nair', email: 'priya.nair@example.com',
    password: 'Citizen@123', role: 'citizen',
    phone: '+91 98953 77881', district: 'Ernakulam', state: 'Kerala', wallet: WALLETS.priya,
  });
  const userRow = (u) => ({ id: u._id, full_name: u.full_name, role: u.role, email: u.email });

  await auditService.record({ actor: userRow(registrar), action: 'USER_REGISTER', entityType: 'user', entityId: registrar._id, metadata: { seeded: true, role: 'registrar' } });
  for (const u of [asha, vikram, priya]) {
    await auditService.record({ actor: userRow(u), action: 'USER_REGISTER', entityType: 'user', entityId: u._id, metadata: { seeded: true, role: 'citizen' } });
  }

  // ---------- properties ----------
  const p1 = await insertProperty({
    propertyId: 'PROP-2026-0001', referenceNumber: 'LL/REG/2026/100001',
    title: 'Survey 142/2, Koregaon Park', addressLine: 'Survey 142/2, Lane 7, Koregaon Park',
    city: 'Pune', district: 'Pune', state: 'Maharashtra', areaValue: 4200, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_PLOT', description: 'Corner residential plot with clear chain of title across three prior transfers.',
    submittedBy: asha, ownerId: asha._id, ownerWallet: WALLETS.asha,
    status: chainUp ? 'REGISTERED' : 'PENDING_REVIEW', createdDaysAgo: 21, updatedHoursAgo: 20,
  });
  const p2 = await insertProperty({
    propertyId: 'PROP-2026-0002', referenceNumber: 'LL/REG/2026/100002',
    title: 'Flat 503, Sunrise Residency', addressLine: '503, Sunrise Residency, Baner Road',
    city: 'Pune', district: 'Pune', state: 'Maharashtra', areaValue: 1380, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_BUILDING', description: '3BHK apartment, phase II completion certificate attached.',
    submittedBy: asha, ownerId: asha._id, ownerWallet: WALLETS.asha,
    status: 'PENDING_REVIEW', createdDaysAgo: 4, updatedHoursAgo: 30,
  });
  const p3 = await insertProperty({
    propertyId: 'PROP-2026-0003', referenceNumber: 'LL/REG/2026/100003',
    title: 'Khasra 88, Devanahalli Farmland', addressLine: 'Khasra 88, near Nandi Road',
    city: 'Devanahalli', district: 'Bengaluru Rural', state: 'Karnataka', areaValue: 21780, areaUnit: 'sq ft',
    propertyType: 'AGRICULTURAL', description: 'Half-acre agricultural parcel with borewell easement recorded.',
    submittedBy: vikram, ownerId: vikram._id, ownerWallet: WALLETS.vikram,
    status: chainUp ? 'REGISTERED' : 'PENDING_REVIEW', createdDaysAgo: 15, updatedHoursAgo: 14,
  });
  const p4 = await insertProperty({
    propertyId: 'PROP-2026-0004', referenceNumber: 'LL/REG/2026/100004',
    title: 'Shop 12, Marine Drive Commercial', addressLine: 'Shop 12, Ground Floor, Marine Drive',
    city: 'Kochi', district: 'Ernakulam', state: 'Kerala', areaValue: 640, areaUnit: 'sq ft',
    propertyType: 'COMMERCIAL', description: 'Retail unit with transfer of leasehold recorded in the deed.',
    submittedBy: priya, ownerId: priya._id, ownerWallet: WALLETS.priya,
    status: 'PENDING_REVIEW', createdDaysAgo: 2, updatedHoursAgo: 10,
  });
  const p5 = await insertProperty({
    propertyId: 'PROP-2026-0005', referenceNumber: 'LL/REG/2026/100005',
    title: 'Plot 9, Emerald Enclave', addressLine: 'Plot 9, Emerald Enclave Phase 3',
    city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', areaValue: 2400, areaUnit: 'sq ft',
    propertyType: 'RESIDENTIAL_PLOT', description: 'Layout plot submission missing approved survey sketch.',
    submittedBy: vikram, ownerId: vikram._id, ownerWallet: WALLETS.vikram,
    status: 'REJECTED', reviewNotes: 'Survey sketch does not match the recorded layout plan. Resubmit with the endorsed survey document.',
    createdDaysAgo: 9, updatedHoursAgo: 7,
  });

  const submitterOf = (p) => (p.submitted_by_id === asha._id ? userRow(asha) : p.submitted_by_id === vikram._id ? userRow(vikram) : userRow(priya));
  for (const p of [p1, p2, p3, p4, p5]) {
    await auditService.record({
      actor: submitterOf(p),
      action: 'PROPERTY_CREATE', entityType: 'property', entityId: p.property_id, metadata: { seeded: true, status: p.status },
    });
  }
  if (p5.status === 'REJECTED') {
    await auditService.record({ actor: userRow(registrar), action: 'PROPERTY_REJECT', entityType: 'property', entityId: p5.property_id, result: 'FAILURE', metadata: { seeded: true, reason: p5.review_notes } });
  }

  // ---------- documents (real files + real SHA-256) ----------
  const d1 = await insertDocument({
    property: p1, uploadedBy: asha, documentType: 'TITLE_DEED', fileName: 'title-deed-survey142.pdf',
    title: 'Title Deed - Survey 142/2 Koregaon Park',
    lines: ['Deed No: PN-KP-8891', 'Grantor: Deshpande Family Trust', 'Grantee: Asha Rao',
            'Area: 4200 sq ft', 'Consideration: INR 84,00,000', 'Registered at: SRO Pune-1'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 20,
  });
  const d2 = await insertDocument({
    property: p1, uploadedBy: asha, documentType: 'SURVEY_REPORT', fileName: 'survey-report-survey142.pdf',
    title: 'Survey Report - Survey 142/2',
    lines: ['Surveyor: M. Kulkarni, Licensed Surveyor', 'Boundaries verified on ground',
            'North: Lane 7 | South: Survey 143', 'Area measured: 4200 sq ft (+/- 0.5%)'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 19,
  });
  const d3 = await insertDocument({
    property: p2, uploadedBy: asha, documentType: 'SALE_AGREEMENT', fileName: 'sale-agreement-sunrise503.pdf',
    title: 'Agreement to Sell - Flat 503 Sunrise Residency',
    lines: ['Builder: Sunrise Builders LLP', 'Allottee: Asha Rao', 'Flat No: 503, Wing B',
            'Carpet area: 1380 sq ft', 'Possession: completed phase II'],
    verifiedBy: null, status: 'PENDING', daysAgo: 4,
  });
  const d4 = await insertDocument({
    property: p3, uploadedBy: vikram, documentType: 'TAX_RECEIPT', fileName: 'tax-receipt-khasra88.pdf',
    title: 'Land Revenue Receipt - Khasra 88',
    lines: ['Year: 2025-26', 'Owner: Vikram Mehta', 'Assessment: INR 3,420', 'Status: PAID'],
    verifiedBy: registrar, status: 'VERIFIED', daysAgo: 12,
  });
  const d5 = await insertDocument({
    property: p4, uploadedBy: priya, documentType: 'TITLE_DEED', fileName: 'title-deed-shop12.pdf',
    title: 'Title Deed - Shop 12 Marine Drive Commercial',
    lines: ['Deed No: EKM-MD-2210', 'Grantor: Kovoor Investments', 'Grantee: Priya Nair', 'Area: 640 sq ft'],
    verifiedBy: null, status: 'PENDING', daysAgo: 2,
  });
  for (const d of [d1, d2, d3, d4, d5]) {
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
  if (chainUp) {
    for (const p of [p1, p3]) {
      try {
        const receipt = await blockchainService.registerPropertyOnChain(p.property_id, p.current_owner_wallet);
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
          timestamp: new Date(Date.now() - 86400000),
        });
        await auditService.record({
          actor: userRow(registrar), action: 'BLOCKCHAIN_TX', entityType: 'blockchain', entityId: receipt.transactionHash,
          metadata: { seeded: true, operation: 'PROPERTY_REGISTER', propertyId: p.property_id, block: receipt.blockNumber },
        });
        console.log(`On-chain registration: ${p.property_id} -> ${receipt.transactionHash}`);
      } catch (err) {
        console.warn(`On-chain registration failed for ${p.property_id}: ${err.message}`);
      }
    }
  }

  // ---------- counters ----------
  const year = new Date().getFullYear();
  const props = await Property.find().select('property_id').lean();
  const maxSuffix = (values) => values.reduce((m, v) => {
    const match = String(v || '').match(/(\d+)$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  await Counter.ensureFloor(`property_${year}`, maxSuffix(props.map((p) => p.property_id)));
  const transfers = await TransferRequest.find().select('transfer_reference').lean();
  await Counter.ensureFloor(`transfer_${year}`, maxSuffix(transfers.map((t) => t.transfer_reference)));

  // ---------- pending transfer with a REAL fraud-engine run ----------
  if (p1.status === 'REGISTERED') {
    const preflight = await fraudService.runFraudChecks({
      propertyId: p1.property_id,
      sellerId: asha._id,
      buyerId: vikram._id,
      buyerWallet: WALLETS.vikram,
    });
    await TransferRequest.create({
      transfer_reference: 'TRF-2026-0001',
      property_id: p1._id,
      seller_id: asha._id,
      seller_wallet: WALLETS.asha,
      buyer_id: vikram._id,
      buyer_wallet: WALLETS.vikram,
      status: 'PENDING',
      risk_level: preflight.riskLevel,
      request_details: 'Transfer of the Koregaon Park plot to Vikram Mehta following private sale agreement dated this month.',
      created_at: new Date(Date.now() - 86400000),
      updated_at: new Date(Date.now() - 86400000),
    });
    const fraudRow = await fraudService.persistFraudCheck((await TransferRequest.findOne({ transfer_reference: 'TRF-2026-0001' }).lean())._id, preflight);
    await auditService.record({ actor: userRow(asha), action: 'TRANSFER_CREATE', entityType: 'transfer', entityId: 'TRF-2026-0001', metadata: { seeded: true, propertyId: p1.property_id, riskLevel: preflight.riskLevel } });
    await auditService.record({ actor: userRow(asha), action: 'FRAUD_CHECK', entityType: 'transfer', entityId: 'TRF-2026-0001', result: preflight.isFraudulent ? 'FAILURE' : 'SUCCESS', metadata: { seeded: true, riskLevel: fraudRow.risk_level } });
    console.log(`Seeded pending transfer TRF-2026-0001 (risk ${preflight.riskLevel})`);
  }

  console.log('\nSeed complete. Demo accounts:');
  console.log('  Registrar : meera.krishnan@landledger.gov / Registrar@123');
  console.log('  Citizen   : asha.rao@example.com / Citizen@123');
  console.log('  Citizen   : vikram.mehta@example.com / Citizen@123');
  console.log('  Citizen   : priya.nair@example.com / Citizen@123');
}

function envSeed(name, fallback) {
  return process.env[name] || fallback;
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
