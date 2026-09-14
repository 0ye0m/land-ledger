import { Link } from 'react-router-dom';
import { Landmark, ArrowRightLeft, CheckCircle2, FileClock, Plus, ArrowRight, Boxes } from 'lucide-react';
import { userService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import { StatusBadge, HashChip } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { timeAgo, truncateText } from '../../utils/format.js';

export default function CitizenDashboard() {
  useDocumentTitle('Overview');
  const { data, loading, error, refetch } = useApi(() => userService.dashboard());

  if (loading) return <LoadingState label="Loading your registry overview…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { metrics, recentProperties, recentTransfers, documents, chainActivity } = data.data;

  return (
    <div className="flex flex-col gap-7 fade-up">
      <PageHeader
        kicker="Registry overview"
        title="Your property registry."
        description="Holdings, verification activity and transfer progress in one accountable view."
        actions={
          <>
            <Link to="/citizen/properties/register" className="btn btn-primary btn-sm sm:btn">
              <Plus size={15} /> Register property
            </Link>
            <Link to="/citizen/transfers/new" className="btn btn-secondary btn-sm sm:btn">
              New transfer <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricBlock label="Owned properties" value={metrics.owned_properties} icon={Landmark} tone="primary" />
        <MetricBlock label="Pending transfers" value={metrics.pending_transfers} icon={ArrowRightLeft} tone={metrics.pending_transfers > 0 ? 'warn' : 'default'} />
        <MetricBlock label="Completed transfers" value={metrics.completed_transfers} icon={CheckCircle2} tone="ok" />
        <MetricBlock label="Docs awaiting verification" value={metrics.documents_awaiting} icon={FileClock} tone={metrics.documents_awaiting > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent properties */}
        <section className="registry-panel">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px]">Recent properties</h2>
            <Link to="/citizen/properties" className="text-[12.5px] link">
              View all
            </Link>
          </header>
          {recentProperties.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="muted text-[13px]">No properties found.</p>
              <Link to="/citizen/properties/register" className="btn btn-secondary btn-sm mt-3">
                Register your first property
              </Link>
            </div>
          ) : (
            <ul>
              {recentProperties.map((p) => (
                <li key={p.id} className="px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
                  <Link to={`/citizen/properties/${p.property_id}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[13.5px] truncate">{p.title}</p>
                      <p className="text-[11.5px] muted font-mono mt-0.5">
                        {p.property_id} · {p.city}, {p.state}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 flex-none">
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent transfer activity */}
        <section className="registry-panel">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px]">Recent transfer activity</h2>
            <Link to="/citizen/transfers" className="text-[12.5px] link">
              View all
            </Link>
          </header>
          {recentTransfers.length === 0 ? (
            <EmptyState title="No pending transfers" message="Transfer requests you initiate or receive will appear here." icon={ArrowRightLeft} />
          ) : (
            <ul>
              {recentTransfers.map((t) => (
                <li key={t.id} className="px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
                  <Link to={`/citizen/transfers/${t.transfer_reference}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[13.5px] truncate font-mono text-[12.5px]">{t.transfer_reference}</p>
                      <p className="text-[11.5px] muted mt-0.5 truncate">
                        {t.property_business_id} · {t.seller_name} → {t.buyer_name} · {timeAgo(t.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Document verification */}
        <section className="registry-panel">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px]">Document verification</h2>
            <Link to="/citizen/documents" className="text-[12.5px] link">
              View all
            </Link>
          </header>
          {documents.length === 0 ? (
            <EmptyState title="No documents uploaded" message="Attach title deeds and survey records to your properties." icon={FileClock} />
          ) : (
            <ul>
              {documents.map((d) => (
                <li key={d.id} className="px-5 py-3 border-b border-border last:border-b-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] truncate">{truncateText(d.file_name, 40)}</p>
                    <p className="text-[11px] muted font-mono mt-0.5">{d.property_business_id}</p>
                  </div>
                  <StatusBadge status={d.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent blockchain activity */}
        <section className="registry-panel">
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-display font-bold text-[15px]">Recent blockchain activity</h2>
            <Link to="/citizen/blockchain" className="text-[12.5px] link">
              View all
            </Link>
          </header>
          {chainActivity.length === 0 ? (
            <EmptyState
              title="No ledger records yet"
              message="Confirmed registrations and settlements appear here with their transaction hashes."
              icon={Boxes}
            />
          ) : (
            <ul>
              {chainActivity.map((tx) => (
                <li key={tx.id} className="px-5 py-3 border-b border-border last:border-b-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[12.5px]">
                      {tx.operation === 'OWNERSHIP_TRANSFER' ? 'Ownership transfer' : 'Property registration'} ·{' '}
                      <span className="font-mono text-[11.5px] muted">{tx.property_id || '—'}</span>
                    </p>
                    <p className="mt-1">
                      <HashChip hash={tx.status === 'CONFIRMED' ? tx.transaction_hash : `failed · ${tx.error_message || 'error'}`} />
                    </p>
                  </div>
                  <StatusBadge status={tx.status === 'CONFIRMED' ? 'COMPLETED' : 'FAILED'} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-[12px] muted flex items-center gap-2">
        <SectionKicker>Traceable by design</SectionKicker> Every action in this registry is written to the audit trail.
      </p>
    </div>
  );
}
