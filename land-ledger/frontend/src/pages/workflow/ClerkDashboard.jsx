import { useState } from 'react';
import DocLink from '../../components/registry/DocLink.jsx';
import { ArrowRightLeft, FileCheck2, FileText, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { workflowService, documentService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import { StatusBadge, RiskBadge } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, timeAgo, truncateText } from '../../utils/format.js';

function Tabs({ active, onChange, propCount, trfCount }) {
  const tabs = [
    { id: 'properties', label: `Registration files (${propCount})`, icon: FileCheck2 },
    { id: 'transfers', label: `Transfer files (${trfCount})`, icon: ArrowRightLeft },
  ];
  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Verification queues">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} onClick={() => onChange(t.id)} className={`btn btn-sm ${active === t.id ? 'btn-primary' : 'btn-secondary'}`}>
          <t.icon size={14} /> {t.label}
        </button>
      ))}
    </div>
  );
}

export default function ClerkDashboard() {
  useDocumentTitle('Document verification desk');
  const toast = useToast();
  const queue = useApi(() => workflowService.queue(), []);
  const [tab, setTab] = useState('properties');
  const [decision, setDecision] = useState(null); // { type, data, kind }
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [inspect, setInspect] = useState(null); // { type, data }
  const [busyDocId, setBusyDocId] = useState(null);

  const properties = queue.data?.data?.properties || [];
  const transfers = queue.data?.data?.transfers || [];

  async function submit() {
    if (!decision) return;
    if (decision.kind === 'reject' && !notes.trim()) {
      setError('A reason is required when rejecting');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const kind = decision.kind === 'approve' ? 'APPROVE' : 'REJECT';
      const res = decision.type === 'property'
        ? await workflowService.verifyPropertyDocs(decision.data.id, kind, notes.trim())
        : await workflowService.verifyTransferDocs(decision.data.id, kind, notes.trim());
      toast.success(res.message);
      setDecision(null);
      setNotes('');
      queue.refetch();
    } catch (err) {
      setError(err.message);
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

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Document verification office"
        title="Verification desk."
        description="Survey-cleared registrations and fresh transfer requests arrive here. Check every attached document, run hash checks, then clear the file for the registrar's legal review."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricBlock label="Registrations to verify" value={properties.length} icon={FileCheck2} tone="primary" />
        <MetricBlock label="Transfers to verify" value={transfers.length} icon={ArrowRightLeft} tone={transfers.length ? 'warn' : 'default'} />
        <MetricBlock label="Next office" value="Registrar · legal review" icon={FileText} />
      </div>

      <Tabs active={tab} onChange={setTab} propCount={properties.length} trfCount={transfers.length} />

      {queue.loading ? (
        <LoadingState label="Loading verification desk…" />
      ) : queue.error ? (
        <ErrorState error={queue.error} onRetry={queue.refetch} />
      ) : tab === 'properties' ? (
        properties.length === 0 ? (
          <EmptyState title="No registrations to verify" message="Files cleared by the field surveyor will appear here for document verification." icon={FileCheck2} />
        ) : (
          <div className="registry-panel divide-y divide-border">
            {properties.map((p) => (
              <div key={p.id} className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-semibold text-[13px]">{p.property_id}</span>
                    <StatusBadge status={p.status} />
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      <FileText size={11} /> {p.document_count} doc(s)
                    </span>
                  </div>
                  <p className="text-[12.5px] mt-1 truncate">
                    <strong>{truncateText(p.title, 44)}</strong> · {p.city}, {p.district}, {p.state}
                  </p>
                  <p className="text-[11.5px] muted mt-0.5">
                    Applicant: {p.submitted_by_name || '—'} · survey cleared {timeAgo(p.updated_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setInspect({ type: 'property', data: p })}>Inspect</Button>
                  <Button size="sm" onClick={() => { setDecision({ type: 'property', data: p, kind: 'approve' }); setNotes(''); setError(''); }}>Verify docs</Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : transfers.length === 0 ? (
        <EmptyState title="No transfers to verify" message="New ownership transfer requests will appear here for document verification before the registrar sees them." icon={ArrowRightLeft} />
      ) : (
        <div className="registry-panel divide-y divide-border">
          {transfers.map((t) => (
            <div key={t.id} className={`px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3 ${t.risk_level === 'HIGH' ? 'border-l-[3px] border-l-destructive/50' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-semibold text-[13px]">{t.transfer_reference}</span>
                  <RiskBadge risk={t.risk_level} />
                  <StatusBadge status={t.status} />
                </div>
                <p className="text-[12.5px] mt-1">
                  <span className="font-mono text-[12px] font-semibold">{t.property_business_id}</span> · {t.seller_name} → {t.buyer_name}
                </p>
                <p className="text-[11.5px] muted mt-0.5">
                  Requested {formatDate(t.created_at)} · {t.verified_document_count}/{t.document_count} docs verified
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setInspect({ type: 'transfer', data: t })}>Inspect</Button>
                <Button size="sm" onClick={() => { setDecision({ type: 'transfer', data: t, kind: 'approve' }); setNotes(''); setError(''); }}>Verify docs</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect modal */}
      <Modal
        open={Boolean(inspect)}
        onClose={() => setInspect(null)}
        width="max-w-2xl"
        title={inspect?.type === 'property' ? inspect?.data?.title : inspect?.data?.transfer_reference}
        kicker={inspect?.type === 'property' ? `Registration file · ${inspect?.data?.property_id}` : 'Ownership transfer request'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setInspect(null)}>Close</Button>
            <Button size="sm" onClick={() => { setDecision({ ...inspect, kind: 'approve' }); setNotes(''); setError(''); }}>Verify docs</Button>
          </>
        }
      >
        {inspect ? (
          <div className="flex flex-col gap-4">
            <div className="detail-grid !grid-cols-1 min-[560px]:!grid-cols-2 sm:!grid-cols-3">
              {inspect.type === 'property' ? (
                <>
                  <div className="detail-cell"><p className="detail-label">Applicant</p><p className="detail-value">{inspect.data.submitted_by_name || '—'}</p></div>
                  <div className="detail-cell"><p className="detail-label">Survey notes</p><p className="detail-value">{inspect.data.survey_notes || 'Cleared by surveyor'}</p></div>
                  <div className="detail-cell"><p className="detail-label">Filed</p><p className="detail-value">{formatDate(inspect.data.created_at)}</p></div>
                  <div className="detail-cell col-span-full"><p className="detail-label">Location</p><p className="detail-value">{inspect.data.address_line}, {inspect.data.city}, {inspect.data.district}, {inspect.data.state}</p></div>
                </>
              ) : (
                <>
                  <div className="detail-cell"><p className="detail-label">Seller</p><p className="detail-value">{inspect.data.seller_name}</p></div>
                  <div className="detail-cell"><p className="detail-label">Buyer</p><p className="detail-value">{inspect.data.buyer_name}</p></div>
                  <div className="detail-cell"><p className="detail-label">Risk</p><p className="detail-value"><RiskBadge risk={inspect.data.risk_level} /></p></div>
                  <div className="detail-cell col-span-full"><p className="detail-label">Request details</p><p className="detail-value">{inspect.data.request_details || '—'}</p></div>
                </>
              )}
            </div>
            <div>
              <SectionKicker>Document evidence</SectionKicker>
              <DocEvidence propertyId={inspect.data.property_id || inspect.data.id} onCheck={checkDocIntegrity} busyId={busyDocId} />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Decision modal */}
      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.kind === 'approve' ? 'Clear documents' : 'Reject at document verification'}
        kicker={decision?.type === 'property' ? `Registration file · ${decision?.data?.property_id}` : `Transfer file · ${decision?.data?.transfer_reference}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={working}>Cancel</Button>
            <Button variant={decision?.kind === 'approve' ? 'primary' : 'destructive'} onClick={submit} loading={working}>
              Confirm
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button className={`btn btn-sm flex-1 ${decision?.kind === 'approve' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDecision({ ...decision, kind: 'approve' })}>
              <CheckCircle2 size={14} /> Documents in order
            </button>
            <button className={`btn btn-sm flex-1 ${decision?.kind === 'reject' ? 'btn-destructive' : 'btn-secondary'}`} onClick={() => setDecision({ ...decision, kind: 'reject' })}>
              <XCircle size={14} /> Deficiency found
            </button>
          </div>
          <p className="text-[13px] muted leading-relaxed">
            {decision?.kind === 'approve'
              ? 'Confirm every attached document is present, legible and consistent. The file then moves to the registrar for legal scrutiny.'
              : 'Rejecting stops the file and returns it to the applicant with your reason, recorded in the audit trail.'}
          </p>
          <Textarea
            label={decision?.kind === 'approve' ? 'Verification note (optional)' : 'Deficiency details (required)'}
            rows={3}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setError(''); }}
            error={error}
          />
        </div>
      </Modal>
    </div>
  );
}

/** Loads and lists documents for the inspected record. */
function DocEvidence({ propertyId, onCheck, busyId }) {
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
            <DocLink id={d.id} />

          </div>
        </li>
      ))}
    </ul>
  );
}
