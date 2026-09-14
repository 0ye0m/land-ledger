import { Link } from 'react-router-dom';
import {
  ClipboardList, ArrowRightLeft, ShieldAlert, FileCheck2, XCircle, CheckCircle2, Boxes, Clock,
  Database, LogIn, CloudOff,
} from 'lucide-react';
import { registrarService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import { StatusBadge, RiskBadge, OperationBadge, HashChip, Pill, StatusDot } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { formatDate, timeAgo, truncateText } from '../../utils/format.js';

export default function RegistrarDashboard() {
  useDocumentTitle('Registry operations');
  const { data, loading, error, refetch } = useApi(() => registrarService.dashboard());

  if (loading) return <LoadingState label="Loading registry operations…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { metrics, recentTransactions, recentReviews, highRiskTransfers, documentActivity } = data.data;

  return (
    <div className="flex flex-col gap-7 fade-up">
      <PageHeader
        kicker="Registry operations"
        title="Registry operations."
        description="Pending work, risk posture and ledger activity across the registry."
        actions={
          <Link to="/registrar/review" className="btn btn-primary btn-sm sm:btn">
            <ClipboardList size={15} /> Open review queue
          </Link>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <MetricBlock label="Pending registrations" value={metrics.pending_registrations} icon={ClipboardList} tone={metrics.pending_registrations ? 'warn' : 'default'} />
        <MetricBlock label="Pending transfers" value={metrics.pending_transfers} icon={ArrowRightLeft} tone={metrics.pending_transfers ? 'warn' : 'default'} />
        <MetricBlock label="Fraud alerts" value={metrics.fraud_alerts} icon={ShieldAlert} tone={metrics.fraud_alerts ? 'bad' : 'default'} />
        <MetricBlock label="Verified documents" value={metrics.verified_documents} icon={FileCheck2} tone="ok" />
        <MetricBlock label="Rejected requests" value={metrics.rejected_requests} icon={XCircle} />
        <MetricBlock label="Completed transfers" value={metrics.completed_transfers} icon={CheckCircle2} tone="ok" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* High-risk transfers — most actionable */}
        <section className="registry-panel lg:col-span-2 border-l-[3px] border-l-destructive/60">
          <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
              <ShieldAlert size={16} className="text-destructive" /> High-risk transfers awaiting review
            </h2>
            <Link to="/registrar/transfers?risk=HIGH" className="text-[12.5px] link">
              Review all
            </Link>
          </header>
          {highRiskTransfers.length === 0 ? (
            <p className="px-5 py-6 text-[13px] muted">No high-risk transfers pending. The queue is clean.</p>
          ) : (
            <ul className="divide-y divide-border">
              {highRiskTransfers.map((t) => (
                <li key={t.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/registrar/transfers/${t.transfer_reference}`} className="font-mono font-semibold text-[12.5px] link">
                      {t.transfer_reference}
                    </Link>
                    <p className="text-[11.5px] muted mt-0.5">
                      {t.property_business_id} · {t.seller_name} → {t.buyer_name} · {timeAgo(t.created_at)}
                    </p>
                  </div>
                  <RiskBadge risk="HIGH" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent blockchain transactions */}
        <section className="registry-panel">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
              <Boxes size={15} /> Recent blockchain transactions
            </h2>
            <Link to="/registrar/ledger" className="text-[12.5px] link">
              Ledger
            </Link>
          </header>
          {recentTransactions.length === 0 ? (
            <EmptyState title="No blockchain transactions" message="Confirmed registry transactions will appear here." icon={Boxes} />
          ) : (
            <ul className="divide-y divide-border">
              {recentTransactions.map((tx) => (
                <li key={tx.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold flex items-center gap-2">
                      <OperationBadge operation={tx.operation} />
                      <span className="font-mono muted text-[11px]">{tx.property_id || '—'}</span>
                    </p>
                    <p className="mt-1">
                      <HashChip hash={tx.status === 'CONFIRMED' ? tx.transaction_hash : `failed: ${tx.error_message || ''}`} />
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold ${tx.status === 'CONFIRMED' ? 'text-[rgb(var(--ll-accent-foreground))]' : 'text-destructive'}`}>{tx.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent review activity */}
        <section className="registry-panel">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
              <Clock size={15} /> Recent review activity
            </h2>
            <Link to="/registrar/audit" className="text-[12.5px] link">
              Audit log
            </Link>
          </header>
          {recentReviews.length === 0 ? (
            <EmptyState title="No review activity yet" message="Approvals, rejections and verifications will appear here." icon={Clock} />
          ) : (
            <ul className="divide-y divide-border">
              {recentReviews.map((a) => (
                <li key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[12.5px]">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.action.replaceAll('_', ' ')}</p>
                    <p className="text-[11px] muted truncate">{a.actor_display || 'system'} · {a.entity_type} {truncateText(a.entity_id || '', 24)}</p>
                  </div>
                  <span className={`text-[11px] font-bold flex-none ${a.result === 'SUCCESS' ? 'text-[rgb(var(--ll-accent-foreground))]' : 'text-destructive'}`}>
                    {a.result} · {timeAgo(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Document verification activity */}
        <section className="registry-panel lg:col-span-2">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
              <FileCheck2 size={15} /> Document verification activity
            </h2>
            <Link to="/registrar/documents" className="text-[12.5px] link">
              Document registry
            </Link>
          </header>
          {documentActivity.length === 0 ? (
            <p className="px-5 py-6 text-[13px] muted">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {documentActivity.map((d) => (
                <li key={d.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[12.5px] truncate">{truncateText(d.file_name, 48)}</p>
                    <p className="text-[11px] muted font-mono">{d.property_business_id} · {formatDate(d.created_at)}</p>
                  </div>
                  <StatusBadge status={d.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* MongoDB Atlas live activity (audit_events + login_events collections) */}
      <AtlasActivity />
    </div>
  );
}

/**
 * Live activity stream backed by MongoDB Atlas.
 * - Left: registry audit events (mirrored into Atlas `audit_events`)
 * - Right: sign-in security telemetry (Atlas `login_events`)
 * Falls back to the PostgreSQL audit trail while Atlas is unreachable,
 * so the panel always shows real data and clearly labels its source.
 */
function AtlasActivity() {
  const activity = useApi(() => registrarService.activity({ limit: 10 }));
  const logins = useApi(() => registrarService.loginEvents({ limit: 6 }));

  const aData = activity.data?.data;
  const lData = logins.data?.data;
  const atlasLive = aData?.source === 'mongodb-atlas';
  const loading = activity.loading || logins.loading;

  if (activity.error) {
    return (
      <section className="registry-panel">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
            <Database size={15} /> Live activity stream
          </h2>
        </header>
        <p className="px-5 py-6 text-[13px] muted">Activity stream temporarily unavailable.</p>
      </section>
    );
  }

  return (
    <section className="registry-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-border">
        <h2 className="font-display font-bold text-[15px] flex items-center gap-2">
          <Database size={15} /> Live activity stream
          <Pill primary={atlasLive} icon={Database} className={atlasLive ? '' : 'text-amber-700 border-amber-400/60'}>
            {atlasLive ? 'MongoDB Atlas' : 'Offline'}
          </Pill>
        </h2>
        <Link to="/registrar/audit" className="text-[12.5px] link">Full audit log</Link>
      </header>

      {!atlasLive && !loading && (
        <p className="px-5 py-2.5 text-[12px] muted border-b border-border flex items-center gap-2">
          <CloudOff size={13} className="flex-none" />
          MongoDB Atlas unreachable right now — the live stream will resume automatically the moment the connection is restored.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Registry audit events */}
        <div className="min-w-0 lg:border-r border-border">
          {loading && !aData ? (
            <p className="px-5 py-6 text-[13px] muted">Loading activity…</p>
          ) : !aData || aData.events.length === 0 ? (
            <EmptyState title="No activity yet" message="Registry events will stream here as they happen." icon={Database} />
          ) : (
            <ul className="divide-y divide-border">
              {aData.events.map((e) => (
                <li key={e.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[12.5px]">
                  <div className="min-w-0">
                    <p className="font-semibold">{e.action.replaceAll('_', ' ')}</p>
                    <p className="text-[11px] muted truncate">{e.actor} · {e.entityType || '—'} {truncateText(e.entityId || '', 22)}</p>
                  </div>
                  <span className={`text-[11px] font-bold flex-none ${e.result === 'SUCCESS' ? 'text-[rgb(var(--ll-accent-foreground))]' : 'text-destructive'}`}>
                    {e.result} · {e.createdAt ? timeAgo(e.createdAt) : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sign-in security telemetry (MongoDB-only capability) */}
        <div className="min-w-0 border-t lg:border-t-0 border-border">
          <div className="px-5 pt-3 pb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold tracking-wide uppercase muted flex items-center gap-1.5">
              <LogIn size={12} /> Sign-in security events
            </p>
            {lData?.available ? (
              <span className="text-[11px] muted">{lData.total} total · {lData.failedTotal} failed</span>
            ) : null}
          </div>
          {!lData || !lData.available ? (
            <p className="px-5 py-5 text-[12.5px] muted">
              Sign-in telemetry is stored in MongoDB Atlas and will appear here once the cluster connection is live.
            </p>
          ) : lData.events.length === 0 ? (
            <p className="px-5 py-5 text-[12.5px] muted">No sign-ins recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lData.events.map((e) => (
                <li key={e.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[12.5px]">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{truncateText(e.email, 30)}</p>
                    <p className="text-[11px] muted truncate">
                      {e.role || 'unknown role'} · {e.ip || 'ip n/a'}{e.reason ? ` · ${e.reason.replaceAll('_', ' ')}` : ''}
                    </p>
                  </div>
                  <StatusDot tone={e.outcome === 'SUCCESS' ? 'ok' : 'bad'} label={e.outcome === 'SUCCESS' ? 'Signed in' : 'Failed'} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
