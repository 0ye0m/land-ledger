import { useState } from 'react';
import DocLink from '../../components/registry/DocLink.jsx';
import { ClipboardList, MapPin, Ruler, FileText, Compass, CheckCircle2, XCircle } from 'lucide-react';
import { workflowService, documentService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import { StatusBadge } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, timeAgo, truncateText } from '../../utils/format.js';
import { PROPERTY_TYPES, labelFor } from '../../utils/constants';

/** Static pipeline strip: shows where the surveyor desk sits in the flow. */
function PipelineStrip() {
  const steps = ['Citizen applies', 'Surveyor (you)', 'Clerk verifies', 'Registrar approves', 'On the ledger'];
  return (
    <div className="registry-panel px-4 sm:px-5 py-4">
      <SectionKicker>Registration pipeline</SectionKicker>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] font-semibold">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className={`rounded px-2 py-1 border ${i === 1 ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{s}</span>
            {i < steps.length - 1 ? <span className="muted">→</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SurveyorDashboard() {
  useDocumentTitle('Field survey desk');
  const toast = useToast();
  const queue = useApi(() => workflowService.queue(), []);
  const [decision, setDecision] = useState(null); // { data, kind }
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [inspect, setInspect] = useState(null);

  const properties = queue.data?.data?.properties || [];

  async function submit() {
    if (!decision) return;
    if (decision.kind === 'reject' && !notes.trim()) {
      setError('A reason is required when flagging a survey issue');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const res = await workflowService.survey(decision.data.id, decision.kind === 'approve' ? 'APPROVE' : 'REJECT', notes.trim());
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

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Field verification office"
        title="Field survey desk."
        description="Every new application must be physically verified on the ground before documents are checked. Your clearance moves the file to the document verification office."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricBlock label="Awaiting field survey" value={properties.length} icon={MapPin} tone="primary" />
        <MetricBlock label="Pipeline position" value="Stage 2 of 5" icon={Compass} />
        <MetricBlock label="Next office" value="Clerk · document verification" icon={FileText} />
      </div>

      <PipelineStrip />

      {queue.loading ? (
        <LoadingState label="Loading survey queue…" />
      ) : queue.error ? (
        <ErrorState error={queue.error} onRetry={queue.refetch} />
      ) : properties.length === 0 ? (
        <EmptyState title="Survey queue is clear" message="New applications filed by citizens will appear here for ground verification." icon={ClipboardList} />
      ) : (
        <div className="registry-panel divide-y divide-border">
          {properties.map((p) => (
            <div key={p.id} className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-semibold text-[13px]">{p.property_id}</span>
                  <StatusBadge status={p.status} />
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                    <Ruler size={11} /> {p.area_value} {p.area_unit}
                  </span>
                </div>
                <p className="text-[12.5px] mt-1 truncate">
                  <strong>{truncateText(p.title, 44)}</strong> · {p.city}, {p.district}, {p.state}
                </p>
                <p className="text-[11.5px] muted mt-0.5">
                  Applicant: {p.submitted_by_name || '—'} · {labelFor(p.property_type, PROPERTY_TYPES)} · filed {timeAgo(p.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setInspect(p)}>
                  Inspect
                </Button>
                <Button size="sm" onClick={() => { setDecision({ data: p, kind: 'approve' }); setNotes(''); setError(''); }}>
                  Record survey
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect modal with document evidence */}
      <Modal
        open={Boolean(inspect)}
        onClose={() => setInspect(null)}
        width="max-w-2xl"
        title={inspect?.title}
        kicker={`Field inspection · ${inspect?.property_id}`}
        footer={<Button variant="secondary" onClick={() => setInspect(null)}>Close</Button>}
      >
        {inspect ? (
          <div className="flex flex-col gap-4">
            <div className="detail-grid !grid-cols-1 min-[560px]:!grid-cols-2 sm:!grid-cols-3">
              <div className="detail-cell"><p className="detail-label">Applicant</p><p className="detail-value">{inspect.submitted_by_name || '—'}</p></div>
              <div className="detail-cell"><p className="detail-label">Area claimed</p><p className="detail-value">{inspect.area_value} {inspect.area_unit}</p></div>
              <div className="detail-cell"><p className="detail-label">Filed</p><p className="detail-value">{formatDate(inspect.created_at, { withTime: true })}</p></div>
              <div className="detail-cell col-span-full"><p className="detail-label">Location to verify</p><p className="detail-value">{inspect.address_line}, {inspect.city}, {inspect.district}, {inspect.state}</p></div>
              <div className="detail-cell col-span-full"><p className="detail-label">Applicant's description</p><p className="detail-value">{inspect.description || '—'}</p></div>
            </div>
            <div>
              <SectionKicker>Attached documents</SectionKicker>
              <DocList propertyId={inspect.id} />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Survey decision modal */}
      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.kind === 'approve' ? 'Record survey clearance' : 'Flag survey issue'}
        kicker={`Field survey · ${decision?.data?.property_id}`}
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
            <button
              className={`btn btn-sm flex-1 ${decision?.kind === 'approve' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDecision({ ...decision, kind: 'approve' })}
            >
              <CheckCircle2 size={14} /> Boundaries clear
            </button>
            <button
              className={`btn btn-sm flex-1 ${decision?.kind === 'reject' ? 'btn-destructive' : 'btn-secondary'}`}
              onClick={() => setDecision({ ...decision, kind: 'reject' })}
            >
              <XCircle size={14} /> Issue found
            </button>
          </div>
          <p className="text-[13px] muted leading-relaxed">
            {decision?.kind === 'approve'
              ? 'Confirm the parcel boundaries, measured area and location match the application. Clearance sends the file to the document verification office.'
              : 'Flagging an issue stops the application and returns it to the applicant with your field notes, recorded in the audit trail.'}
          </p>
          <Textarea
            label={decision?.kind === 'approve' ? 'Field notes (optional)' : 'Issue details (required)'}
            rows={3}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setError(''); }}
            error={error}
            placeholder={decision?.kind === 'approve' ? 'e.g. Corner plot, measured area matches, no encroachment.' : 'e.g. Measured area differs from claimed area by more than 5%.'}
          />
        </div>
      </Modal>
    </div>
  );
}

/** Compact document list for the inspect modal. */
function DocList({ propertyId }) {
  const { data, loading } = useApi(() => documentService.list({ propertyId, pageSize: 20 }), [propertyId]);
  const docs = data?.data?.documents || [];
  if (loading) return <LoadingState block={false} label="Loading documents…" />;
  if (docs.length === 0) return <p className="text-[12.5px] muted mt-2">No documents attached yet.</p>;
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {docs.map((d) => (
        <li key={d.id} className="rounded border border-border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-[12.5px] truncate">{truncateText(d.file_name, 42)}</p>
          <DocLink id={d.id} />
        </li>
      ))}
    </ul>
  );
}
