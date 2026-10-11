#!/usr/bin/env python3
"""FEATURES:
F1 - buildTransferSteps rewritten to the real state machine: the consent
     gate and the clerk document-verification stage become first-class,
     visible steps (process transparency for users).
F2 - PropertyDetail gains an "Ownership chain" section driven by the
     (previously unused) GET /properties/:id/ownership-history endpoint:
     chronological who-owned-what with names, transfer links, real tx hashes.
"""
import sys

ok = True
def patch(path, old, new, tag, count=1):
    global ok
    p = BASE + path
    t = open(p).read()
    if new in t and old not in t:
        print(f"SKIP ({tag}): already applied")
        return
    if old not in t:
        print(f"FAIL ({tag}): anchor not found in {path}")
        ok = False
        return
    open(p, 'w').write(t.replace(old, new, count))
    print(f"OK   ({tag})")

BASE = '/home/z/my-project/land-ledger/frontend/src/'

# ---------- F1: Timeline.jsx - real state machine ----------
OLD_STEPS = """/** Build the canonical transfer lifecycle steps (spec section 30). */
export function buildTransferSteps(transfer, { fraudCheck, tx } = {}) {
  const status = transfer?.status;
  const approvedOrBeyond = ['APPROVED', 'COMPLETED'].includes(status);
  const rejected = status === 'REJECTED';
  const failed = status === 'FAILED';

  const steps = [
    { key: 'created', title: 'Request created', meta: 'Transfer request submitted to the registry', state: 'done' },
    {
      key: 'checks',
      title: 'Registry validation',
      meta: 'Ownership, duplicates and conflict checks',
      state: 'done',
    },
    {
      key: 'fraud',
      title: 'Fraud & conflict check',
      meta: fraudCheck ? `${fraudCheck.risk_level} risk · ${fraudCheck.is_fraudulent ? 'flags raised' : 'no blocking flags'}` : 'Rule-based checks executed',
      state: fraudCheck?.is_fraudulent ? 'failed' : 'done',
    },
    {
      key: 'review',
      title: 'Registrar review',
      meta: rejected
        ? `Rejected — ${transfer.rejection_reason || 'no reason recorded'}`
        : approvedOrBeyond
          ? `Approved${transfer.approved_at ? ` · ${new Date(transfer.approved_at).toLocaleDateString('en-IN')}` : ''}`
          : 'Awaiting registrar decision',
      state: rejected ? 'failed' : approvedOrBeyond ? 'done' : 'active',
    },
    {
      key: 'chain',
      title: 'Ledger settlement',
      meta: tx
        ? tx.status === 'CONFIRMED'
          ? `Block ${tx.block_number} · ${String(tx.transaction_hash).slice(0, 14)}…`
          : `Failed — ${tx.error_message || 'transaction error'}`
        : approvedOrBeyond
          ? 'Submitting transaction…'
          : 'Pending approval',
      state: tx ? (tx.status === 'CONFIRMED' ? 'done' : 'failed') : approvedOrBeyond ? 'active' : 'pending',
    },
    {
      key: 'settled',
      title: 'Ownership updated',
      meta: status === 'COMPLETED' ? 'Ownership record settled in the registry' : rejected ? '—' : failed ? 'Settlement did not complete' : 'Completes after confirmation',
      state: status === 'COMPLETED' ? 'done' : failed ? 'failed' : rejected ? 'pending' : 'pending',
    },
  ];
  return steps;
}"""

NEW_STEPS = """/** Build the canonical transfer lifecycle steps (real state machine).
 *  TRANSFER_REQUESTED -> CONSENT_PENDING -> clerk DOCS_VERIFICATION ->
 *  REGISTRAR_REVIEW -> BLOCKCHAIN_SETTLEMENT -> COMPLETED.
 *  Every stage the file passes through is visible to the user, including
 *  WHO the file is waiting on at the current stage. */
export function buildTransferSteps(transfer, { fraudCheck, tx, consents } = {}) {
  const status = transfer?.status;
  const settled = ['APPROVED', 'COMPLETED'].includes(status);
  const rejected = status === 'REJECTED';
  const failed = status === 'FAILED';
  const stageOfRejection = transfer?.rejection_stage || null;
  const failedAt = (stage) => rejected && stageOfRejection === stage;

  // Consent board rollup (all required parties must explicitly approve).
  const consentRows = Array.isArray(consents) ? consents : [];
  const totalParties = consentRows.length;
  const approvedParties = consentRows.filter((c) => c.status === 'APPROVED').length;
  const rejectedRow = consentRows.find((c) => c.status === 'REJECTED');
  const consentDone = totalParties > 0 && approvedParties === totalParties;
  const beyondConsent = ['PENDING', 'DOCS_VERIFIED', 'APPROVED', 'COMPLETED'].includes(status);

  const clerkDone = ['DOCS_VERIFIED', 'APPROVED', 'COMPLETED'].includes(status);
  const atClerk = status === 'PENDING';
  const atConsent = status === 'CONSENT_PENDING';

  const docClerkName = transfer?.doc_verified_by_name || null;

  const steps = [
    { key: 'created', title: 'Request created', meta: 'Transfer request submitted to the registry', state: 'done' },
    {
      key: 'fraud',
      title: 'Fraud & conflict check',
      meta: fraudCheck ? `${fraudCheck.risk_level} risk · ${fraudCheck.is_fraudulent ? 'flags raised' : 'no blocking flags'}` : 'Rule-based checks executed',
      state: fraudCheck?.is_fraudulent ? 'failed' : 'done',
    },
    {
      key: 'consent',
      title: 'Party consent',
      meta: failedAt('CONSENT')
        ? `Consent refused — ${rejectedRow?.rejection_reason || transfer.rejection_reason || 'a required party rejected the request'}`
        : consentDone || beyondConsent
          ? `All required parties approved (${approvedParties}/${totalParties || '—'})`
          : atConsent
            ? `Waiting for ${Math.max(totalParties - approvedParties, 1)} required part${totalParties - approvedParties === 1 ? 'y' : 'ies'} to approve (${approvedParties}/${totalParties})`
            : 'Consent of every required party is collected before office review',
      state: failedAt('CONSENT') ? 'failed' : consentDone || beyondConsent ? 'done' : atConsent ? 'active' : 'pending',
    },
    {
      key: 'clerk',
      title: 'Document verification',
      meta: failedAt('DOCUMENT_VERIFICATION')
        ? `Rejected — ${transfer.rejection_reason || 'documents failed verification'}`
        : clerkDone
          ? `Documents verified${transfer.doc_verified_at ? ` · ${new Date(transfer.doc_verified_at).toLocaleDateString('en-IN')}` : ''}${docClerkName ? ` by ${docClerkName}` : ''}`
          : atClerk
            ? 'Awaiting clerk document verification'
            : 'Clerk verifies the transfer documents first',
      state: failedAt('DOCUMENT_VERIFICATION') ? 'failed' : clerkDone ? 'done' : atClerk ? 'active' : 'pending',
    },
    {
      key: 'review',
      title: 'Registrar review',
      meta: failedAt('REGISTRAR_REVIEW')
        ? `Rejected — ${transfer.rejection_reason || 'no reason recorded'}`
        : settled
          ? `Approved${transfer.approved_at ? ` · ${new Date(transfer.approved_at).toLocaleDateString('en-IN')}` : ''}`
          : status === 'DOCS_VERIFIED'
            ? 'Awaiting registrar decision'
            : 'Opens after document verification',
      state: failedAt('REGISTRAR_REVIEW') ? 'failed' : settled ? 'done' : status === 'DOCS_VERIFIED' ? 'active' : 'pending',
    },
    {
      key: 'chain',
      title: 'Ledger settlement',
      meta: tx
        ? tx.status === 'CONFIRMED'
          ? `Block ${tx.block_number} · ${String(tx.transaction_hash || '').slice(0, 14)}…`
          : `Failed — ${tx.error_message || 'transaction error'}`
        : settled
          ? 'Submitting transaction…'
          : 'Runs after registrar approval',
      state: tx ? (tx.status === 'CONFIRMED' ? 'done' : 'failed') : settled ? 'active' : 'pending',
    },
    {
      key: 'settled',
      title: 'Ownership updated',
      meta: status === 'COMPLETED' ? 'Ownership record settled in the registry' : failed ? 'Settlement did not complete' : rejected ? '—' : 'Completes after confirmation',
      state: status === 'COMPLETED' ? 'done' : failed ? 'failed' : 'pending',
    },
  ];
  return steps;
}"""

patch('components/registry/Timeline.jsx', OLD_STEPS, NEW_STEPS, 'F1-timeline-state-machine')

# TransferDetail passes the consent board into the timeline
patch('components/registry/TransferDetail.jsx',
    "  const steps = buildTransferSteps(transfer, { fraudCheck, tx });",
    "  const steps = buildTransferSteps(transfer, { fraudCheck, tx, consents });",
    'F1-pass-consents')

# ---------- F2: PropertyDetail - Ownership chain section ----------
# 2a. add Check icon to imports
patch('components/registry/PropertyDetail.jsx',
    "  ArrowLeft, FilePlus2, ArrowRightLeft, ShieldCheck, ShieldAlert, Database, Link2, RefreshCw, Download, ExternalLink, History,\n} from 'lucide-react';",
    "  ArrowLeft, FilePlus2, ArrowRightLeft, ShieldCheck, ShieldAlert, Database, Link2, RefreshCw, Download, ExternalLink, History, Check,\n} from 'lucide-react';",
    'F2-check-icon')

# 2b. render the section between Transfer history and Blockchain history
OLD_SECTION = """        {/* Blockchain history */}
        <section className="lg:col-span-2">
          <SectionKicker>Blockchain history</SectionKicker>"""
NEW_SECTION = """        {/* Ownership chain - the full chain of title, straight from the ledger */}
        <section className="lg:col-span-2">
          <SectionKicker>Ownership chain · who owned this land</SectionKicker>
          <div className="registry-panel mt-3 p-5">
            <OwnershipChain propertyId={property.property_id} isRegistrar={isRegistrar} />
          </div>
        </section>

        {/* Blockchain history */}
        <section className="lg:col-span-2">
          <SectionKicker>Blockchain history</SectionKicker>"""
patch('components/registry/PropertyDetail.jsx', OLD_SECTION, NEW_SECTION, 'F2-section')

sys.exit(0 if ok else 1)
