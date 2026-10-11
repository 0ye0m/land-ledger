import { Check, X, Circle } from 'lucide-react';

/**
 * Premium registry timeline (spec section 30/33).
 * steps: [{ key, title, meta?, state: 'done'|'active'|'pending'|'failed' }]
 */
export default function Timeline({ steps, className = '' }) {
  return (
    <ol className={`timeline ${className}`}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={step.key || i} className="timeline-step">
            <div className="timeline-rail">
              <span
                className={`timeline-dot ${step.state || 'pending'}`}
                role="img"
                aria-label={step.state === 'done' ? 'completed' : step.state === 'failed' ? 'failed' : step.state === 'active' ? 'in progress' : 'pending'}
              >
                {step.state === 'done' ? (
                  <Check size={9} className="text-[rgb(var(--ll-accent-foreground))]" />
                ) : step.state === 'failed' ? (
                  <X size={9} className="text-destructive-foreground" />
                ) : step.state === 'active' ? (
                  <Circle size={5} className="text-primary-foreground fill-current mx-auto" />
                ) : null}
              </span>
              {!isLast ? <span className="timeline-line" /> : null}
            </div>
            <div className="min-w-0 pb-1">
              <p className="timeline-title">
                <span className="text-[10px] font-bold text-muted-foreground tracking-[0.1em]">{String(i + 1).padStart(2, '0')}</span>
                {step.title}
              </p>
              {step.meta ? <p className="timeline-meta">{step.meta}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Build the canonical transfer lifecycle steps (real state machine).
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
}
