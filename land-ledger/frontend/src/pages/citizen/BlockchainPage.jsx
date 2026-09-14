import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, ExternalLink } from 'lucide-react';
import { blockchainService } from '../../services';
import { useApi, useDocumentTitle, hashOf } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import DataTable from '../../components/registry/DataTable.jsx';
import { StatusBadge, OperationBadge, HashChip } from '../../components/registry/Badges.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { Pagination } from '../../components/registry/Filters.jsx';
import { formatDate } from '../../utils/format.js';

export default function BlockchainPage() {
  useDocumentTitle('Ledger records');
  const [page, setPage] = useState(1);
  const [op, setOp] = useState('');

  const query = useMemo(() => ({ page, pageSize: 10, operation: op || undefined }), [hashOf({ page, op })]);
  const { data, loading, error, refetch } = useApi(() => blockchainService.transactions(query), [query]);
  const txs = data?.data?.transactions || [];
  const network = data?.data?.network;

  const columns = [
    { key: 'property_id', header: 'Property', render: (t) => <span className="font-mono text-[12px] font-semibold">{t.property_id || '—'}</span> },
    { key: 'operation', header: 'Operation', render: (t) => <OperationBadge operation={t.operation} /> },
    {
      key: 'hash',
      header: 'Transaction hash',
      render: (t) =>
        t.status === 'CONFIRMED' ? (
          <HashChip hash={t.transaction_hash} />
        ) : (
          <span className="text-[12px] text-destructive font-semibold">failed — {truncate(t.error_message)}</span>
        ),
    },
    { key: 'block_number', header: 'Block', render: (t) => <span className="num">{t.block_number ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status === 'CONFIRMED' ? 'COMPLETED' : 'FAILED'} /> },
    { key: 'timestamp', header: 'Timestamp', render: (t) => <span className="text-[12px] muted">{formatDate(t.timestamp, { withTime: true })}</span> },
  ];

  function truncate(s) {
    return (s || 'unknown error').slice(0, 60);
  }

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Blockchain records"
        title="Ledger records."
        description="On-chain activity associated with properties you own or submitted. Hashes are real and independently verifiable on the local network."
      />

      {/* Network summary */}
      <section>
        <SectionKicker>Network</SectionKicker>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-3">
          <MetricBlock label="Network" value={network?.available ? 'Hardhat' : 'Unavailable'} tone={network?.available ? 'primary' : 'bad'} />
          <MetricBlock label="Connection" value={network?.available ? 'Online' : 'Offline'} tone={network?.available ? 'ok' : 'bad'} />
          <MetricBlock label="Latest block" value={network?.latestBlock ?? '—'} />
          <MetricBlock label="Contract" value={network?.contractAddress ? `${network.contractAddress.slice(0, 8)}…${network.contractAddress.slice(-6)}` : '—'} />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          { v: '', label: 'All operations' },
          { v: 'PROPERTY_REGISTER', label: 'Registrations' },
          { v: 'OWNERSHIP_TRANSFER', label: 'Transfers' },
        ].map((b) => (
          <button
            key={b.v}
            onClick={() => {
              setOp(b.v);
              setPage(1);
            }}
            className={`btn btn-sm ${op === b.v ? 'btn-primary' : 'btn-secondary'}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Reading ledger records…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={txs}
            empty={
              <EmptyState
                title="No blockchain transactions"
                message="Transactions appear after registrar approval triggers an on-chain registration or transfer."
                icon={Boxes}
                action={() => (
                  <Link to="/citizen/properties/register" className="btn btn-secondary btn-sm">
                    Register a property
                  </Link>
                )}
              />
            }
          />
          <Pagination page={page} pageSize={10} total={data?.data?.total} onPage={setPage} />
        </>
      )}

      <p className="text-[12px] muted flex items-center gap-1.5">
        <ExternalLink size={12} /> Transaction hashes reference the local Hardhat network (chain 31337).
      </p>
    </div>
  );
}
