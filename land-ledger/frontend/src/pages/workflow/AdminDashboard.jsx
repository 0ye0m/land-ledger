import { useState } from 'react';
import { LayoutGrid, Users, MapPin, ArrowRightLeft, ShieldAlert, ScrollText, Landmark } from 'lucide-react';
import { workflowService, registrarService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import { StatusBadge } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, timeAgo } from '../../utils/format.js';

const STAGE_LABELS = {
  SUBMITTED: 'Awaiting field survey',
  SURVEY_VERIFIED: 'Awaiting doc verification',
  DOCS_VERIFIED: 'At registrar desk',
  PENDING: 'Transfers · doc verification',
};

export default function AdminDashboard() {
  useDocumentTitle('Oversight board');
  const toast = useToast();
  const oversight = useApi(() => workflowService.oversight(), []);
  const queue = useApi(() => workflowService.queue(), []);
  const activity = useApi(() => registrarService.activity({ limit: 8 }), []);
  const [stop, setStop] = useState(null); // { type, data }
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const data = oversight.data?.data || {};
  const propCounts = data.propertyStageCounts || {};
  const trfCounts = data.transferStageCounts || {};
  const users = data.users || [];
  const activeProps = queue.data?.data?.properties || [];
  const activeTransfers = queue.data?.data?.transfers || [];
  const events = activity.data?.data?.events || [];

  async function submitStop() {
    if (!stop) return;
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const res = stop.type === 'property'
        ? await workflowService.overrideRejectProperty(stop.data.id, reason.trim())
        : await workflowService.overrideRejectTransfer(stop.data.id, reason.trim());
      toast.success(res.message);
      setStop(null);
      setReason('');
      queue.refetch();
      oversight.refetch();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  const totalActive = activeProps.length + activeTransfers.length;

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Senior registry oversight"
        title="Oversight board."
        description="Control-tower view of the whole registration pipeline. Every office's queue is visible here, and oversight can stop any active file that should not proceed."
      />

      {oversight.loading ? (
        <LoadingState label="Loading oversight board…" />
      ) : oversight.error ? (
        <ErrorState error={oversight.error} onRetry={oversight.refetch} />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <MetricBlock label="Awaiting field survey" value={propCounts.SUBMITTED ?? 0} icon={MapPin} tone="primary" />
            <MetricBlock label="Awaiting doc verification" value={propCounts.SURVEY_VERIFIED ?? 0} icon={LayoutGrid} />
            <MetricBlock label="At registrar desk" value={propCounts.DOCS_VERIFIED ?? 0} icon={Landmark} tone="warn" />
            <MetricBlock label="Registered on ledger" value={propCounts.REGISTERED ?? 0} icon={Landmark} tone="ok" />
          </div>

          <div className="registry-panel px-4 sm:px-5 py-4">
            <SectionKicker>People & accounts</SectionKicker>
            <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] font-semibold">
              {Object.entries(data.users?.reduce ? countRoles(users) : {}).map(([role, n]) => (
                <span key={role} className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Users size={12} /> {role}: <span className="text-foreground">{n}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Active files board */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[15px] font-bold">Active files ({totalActive})</h2>
              <p className="text-[11.5px] muted">Oversight can stop any active file — the action is recorded in the audit trail.</p>
            </div>

            {queue.loading ? (
              <LoadingState label="Loading active files…" />
            ) : totalActive === 0 ? (
              <EmptyState title="No active files" message="Every application and transfer has been processed. New filings will appear here." icon={LayoutGrid} />
            ) : (
              <div className="registry-panel divide-y divide-border">
                {activeProps.map((p) => (
                  <div key={p.id} className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-semibold text-[13px]">{p.property_id}</span>
                        <StatusBadge status={p.status} />
                        <span className="text-[11px] font-bold text-muted-foreground">{STAGE_LABELS[p.status]}</span>
                      </div>
                      <p className="text-[12.5px] mt-1 truncate"><strong>{p.title}</strong> · {p.city}, {p.district}</p>
                      <p className="text-[11.5px] muted mt-0.5">Applicant: {p.submitted_by_name || '—'} · updated {timeAgo(p.updated_at)}</p>
                    </div>
                    <Button variant="destructive" size="sm" icon={ShieldAlert} onClick={() => { setStop({ type: 'property', data: p }); setReason(''); setError(''); }}>
                      Stop file
                    </Button>
                  </div>
                ))}
                {activeTransfers.map((t) => (
                  <div key={t.id} className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-semibold text-[13px]">{t.transfer_reference}</span>
                        <StatusBadge status={t.status} />
                        <span className="text-[11px] font-bold text-muted-foreground">{STAGE_LABELS[t.status]}</span>
                      </div>
                      <p className="text-[12.5px] mt-1">
                        <span className="font-mono text-[12px] font-semibold">{t.property_business_id}</span> · {t.seller_name} → {t.buyer_name}
                      </p>
                      <p className="text-[11.5px] muted mt-0.5">Transfer · requested {timeAgo(t.created_at)}</p>
                    </div>
                    <Button variant="destructive" size="sm" icon={ShieldAlert} onClick={() => { setStop({ type: 'transfer', data: t }); setReason(''); setError(''); }}>
                      Stop file
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Roster */}
          <div className="flex flex-col gap-3">
            <h2 className="text-[15px] font-bold">Registry roster</h2>
            <div className="registry-panel divide-y divide-border max-h-96 overflow-y-auto">
              {users.map((u) => (
                <div key={u.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{u.full_name}</p>
                    <p className="text-[11.5px] muted truncate">{u.email} · {u.district || '—'}, {u.state || '—'}</p>
                  </div>
                  <div className="text-right">
                    <span className="status-badge border-border-strong bg-muted/60 text-muted-foreground">{u.role}</span>
                    <p className="text-[10.5px] muted mt-1">last active {u.last_activity_at ? timeAgo(u.last_activity_at) : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent audit */}
          <div className="flex flex-col gap-3">
            <h2 className="text-[15px] font-bold inline-flex items-center gap-2"><ScrollText size={15} /> Recent system activity</h2>
            <div className="registry-panel divide-y divide-border">
              {events.map((e) => (
                <div key={e.id} className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px]">
                    <strong>{e.actor}</strong> <span className="muted">({e.role})</span> · <span className="font-mono text-[11.5px]">{e.action}</span>
                    {e.entityId ? <span className="muted"> · {String(e.entityId).slice(0, 26)}</span> : null}
                  </p>
                  <p className="text-[11px] muted">{e.createdAt ? formatDate(e.createdAt, { withTime: true }) : ''}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Stop-file modal */}
      <Modal
        open={Boolean(stop)}
        onClose={() => setStop(null)}
        title="Oversight stop"
        kicker={stop?.type === 'property' ? `Registration file · ${stop?.data?.property_id}` : `Transfer file · ${stop?.data?.transfer_reference}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStop(null)} disabled={working}>Cancel</Button>
            <Button variant="destructive" onClick={submitStop} loading={working}>Confirm stop</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] muted leading-relaxed">
            The file is returned to the applicant immediately, whichever office currently holds it. The stop, your name and the reason are permanently recorded in the audit trail.
          </p>
          <Textarea label="Reason (required)" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} error={error} />
        </div>
      </Modal>
    </div>
  );
}

function countRoles(users) {
  return users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});
}
