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

/** Build the canonical transfer lifecycle steps (spec section 30). */
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
}
