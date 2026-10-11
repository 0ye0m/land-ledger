import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, FilePlus2, ArrowRightLeft, ShieldCheck, ShieldAlert, Database, Link2, RefreshCw, Download, ExternalLink, History, Check,
} from 'lucide-react';
import { propertyService, documentService, registrarService } from '../../services';
import { getToken } from '../../services/api.js';
import { REGISTRATION_STAGES } from '../../utils/constants';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import { StatusBadge, RiskBadge, HashChip } from '../../components/registry/Badges.jsx';
import Timeline from '../../components/registry/Timeline.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { formatDate, formatArea, formatFileSize, truncateText } from '../../utils/format.js';
import { DOCUMENT_TYPES, PROPERTY_TYPES, STATUS_LABELS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';

function DetailCell({ label, children }) {
  return (
    <div className="detail-cell">
      <p className="detail-label">{label}</p>
      <p className="detail-value">{children ?? '—'}</p>
    </div>
  );
}

/**
 * Shared property detail view.
 * role: 'citizen' | 'registrar' — controls review controls & labels.
 */
export default function PropertyDetail({ role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState(null); // { kind: 'approve'|'reject' }
  const [reviewReason, setReviewReason] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [busyDocId, setBusyDocId] = useState(null);

  const { data, loading, error, refetch } = useApi(() => propertyService.detail(id), [id]);
  useDocumentTitle(error ? 'Property' : data?.data?.property?.property_id || 'Property');

  const property = data?.data?.property;
  const documents = data?.data?.documents || [];
  const transfers = data?.data?.transfers || [];
  const transactions = data?.data?.transactions || [];
  const onChain = data?.data?.onChain || { available: false };
  const viewer = data?.data?.viewer || {};
  const isRegistrar = role === 'registrar';

  const [uploadForm, setUploadForm] = useState({ documentType: 'TITLE_DEED', file: null });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const doUpload = useCallback(async () => {
    if (!uploadForm.file) {
      setUploadError('Choose a file to upload');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('propertyId', property.id);
      fd.append('documentType', uploadForm.documentType);
      fd.append('file', uploadForm.file);
      const token = getToken();
      const res = await fetch('/api/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const payload = await res.json();
      if (!res.ok || payload.success === false) throw new Error(payload.message || 'Upload failed');
      toast.success(`Document uploaded · SHA-256 fingerprint recorded`);
      setUploadOpen(false);
      setUploadForm({ documentType: 'TITLE_DEED', file: null });
      refetch();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }, [uploadForm, property, toast, refetch]);

  async function runIntegrityCheck(doc) {
    setBusyDocId(doc.id);
    try {
      const res = await documentService.verifyIntegrity(doc.id);
      if (res.data.intact) toast.success(`Integrity verified for ${truncateText(doc.file_name, 28)}`);
      else toast.error(`Hash mismatch detected — the file changed since upload`);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyDocId(null);
    }
  }

  async function submitReview() {
    if (!reviewAction) return;
    if (reviewAction.kind === 'reject' && !reviewReason.trim()) {
      setReviewError('A rejection reason is required');
      return;
    }
    try {
      if (reviewAction.kind === 'approve') {
        const res = await registrarService.approveProperty(property.id, reviewReason.trim());
        toast.success(res.message);
      } else {
        const res = await registrarService.rejectProperty(property.id, reviewReason.trim());
        toast.info(res.message);
      }
      setReviewAction(null);
      setReviewReason('');
      setReviewError('');
      refetch();
    } catch (err) {
      setReviewError(err.message);
    }
  }

  if (loading) return <LoadingState label="Opening property record…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Property unavailable" />;

  return (
    <div className="flex flex-col gap-6 fade-up">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground w-fit transition-colors">
        <ArrowLeft size={14} /> Back
      </button>

      <PageHeader
        kicker={property.property_id}
        title={property.title}
        description={`${property.address_line}, ${property.city}, ${property.district}, ${property.state}`}
        actions={
          <>
            <StatusBadge status={property.status} />
            {role === 'citizen' && (
              <>
                <Button variant="secondary" size="sm" icon={FilePlus2} onClick={() => setUploadOpen(true)}>
                  Add document
                </Button>
                {property.status === 'REGISTERED' && viewer.isOwner && (
                  <Button size="sm" icon={ArrowRightLeft} onClick={() => setTransferOpen(true)}>
                    Initiate transfer
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {/* Multi-role workflow tracker */}
      <WorkflowTracker property={property} />

      {/* Off-chain application record */}
      <section>
        <SectionKicker>Off-chain application record</SectionKicker>
        <div className="detail-grid mt-3">
          <DetailCell label="Property ID"><span className="font-mono text-[12.5px]">{property.property_id}</span></DetailCell>
          <DetailCell label="Reference number"><span className="font-mono text-[12.5px]">{property.reference_number}</span></DetailCell>
          <DetailCell label="Status"><StatusBadge status={property.status} /></DetailCell>
          <DetailCell label="Address">{property.address_line}</DetailCell>
          <DetailCell label="City">{property.city}</DetailCell>
          <DetailCell label="District">{property.district}</DetailCell>
          <DetailCell label="State">{property.state}</DetailCell>
          <DetailCell label="Area">{formatArea(property.area_value, property.area_unit)}</DetailCell>
          <DetailCell label="Property type">{PROPERTY_TYPES.find((t) => t.value === property.property_type)?.label || property.property_type}</DetailCell>
          <DetailCell label="Current owner">{property.current_owner_name || '—'}</DetailCell>
          <DetailCell label="Owner wallet">
            {property.current_owner_wallet ? <span className="font-mono text-[12px]">{property.current_owner_wallet}</span> : '—'}
          </DetailCell>
          <DetailCell label="Created">{formatDate(property.created_at, { withTime: true })}</DetailCell>
          <DetailCell label="Updated">{formatDate(property.updated_at, { withTime: true })}</DetailCell>
          {property.description ? (
            <div className="detail-cell sm:col-span-2 lg:col-span-3 !border-r-0">
              <p className="detail-label">Description</p>
              <p className="text-[13px] leading-relaxed text-foreground/85">{property.description}</p>
            </div>
          ) : null}
          {property.review_notes ? (
            <div className="detail-cell sm:col-span-2 lg:col-span-3 !border-r-0 !border-b-0 bg-[rgb(var(--ll-warn-soft)/0.5)]">
              <p className="detail-label">Registrar notes</p>
              <p className="text-[13px] leading-relaxed text-foreground/85">{property.review_notes}</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* On-chain ownership record */}
      <section>
        <SectionKicker>On-chain ownership record</SectionKicker>
        <div className="registry-panel mt-3 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`inline-grid place-items-center w-10 h-10 rounded border flex-none ${onChain.available && onChain.verified ? 'border-[rgb(var(--ll-accent)/0.5)] bg-[rgb(var(--ll-accent-soft))] text-[rgb(var(--ll-accent-foreground))]' : 'border-border bg-muted/60 text-muted-foreground'}`}>
              {onChain.available && onChain.verified ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-[14px]">
                {!onChain.available
                  ? 'Blockchain unavailable'
                  : onChain.verified
                    ? 'Ownership verified on the ledger'
                    : 'Not yet registered on the ledger'}
              </p>
              <p className="text-[12.5px] muted mt-0.5 leading-relaxed">
                {onChain.available
                  ? onChain.verified
                    ? 'The current on-chain owner matches this application record.'
                    : property.status === 'REGISTERED'
                      ? 'The record is marked registered, but the ledger could not confirm ownership yet.'
                      : 'Ledger registration happens after registrar approval.'
                  : 'Connectivity to the local Hardhat ledger could not be established.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11.5px] font-mono text-muted-foreground">
            <Database size={13} /> network: hardhat
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Supporting documents */}
        <section>
          <SectionKicker>Supporting documents</SectionKicker>
          <div className="registry-panel mt-3 divide-y divide-border">
            {documents.length === 0 ? (
              <EmptyState
                title="No documents uploaded"
                message="Attach the title deed, survey report and tax receipts for registrar verification."
                icon={FilePlus2}
                action={() =>
                  role === 'citizen' ? (
                    <Button variant="secondary" size="sm" onClick={() => setUploadOpen(true)}>
                      Upload document
                    </Button>
                  ) : null
                }
              />
            ) : (
              documents.map((d) => (
                <div key={d.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[13px] truncate">{d.file_name}</p>
                      <p className="text-[11px] muted mt-0.5">
                        {DOCUMENT_TYPES.find((t) => t.value === d.document_type)?.label || d.document_type} · {formatFileSize(d.file_size)} ·{' '}
                        {formatDate(d.created_at)}
                      </p>
                      <p className="mt-1.5">
                        <span className="hash-chip" title={d.sha256_hash}>
                          sha256 {d.sha256_hash.slice(0, 14)}…{d.sha256_hash.slice(-10)}
                        </span>
                      </p>
                    </div>
                    <StatusBadge status={d.verification_status} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <Button variant="outline" size="sm" icon={RefreshCw} loading={busyDocId === d.id} onClick={() => runIntegrityCheck(d)}>
                      Verify integrity
                    </Button>
                    <a className="btn btn-ghost btn-sm" href={documentService.downloadUrl(d.id)} target="_blank" rel="noreferrer">
                      <Download size={13} /> Download
                    </a>
                    {d.verified_by_name ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground self-center">
                        <Link2 size={11} /> verified by {d.verified_by_name}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Transfer history */}
        <section>
          <SectionKicker>Transfer history</SectionKicker>
          <div className="registry-panel mt-3">
            {transfers.length === 0 ? (
              <EmptyState title="No transfer requests" message="Ownership transfer requests for this property will appear here." icon={ArrowRightLeft} />
            ) : (
              <ul className="divide-y divide-border">
                {transfers.map((t) => (
                  <li key={t.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={isRegistrar ? `/registrar/transfers/${t.transfer_reference}` : `/citizen/transfers/${t.transfer_reference}`} className="font-mono font-semibold text-[12.5px] link">
                        {t.transfer_reference}
                      </Link>
                      <p className="text-[11.5px] muted mt-0.5 truncate">
                        {t.seller_name || '—'} → {t.buyer_name || '—'} · {formatDate(t.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                      <RiskBadge risk={t.risk_level} />
                      <StatusBadge status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Ownership chain - the full chain of title, straight from the ledger */}
        <section className="lg:col-span-2">
          <SectionKicker>Ownership chain · who owned this land</SectionKicker>
          <div className="registry-panel mt-3 p-5">
            <OwnershipChain propertyId={property.property_id} isRegistrar={isRegistrar} />
          </div>
        </section>

        {/* Blockchain history */}
        <section className="lg:col-span-2">
          <SectionKicker>Blockchain history</SectionKicker>
          <div className="registry-panel mt-3 p-5">
            {transactions.length === 0 ? (
              <EmptyState
                title="No on-chain activity yet"
                message="Once the registrar approves this record, the registration transaction is recorded here with its real hash."
                icon={History}
              />
            ) : (
              <Timeline
                steps={transactions.map((tx) => ({
                  key: tx.id,
                  title: tx.operation === 'OWNERSHIP_TRANSFER' ? 'Ownership transferred' : 'Property registered',
                  meta: `${formatDate(tx.timestamp, { withTime: true })} · block ${tx.block_number ?? '—'} · network ${tx.network}`,
                  state: tx.status === 'CONFIRMED' ? 'done' : 'failed',
                }))}
              />
            )}
            {transactions.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2 border-t border-border pt-4">
                {transactions.map((tx) => (
                  <span key={tx.id} className="flex items-center gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tx.operation === 'OWNERSHIP_TRANSFER' ? 'Transfer' : 'Register'}
                    </span>
                    <HashChip hash={tx.status === 'CONFIRMED' ? tx.transaction_hash : `FAILED: ${tx.error_message || ''}`} />
                    <StatusBadge status={tx.status === 'CONFIRMED' ? 'COMPLETED' : 'FAILED'} />
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Registrar review controls */}
      {isRegistrar && property.status === 'DOCS_VERIFIED' ? (
        <section className="registry-panel p-5 border-t-2 border-t-primary/40">
          <SectionKicker>Registrar decision</SectionKicker>
          <p className="text-[13px] muted mt-2 max-w-2xl leading-relaxed">
            Survey and document verification are complete. Approving registers this property on the blockchain ledger against the owner wallet. Rejection requires a reason that is recorded in
            the audit trail.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-4">
            <Button icon={ShieldCheck} onClick={() => { setReviewAction({ kind: 'approve' }); setReviewError(''); }}>
              Approve registration
            </Button>
            <Button variant="destructive" onClick={() => { setReviewAction({ kind: 'reject' }); setReviewError(''); }}>
              Reject
            </Button>
          </div>
        </section>
      ) : null}

      {/* Upload modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload supporting document"
        kicker="Document evidence"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={doUpload} loading={uploading}>
              Upload & fingerprint
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="field-label" htmlFor="doc-type">
            Document type
          </label>
          <select id="doc-type" className="input" value={uploadForm.documentType} onChange={(e) => setUploadForm((f) => ({ ...f, documentType: e.target.value }))}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div>
            <label className="field-label" htmlFor="doc-file">
              File
            </label>
            <input
              id="doc-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              className="input file:mr-3 file:btn file:btn-secondary file:btn-sm file:border-0"
              onChange={(e) => setUploadForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
            />
            <p className="field-help">PDF, PNG, JPG, WEBP, DOC or DOCX · up to 10 MB. A SHA-256 fingerprint is recorded at upload.</p>
          </div>
          {uploadError ? (
            <p className="field-error" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Transfer quick-start */}
      <ConfirmDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Initiate ownership transfer"
        message="Choose the buyer's registered email on the next screen. The registry will run ownership, duplicate and fraud checks before the registrar reviews the request."
        confirmLabel="Continue"
        onConfirm={() => navigate('/citizen/transfers/new')}
      />

      {/* Registrar decision modal */}
      <Modal
        open={Boolean(reviewAction)}
        onClose={() => setReviewAction(null)}
        title={reviewAction?.kind === 'approve' ? 'Approve property registration' : 'Reject property registration'}
        kicker="Registrar decision"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewAction(null)}>
              Cancel
            </Button>
            <Button variant={reviewAction?.kind === 'reject' ? 'destructive' : 'primary'} onClick={submitReview}>
              {reviewAction?.kind === 'approve' ? 'Approve & register on ledger' : 'Reject registration'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] muted leading-relaxed">
            {reviewAction?.kind === 'approve'
              ? 'The property will be registered on the Hardhat ledger under the owner wallet. The transaction hash will be stored with this record.'
              : 'The application will be marked rejected. Provide a clear reason for the applicant.'}
          </p>
          <Textarea
            label={reviewAction?.kind === 'approve' ? 'Review note (optional)' : 'Rejection reason (required)'}
            rows={3}
            value={reviewReason}
            onChange={(e) => {
              setReviewReason(e.target.value);
              setReviewError('');
            }}
            error={reviewError}
          />
        </div>
      </Modal>
    </div>
  );
}

/**
 * Multi-role workflow tracker: shows the four registration stages with the
 * current position, plus the full stage history (who cleared what, when).
 */
const STAGE_INDEX = { SUBMITTED: 0, SURVEY_VERIFIED: 1, DOCS_VERIFIED: 2, REGISTERED: 3 };
const STAGE_OWNER = { SURVEY: 'Surveyor', DOCUMENT_VERIFICATION: 'Doc verification clerk', REGISTRAR_REVIEW: 'Registrar' };
const ACTION_LABELS = {
  SURVEY_PASSED: 'Field survey passed',
  SURVEY_REJECTED: 'Rejected at field survey',
  DOCS_VERIFIED: 'Documents verified',
  DOCS_REJECTED: 'Rejected at document verification',
  REGISTRAR_APPROVED: 'Registrar approved & registered',
  REGISTRAR_REJECTED: 'Rejected by registrar',
  ADMIN_OVERRIDE_REJECT: 'Stopped by oversight',
};

function WorkflowTracker({ property }) {
  const history = Array.isArray(property.stage_history) ? property.stage_history : [];
  const rejected = property.status === 'REJECTED';
  const registered = property.status === 'REGISTERED';
  const currentIndex = rejected ? -1 : (STAGE_INDEX[property.status] ?? 0);

  return (
    <section>
      <SectionKicker>Workflow progress</SectionKicker>
      <div className="registry-panel mt-3 px-4 sm:px-5 py-4">
        {/* Stage rail */}
        <div className="flex flex-wrap gap-x-2 gap-y-2">
          {REGISTRATION_STAGES.map((s, i) => {
            const done = registered || (!rejected && i < currentIndex);
            const current = !rejected && i === currentIndex;
            const reached = done || current;
            return (
              <div key={s.key} className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    done
                      ? 'border-[rgb(var(--ll-accent)/0.4)] bg-[rgb(var(--ll-accent-soft))] text-[rgb(var(--ll-accent-foreground))]'
                      : current
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                  }`}
                  title={s.hint}
                >
                  {done ? <CheckCircle2 size={12} /> : current ? <Circle size={12} /> : <Circle size={12} className="opacity-40" />}
                  {s.label}
                </span>
                {i < REGISTRATION_STAGES.length - 1 ? <span className="muted text-[11px]">→</span> : null}
              </div>
            );
          })}
          {rejected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] text-destructive px-2.5 py-1 text-[11px] font-bold">
              <XCircle size={12} /> Stopped at {STAGE_OWNER[property.rejection_stage] || 'an office'}
            </span>
          ) : null}
        </div>

        {/* Stage history trail */}
        {history.length ? (
          <ul className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-[12.5px]">
                  <strong>{ACTION_LABELS[h.action] || h.action}</strong>
                  <span className="muted"> · {STAGE_OWNER[h.stage] || h.stage} · {h.by_name || 'system'}{h.by_role ? ` (${h.by_role})` : ''}</span>
                </p>
                <p className="text-[11px] muted">{h.at ? formatDate(h.at, { withTime: true }) : ''}</p>
                {h.notes ? <p className="text-[11.5px] muted w-full italic">“{h.notes}”</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-border pt-3 text-[12px] muted">No office actions recorded yet — the file is waiting at its first desk.</p>
        )}
      </div>
    </section>
  );
}

/**
 * OwnershipChain - the full chain of title for this parcel, read from the
 * ledger (GET /api/properties/:id/ownership-history). Shows every confirmed
 * on-chain event in order: first registration, then each purchase, with the
 * holder's NAME resolved from the registry (not just a wallet string), the
 * transfer reference it came from, and the real transaction hash.
 */
function OwnershipChain({ propertyId, isRegistrar }) {
  const { data, loading, error } = useApi(() => propertyService.ownershipHistory(propertyId), [propertyId]);
  const payload = data && data.data ? data.data : null;
  const history = (payload && Array.isArray(payload.history)) ? payload.history : [];
  const currentOwner = payload ? payload.currentOwner : null;

  if (loading) return <LoadingState block={false} label="Loading chain of title…" />;
  if (error) {
    return <p className="text-[12.5px] text-destructive">Ownership history could not be loaded for this parcel.</p>;
  }
  if (!history.length) {
    return (
      <EmptyState
        title="No on-chain ownership events yet"
        message="The chain of title appears here as soon as the parcel is registered on the ledger - every registration and every purchase will be listed below in order, with the holder's name and the transaction that settled it."
        icon={History}
      />
    );
  }

  return (
    <div>
      <ol className="timeline">
        {history.map((h, i) => (
          <li key={h.transactionHash || i} className="timeline-step">
            <div className="timeline-rail">
              <span className="timeline-dot done" role="img" aria-label="completed">
                <Check size={9} className="text-[rgb(var(--ll-accent-foreground))]" />
              </span>
              {i < history.length - 1 ? <span className="timeline-line" /> : null}
            </div>
            <div className="min-w-0 pb-1">
              <p className="timeline-title">
                <span className="text-[10px] font-bold text-muted-foreground tracking-[0.1em]">{String(i + 1).padStart(2, '0')}</span>
                {h.type === 'REGISTRATION' ? 'Registered on the ledger' : 'Purchased · ownership transferred'}
              </p>
              <div className="timeline-meta flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {h.type === 'REGISTRATION' ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground">First holder:</span>
                    <OwnerTag party={h.owner} />
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <OwnerTag party={h.previousOwner} fallback="previous holder" />
                    <ArrowRightLeft size={13} className="text-muted-foreground flex-none" />
                    <OwnerTag party={h.newOwner} fallback="new holder" />
                    {h.transfer && h.transfer.reference ? (
                      <Link
                        to={isRegistrar ? `/registrar/transfers/${h.transfer.reference}` : `/citizen/transfers/${h.transfer.reference}`}
                        className="font-mono text-[11px] font-semibold link ml-1"
                      >
                        {h.transfer.reference}
                      </Link>
                    ) : null}
                  </span>
                )}
              </div>
              <p className="text-[11px] muted mt-0.5">
                {h.timestamp ? formatDate(h.timestamp, { withTime: true }) : ''}
                {h.blockNumber != null ? ` · block ${h.blockNumber}` : ''}
                {` · network ${h.network || 'hardhat'}`}
              </p>
              {h.transactionHash ? (
                <div className="mt-1.5">
                  <HashChip hash={h.transactionHash} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {currentOwner ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 mt-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Current holder</span>
          <OwnerTag party={currentOwner} />
          <span className="text-[11px] muted ml-auto inline-flex items-center gap-1">
            <ShieldCheck size={12} className="text-[rgb(var(--ll-accent))]" /> settled on-chain
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Name + wallet chip for a chain-of-title participant. */
function OwnerTag({ party, fallback }) {
  if (!party || (!party.name && !party.wallet)) {
    return <span className="text-muted-foreground">{fallback || 'Unknown holder'}</span>;
  }
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="font-semibold text-[12.5px] text-foreground">{party.name || 'Unknown holder'}</span>
      {party.wallet ? (
        <span className="font-mono text-[10.5px] text-muted-foreground">{truncateText(party.wallet, 16)}</span>
      ) : null}
    </span>
  );
}
