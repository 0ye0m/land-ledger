import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowRightLeft, Landmark, ShieldAlert, FileText } from 'lucide-react';
import { registrarService, transferService, documentService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import { StatusBadge, RiskBadge, HashChip } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, timeAgo, formatFileSize, truncateText } from '../../utils/format.js';

function Tabs({ active, onChange }) {
  const tabs = [
    { id: 'properties', label: 'Property registrations', icon: Landmark },
    { id: 'transfers', label: 'Ownership transfers', icon: ArrowRightLeft },
  ];
  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Review queues">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} onClick={() => onChange(t.id)} className={`btn btn-sm ${active === t.id ? 'btn-primary' : 'btn-secondary'}`}>
          <t.icon size={14} /> {t.label}
        </button>
      ))}
    </div>
  );
}

export default function ReviewQueuePage() {
  useDocumentTitle('Review queue');
  const toast = useToast();
  const [tab, setTab] = useState('properties');
  const [detail, setDetail] = useState(null); // {type:'property'|'transfer', data}
  const [decision, setDecision] = useState(null); // {kind, target}
  const [reason, setReason] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [working, setWorking] = useState(false);
  const [busyDocId, setBusyDocId] = useState(null);

  const propsQueue = useApi(() => registrarService.pendingProperties(), []);
  const transfersQueue = useApi(() => registrarService.pendingTransfers(), []);

  async function refreshBoth() {
    propsQueue.refetch();
    transfersQueue.refetch();
    setDetail(null);
    setDecision(null);
  }

  async function submitDecision() {
    if (!decision) return;
    if (decision.kind === 'reject' && !reason.trim()) {
      setDecisionError('A rejection reason is required');
      return;
    }
    setWorking(true);
    setDecisionError('');
    try {
      let res;
      if (decision.target.type === 'property') {
        res = decision.kind === 'approve'
          ? await registrarService.approveProperty(decision.target.data.id, reason.trim())
          : await registrarService.rejectProperty(decision.target.data.id, reason.trim());
      } else {
        res = decision.kind === 'approve'
          ? await transferService.approve(decision.target.data.id, reason.trim())
          : await transferService.reject(decision.target.data.id, reason.trim());
      }
      toast.success(res.message);
      await refreshBoth();
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function checkDocIntegrity(docId) {
    setBusyDocId(docId);
    try {
      const res = await documentService.verifyIntegrity(docId);
      if (res.data.intact) toast.success('Integrity verified — SHA-256 fingerprints match');
      else toast.error('Hash mismatch detected — file modified since upload');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyDocId(null);
    }
  }

  const properties = propsQueue.data?.data?.properties || [];
  const transfers = transfersQueue.data?.data?.transfers || [];
  const loading = tab === 'properties' ? propsQueue.loading : transfersQueue.loading;
  const error = tab === 'properties' ? propsQueue.error : transfersQueue.error;

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Registry review"
        title="Review queue."
        description="Dense operational work queue. High-risk records are flagged without drowning the page."
      />

      <Tabs active={tab} onChange={setTab} />

      {loading ? (
        <LoadingState label="Loading queue…" />
      ) : error ? (
        <ErrorState error={error} onRetry={tab === 'properties' ? propsQueue.refetch : transfersQueue.refetch} />
      ) : tab === 'properties' ? (
        properties.length === 0 ? (
          <EmptyState title="Review queue is clear" message="No property registrations are awaiting review." icon={ClipboardList} />
        ) : (
          <div className="registry-panel divide-y divide-border">
            {properties.map((p) => (
              <div key={p.id} className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Link to={`/registrar/properties/${p.property_id}`} className="font-mono font-semibold text-[13px] link">
                      {p.property_id}
                    </Link>
                    <StatusBadge status={p.status} />
                    {p.verified_document_count < p.document_count ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[rgb(var(--ll-warn))]">
                        <FileText size={11} /> {p.verified_document_count}/{p.document_count} docs verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[rgb(var(--ll-accent-foreground))]">
                        <FileText size={11} /> {p.document_count}/{p.document_count} docs verified
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] mt-1 truncate">
                    <strong>{truncateText(p.title, 44)}</strong> · {p.city}, {p.district}, {p.state}
                  </p>
                  <p className="text-[11.5px] muted mt-0.5">
                    Applicant: {p.submitted_by_name || '—'} · submitted {timeAgo(p.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setDetail({ type: 'property', data: p })}>
                    Inspect
                  </Button>
                  <Button size="sm" onClick={() => { setDecision({ kind: 'approve', target: { type: 'property', data: p } }); setDecisionError(''); }}>
                    Approve
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => { setDecision({ kind: 'reject', target: { type: 'property', data: p } }); setDecisionError(''); }}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : transfers.length === 0 ? (
        <EmptyState title="No pending transfers" message="Ownership transfer requests awaiting review will appear here, highest risk first." icon={ArrowRightLeft} />
      ) : (
        <div className="registry-panel divide-y divide-border">
          {transfers.map((t) => (
            <div key={t.id} className={`px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3 ${t.risk_level === 'HIGH' ? 'border-l-[3px] border-l-destructive/50' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Link to={`/registrar/transfers/${t.transfer_reference}`} className="font-mono font-semibold text-[13px] link">
                    {t.transfer_reference}
                  </Link>
                  <RiskBadge risk={t.risk_level} />
                  <StatusBadge status={t.status} />
                </div>
                <p className="text-[12.5px] mt-1">
                  <span className="font-mono text-[12px] font-semibold">{t.property_business_id}</span> · {t.seller_name} → {t.buyer_name}
                </p>
                <p className="text-[11.5px] muted mt-0.5">
                  {t.verified_document_count}/{t.document_count} docs verified · requested {formatDate(t.created_at)}
                  {t.fraud_reasons?.length ? ` · ${t.fraud_reasons.length} flag(s)` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDetail({ type: 'transfer', data: t })}>
                  Inspect
                </Button>
                <Button size="sm" onClick={() => { setDecision({ kind: 'approve', target: { type: 'transfer', data: t } }); setDecisionError(''); }}>
                  Approve
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setDecision({ kind: 'reject', target: { type: 'transfer', data: t } }); setDecisionError(''); }}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect modal */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        width="max-w-2xl"
        title={detail?.type === 'property' ? detail?.data?.title : detail?.data?.transfer_reference}
        kicker={detail?.type === 'property' ? `Property registration · ${detail?.data?.property_id}` : 'Ownership transfer request'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDecision({ kind: 'approve', target: detail });
                setDecisionError('');
              }}
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDecision({ kind: 'reject', target: detail });
                setDecisionError('');
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="detail-grid !grid-cols-1 min-[560px]:!grid-cols-2 sm:!grid-cols-3">
              {detail.type === 'property' ? (
                <>
                  <div className="detail-cell"><p className="detail-label">Applicant</p><p className="detail-value">{detail.data.submitted_by_name || '—'}</p></div>
                  <div className="detail-cell"><p className="detail-label">Owner wallet</p><p className="detail-value font-mono text-[11.5px] break-all">{detail.data.current_owner_wallet || '—'}</p></div>
                  <div className="detail-cell"><p className="detail-label">Submitted</p><p className="detail-value">{formatDate(detail.data.created_at)}</p></div>
                  <div className="detail-cell col-span-full"><p className="detail-label">Location</p><p className="detail-value">{detail.data.address_line}, {detail.data.city}, {detail.data.district}, {detail.data.state}</p></div>
                </>
              ) : (
                <>
                  <div className="detail-cell"><p className="detail-label">Seller</p><p className="detail-value">{detail.data.seller_name}</p></div>
                  <div className="detail-cell"><p className="detail-label">Buyer</p><p className="detail-value">{detail.data.buyer_name}</p></div>
                  <div className="detail-cell"><p className="detail-label">Buyer wallet</p><p className="detail-value font-mono text-[11.5px] break-all">{detail.data.buyer_wallet || '—'}</p></div>
                  <div className="detail-cell"><p className="detail-label">Risk</p><p className="detail-value"><RiskBadge risk={detail.data.risk_level} /></p></div>
                  <div className="detail-cell"><p className="detail-label">Requested</p><p className="detail-value">{formatDate(detail.data.created_at, { withTime: true })}</p></div>
                  <div className="detail-cell"><p className="detail-label">Property</p><p className="detail-value font-mono text-[12px]">{detail.data.property_business_id}</p></div>
                  {detail.data.fraud_reasons?.length ? (
                    <div className="detail-cell col-span-full bg-[rgb(var(--ll-destructive-soft)/0.5)]">
                      <p className="detail-label">Fraud flags</p>
                      <ul className="list-disc ml-4 text-[12.5px] space-y-1">
                        {detail.data.fraud_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <SectionKicker>Document evidence</SectionKicker>
              <DocEvidence mini type={detail.type} onCheck={checkDocIntegrity} busyId={busyDocId} detail={detail} />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Decision modal */}
      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.kind === 'approve' ? (decision?.target?.type === 'property' ? 'Approve & register on ledger' : 'Approve & settle on ledger') : 'Reject request'}
        kicker="Registrar decision"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant={decision?.kind === 'reject' ? 'destructive' : 'primary'} onClick={submitDecision} loading={working}>
              {decision?.kind === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] muted leading-relaxed">
            {decision?.kind === 'approve'
              ? decision?.target?.type === 'property'
                ? 'The property will be registered on the Hardhat ledger under the owner wallet. The real transaction hash is stored with the record.'
                : 'The fraud engine re-runs first. If clear, the smart contract settles ownership on the ledger before the registry updates.'
              : 'The request is returned to the applicant with your reason, recorded in the audit trail.'}
          </p>
          <Textarea
            label={decision?.kind === 'approve' ? 'Review note (optional)' : 'Rejection reason (required)'}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setDecisionError('');
            }}
            error={decisionError}
          />
        </div>
      </Modal>
    </div>
  );
}

/** Loads and lists documents for the inspected record. */
function DocEvidence({ detail, onCheck, busyId }) {
  const propertyId = detail.data.property_id || detail.data.id;
  const { data, loading } = useApi(() => documentService.list({ propertyId, pageSize: 20 }), [propertyId]);
  const docs = data?.data?.documents || [];

  if (loading) return <LoadingState block={false} label="Loading documents…" />;
  if (docs.length === 0) return <p className="text-[12.5px] muted mt-2">No documents attached to this record.</p>;

  return (
    <ul className="mt-3 flex flex-col gap-2">
      {docs.map((d) => (
        <li key={d.id} className="rounded border border-border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-[12.5px] truncate">{truncateText(d.file_name, 40)}</p>
            <p className="hash-chip mt-1" title={d.sha256_hash}>
              sha256 {d.sha256_hash.slice(0, 14)}…{d.sha256_hash.slice(-10)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={d.verification_status} />
            <Button variant="outline" size="sm" icon={ShieldAlert} loading={busyId === d.id} onClick={() => onCheck(d.id)}>
              Hash check
            </Button>
            <a className="btn btn-ghost btn-sm" href={documentService.downloadUrl(d.id)} target="_blank" rel="noreferrer">
              View
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
