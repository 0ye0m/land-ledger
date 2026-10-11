import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, XCircle, CheckCircle2, Download, Users, CircleDashed } from 'lucide-react';
import { transferService, documentService, registrarService, consentService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import { StatusBadge, RiskBadge, HashChip } from '../../components/registry/Badges.jsx';
import Timeline, { buildTransferSteps } from '../../components/registry/Timeline.jsx';
import { LoadingState, ErrorState } from '../../components/registry/States.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, formatFileSize, truncateText } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CONSENT_STATUS_LABELS, CONSENT_PARTY_ROLE_LABELS } from '../../utils/constants.js';

function Cell({ label, children }) {
  return (
    <div className="detail-cell">
      <p className="detail-label">{label}</p>
      <p className="detail-value">{children ?? '—'}</p>
    </div>
  );
}

/**
 * Transfer detail (shared). role: 'citizen' | 'registrar'
 */
export default function TransferDetail({ role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [action, setAction] = useState(null); // 'approve' | 'reject'
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [working, setWorking] = useState(false);

  const { data, loading, error, refetch } = useApi(() => transferService.detail(id), [id]);
  useDocumentTitle(data?.data?.transfer?.transfer_reference || 'Transfer');

  const transfer = data?.data?.transfer;
  const fraudCheck = data?.data?.fraudCheck;
  const tx = data?.data?.blockchainTransaction;
  const documents = data?.data?.documents || [];
  const auditTrail = data?.data?.auditTrail || [];
  const consents = data?.data?.consents || [];
  const myConsent = data?.data?.myConsent || null;
  const isRegistrar = role === 'registrar';

  const [consentAction, setConsentAction] = useState(null); // 'approve' | 'reject'
  const [consentReason, setConsentReason] = useState('');
  const [consentError, setConsentError] = useState('');
  const [consentWorking, setConsentWorking] = useState(false);

  async function submitConsentDecision() {
    if (consentAction === 'reject' && !consentReason.trim()) {
      setConsentError('A rejection reason is required');
      return;
    }
    setConsentWorking(true);
    setConsentError('');
    try {
      const res = await consentService.decide(myConsent.consentId, consentAction === 'approve' ? 'APPROVE' : 'REJECT', consentReason.trim());
      toast.success(res.message || 'Consent recorded');
      setConsentAction(null);
      setConsentReason('');
      refetch();
    } catch (err) {
      setConsentError(err.message);
    } finally {
      setConsentWorking(false);
    }
  }

  async function submitDecision() {
    if (!action) return;
    if (action === 'reject' && !reason.trim()) {
      setActionError('A rejection reason is required');
      return;
    }
    setWorking(true);
    setActionError('');
    try {
      if (action === 'approve') {
        const res = await transferService.approve(transfer.id, reason.trim());
        toast.success(res.message || 'Transfer approved and settled');
      } else {
        const res = await transferService.reject(transfer.id, reason.trim());
        toast.info(res.message);
      }
      setAction(null);
      setReason('');
      refetch();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <LoadingState label="Opening transfer record…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Transfer unavailable" />;

  const steps = buildTransferSteps(transfer, { fraudCheck, tx, consents });

  return (
    <div className="flex flex-col gap-6 fade-up">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground w-fit transition-colors">
        <ArrowLeft size={14} /> Back
      </button>

      <PageHeader
        kicker={transfer.transfer_reference}
        title={`Ownership transfer — ${transfer.property_business_id}`}
        description={`${transfer.seller_name || '—'} → ${transfer.buyer_name || '—'} · requested ${formatDate(transfer.created_at, { withTime: true })}`}
        actions={
          <>
            <RiskBadge risk={transfer.risk_level} />
            <StatusBadge status={transfer.status} />
          </>
        }
      />

      {transfer.status === 'FAILED' ? (
        <div className="rounded border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] px-4 py-3.5">
          <p className="font-bold text-destructive text-[14px] flex items-center gap-2">
            <XCircle size={15} /> Transfer failed
          </p>
          <p className="text-[12.5px] text-destructive/90 mt-1 leading-relaxed">
            {tx?.error_message || 'The ledger settlement did not complete. Ownership was not changed. You can create a new transfer request.'}
          </p>
        </div>
      ) : null}

      {transfer.status === 'REJECTED' && transfer.rejection_reason ? (
        <div className="rounded border border-[rgb(var(--ll-warn)/0.5)] bg-[rgb(var(--ll-warn-soft))] px-4 py-3.5">
          <p className="font-bold text-[14px] text-[rgb(var(--ll-warn))]">Rejected{transfer.rejection_stage === 'CONSENT' ? ' during party consent' : ' by registrar'}</p>
          <p className="text-[12.5px] mt-1 text-foreground/80 leading-relaxed">{transfer.rejection_reason}</p>
        </div>
      ) : null}

      {/* Your pending consent decision (Part 16) */}
      {myConsent && transfer.status === 'CONSENT_PENDING' ? (
        <section className="registry-panel p-5 border-l-4 border-l-[rgb(var(--ll-warn))]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-[14.5px] text-[rgb(var(--ll-warn))] uppercase tracking-wide">Action required</p>
              <p className="text-[13px] mt-1 text-foreground/85 leading-relaxed">
                This transfer needs your explicit consent as{' '}
                <span className="font-semibold">{CONSENT_PARTY_ROLE_LABELS[myConsent.partyRole] || myConsent.partyRole}</span> before it can move to office review.
              </p>
            </div>
            <div className="flex gap-2.5">
              <Button icon={CheckCircle2} onClick={() => { setConsentAction('approve'); setConsentError(''); }}>
                Approve
              </Button>
              <Button variant="destructive" onClick={() => { setConsentAction('reject'); setConsentError(''); }}>
                Reject
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Multi-party consent board */}
      {consents.length > 0 ? (
        <section className="registry-panel">
          <header className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
              <Users size={16} /> Required party consent
            </h2>
            <span className="text-[12px] muted">
              {consents.filter((c) => c.status === 'APPROVED').length}/{consents.length} approved
            </span>
          </header>
          <ul className="divide-y divide-border">
            {consents.map((c) => (
              <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-3">
                  {c.status === 'APPROVED' ? (
                    <CheckCircle2 size={17} style={{ color: 'rgb(var(--ll-accent))' }} className="flex-none" />
                  ) : c.status === 'REJECTED' ? (
                    <XCircle size={17} className="text-destructive flex-none" />
                  ) : (
                    <CircleDashed size={17} className="text-muted-foreground flex-none" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] truncate">
                      {c.party_name || c.party_email || 'Party'}
                      {c.is_me ? <span className="ml-2 text-[11px] font-bold uppercase text-[rgb(var(--ll-accent))]">you</span> : null}
                    </p>
                    <p className="text-[11.5px] muted">{CONSENT_PARTY_ROLE_LABELS[c.party_role] || c.party_role}{c.responded_at ? ` · responded ${formatDate(c.responded_at, { withTime: true })}` : ''}</p>
                    {c.rejection_reason ? <p className="text-[11.5px] text-destructive mt-0.5">Reason: {c.rejection_reason}</p> : null}
                  </div>
                </div>
                <span className={`text-[12px] font-bold ${c.status === 'APPROVED' ? 'text-[rgb(var(--ll-accent-foreground))]' : c.status === 'REJECTED' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {CONSENT_STATUS_LABELS[c.status] || c.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-5 py-3 text-[11.5px] muted border-t border-border">
            Office review can only begin after every required party has explicitly consented. Decisions are recorded in the audit trail and cannot be changed.
          </p>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-5 items-start">
        {/* Timeline */}
        <section className="registry-panel p-5">
          <SectionKicker>Transfer timeline</SectionKicker>
          <div className="mt-4">
            <Timeline steps={steps} />
          </div>
        </section>

        {/* Detail grid */}
        <section className="flex flex-col gap-5">
          <div className="detail-grid !grid-cols-1 sm:!grid-cols-2">
            <Cell label="Transfer ID"><span className="font-mono text-[12.5px]">{transfer.transfer_reference}</span></Cell>
            <Cell label="Status"><StatusBadge status={transfer.status} /></Cell>
            <Cell label="Seller">{transfer.seller_name}</Cell>
            <Cell label="Buyer">{transfer.buyer_name}</Cell>
            <Cell label="Requested">{formatDate(transfer.created_at, { withTime: true })}</Cell>
            <Cell label="Risk level"><RiskBadge risk={transfer.risk_level} /></Cell>
            <div className="detail-cell sm:col-span-2 !border-r-0">
              <p className="detail-label">Property</p>
              <p className="detail-value">
                <Link to={isRegistrar ? `/registrar/properties/${transfer.property_business_id}` : `/citizen/properties/${transfer.property_business_id}`} className="link font-mono text-[12.5px]">
                  {transfer.property_business_id}
                </Link>{' '}
                — {transfer.property_title}
              </p>
            </div>
          </div>

          {/* Blockchain result */}
          <div className="registry-panel p-5">
            <SectionKicker>Blockchain result</SectionKicker>
            {tx && tx.status === 'CONFIRMED' ? (
              <div className="mt-3 flex flex-col gap-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">Transaction hash</span>
                  <HashChip hash={tx.transaction_hash} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">Block number</span>
                  <span className="font-mono text-[12.5px] font-semibold">{tx.block_number}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">Network</span>
                  <span className="font-mono text-[12.5px] font-semibold">{tx.network}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">Timestamp</span>
                  <span className="text-[12.5px] font-semibold">{formatDate(tx.timestamp, { withTime: true })}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                  <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">Previous owner</span>
                  <span className="font-mono text-[11px]">{truncateText(tx.from_address || '—', 14, 8)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">New owner</span>
                  <span className="font-mono text-[11px]">{truncateText(tx.to_address || '—', 14, 8)}</span>
                </div>
              </div>
            ) : tx ? (
              <div className="mt-3">
                <p className="text-[13px] font-semibold text-destructive flex items-center gap-2">
                  <XCircle size={14} /> Transaction failed — no fake hash is shown
                </p>
                <p className="text-[12px] muted mt-1">{tx.error_message || 'The transaction could not be confirmed.'}</p>
              </div>
            ) : (
              <p className="text-[13px] muted mt-3">
                {['APPROVED'].includes(transfer.status)
                  ? 'Settlement transaction in progress…'
                  : 'A real transaction hash appears here once the registrar approves and the ledger confirms.'}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Fraud results */}
      {fraudCheck ? (
        <section className="registry-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionKicker>Fraud & conflict check results</SectionKicker>
            <RiskBadge risk={fraudCheck.risk_level} />
          </div>
          {fraudCheck.reasons?.length ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {fraudCheck.reasons.map((r, i) => (
                <li key={i} className="text-[12.5px] flex items-start gap-2 text-foreground/85">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 flex-none" /> {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] muted mt-2">No blocking reasons recorded.</p>
          )}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(fraudCheck.checks_performed || []).map((c) => (
              <div key={c.check} className={`rounded border px-3 py-2.5 ${c.status === 'FAIL' ? 'border-destructive/40 bg-[rgb(var(--ll-destructive-soft)/0.6)]' : c.status === 'WARN' ? 'border-[rgb(var(--ll-warn)/0.4)] bg-[rgb(var(--ll-warn-soft)/0.5)]' : 'border-[rgb(var(--ll-accent)/0.4)] bg-[rgb(var(--ll-accent-soft)/0.4)]'}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                  {c.status === 'PASS' ? <CheckCircle2 size={12} style={{ color: 'rgb(var(--ll-accent))' }} /> : c.status === 'WARN' ? <span className="status-dot pending" /> : <XCircle size={12} className="text-destructive" />}
                  {c.label}
                </p>
                <p className="text-[11.5px] muted mt-1 leading-snug">{c.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Documents on record */}
      <section className="registry-panel">
        <header className="px-5 py-3.5 border-b border-border">
          <h2 className="font-display font-bold text-[15px]">Supporting documents</h2>
        </header>
        {documents.length === 0 ? (
          <p className="px-5 py-6 text-[13px] muted">No documents on record for this property.</p>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-[13px] truncate">{truncateText(d.file_name, 44)}</p>
                  <p className="text-[11px] muted">{formatFileSize(d.file_size)} · {formatDate(d.created_at)}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <StatusBadge status={d.verification_status} />
                  <a className="btn btn-ghost btn-sm" href={documentService.downloadUrl(d.id)} target="_blank" rel="noreferrer">
                    <Download size={13} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Registrar controls */}
      {isRegistrar && transfer.status === 'DOCS_VERIFIED' ? (
        <section className="registry-panel p-5 border-t-2 border-t-primary/40">
          <SectionKicker>Registrar decision</SectionKicker>
          <p className="text-[13px] muted mt-2 max-w-2xl leading-relaxed">
            Approval triggers an on-chain ownership transfer under the operator account. Ownership updates only after the ledger confirms the
            transaction. The fraud engine re-runs at decision time.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-4">
            <Button icon={ShieldCheck} onClick={() => { setAction('approve'); setActionError(''); }}>
              Approve & settle on ledger
            </Button>
            <Button variant="destructive" onClick={() => { setAction('reject'); setActionError(''); }}>
              Reject transfer
            </Button>
          </div>
        </section>
      ) : null}

      {/* Audit history */}
      {isRegistrar && auditTrail.length > 0 ? (
        <section className="registry-panel">
          <header className="px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px]">Audit history</h2>
          </header>
          <ul className="divide-y divide-border">
            {auditTrail.map((a) => (
              <li key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[12.5px]">
                <span className="font-semibold">{a.action.replaceAll('_', ' ')}</span>
                <span className="muted truncate max-w-[45%]">{a.actor_display || 'system'}</span>
                <span className={`font-semibold ${a.result === 'SUCCESS' ? 'text-[rgb(var(--ll-accent-foreground))]' : 'text-destructive'}`}>{a.result}</span>
                <span className="muted text-[11.5px] flex-none">{formatDate(a.created_at, { withTime: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Decision modal (party consent) */}
      <Modal
        open={Boolean(consentAction)}
        onClose={() => setConsentAction(null)}
        title={consentAction === 'approve' ? 'Approve this transfer' : 'Reject this transfer'}
        kicker="Your consent"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConsentAction(null)} disabled={consentWorking}>
              Cancel
            </Button>
            <Button variant={consentAction === 'reject' ? 'destructive' : 'primary'} onClick={submitConsentDecision} loading={consentWorking}>
              {consentAction === 'approve' ? 'Record approval' : 'Record rejection'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] muted leading-relaxed">
            {consentAction === 'approve'
              ? 'Your approval is recorded permanently in the audit trail. Once every required party has approved, the transfer moves to office review.'
              : 'Your rejection stops this transfer immediately. The other parties are notified and the request is closed with your recorded reason.'}
          </p>
          <Textarea
            label={consentAction === 'approve' ? 'Note (optional)' : 'Rejection reason (required)'}
            rows={3}
            value={consentReason}
            onChange={(e) => {
              setConsentReason(e.target.value);
              setConsentError('');
            }}
            error={consentError}
          />
        </div>
      </Modal>

      {/* Decision modal (registrar) */}
      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action === 'approve' ? 'Approve & settle on ledger' : 'Reject transfer'}
        kicker="Registrar decision"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant={action === 'reject' ? 'destructive' : 'primary'} onClick={submitDecision} loading={working}>
              {action === 'approve' ? 'Approve transfer' : 'Reject transfer'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] muted leading-relaxed">
            {action === 'approve'
              ? 'The smart contract will transfer ownership to the buyer wallet. This usually takes a few seconds on the local Hardhat network. The page refreshes with the confirmed transaction hash.'
              : 'The request returns to the applicant with your recorded reason.'}
          </p>
          <Textarea
            label={action === 'approve' ? 'Approval note (optional)' : 'Rejection reason (required)'}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setActionError('');
            }}
            error={actionError}
          />
        </div>
      </Modal>
    </div>
  );
}
