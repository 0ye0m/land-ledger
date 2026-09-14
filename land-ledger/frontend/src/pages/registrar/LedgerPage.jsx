import { useMemo, useState } from 'react';
import { Boxes, WifiOff } from 'lucide-react';
import { blockchainService } from '../../services';
import { useApi, useDocumentTitle, hashOf } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import DataTable from '../../components/registry/DataTable.jsx';
import { StatusBadge, OperationBadge, HashChip } from '../../components/registry/Badges.jsx';
import MetricBlock from '../../components/registry/MetricBlock.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { FilterSelect, Pagination } from '../../components/registry/Filters.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { formatDate, buildQuery } from '../../utils/format.js';

export default function LedgerPage() {
  useDocumentTitle('Blockchain ledger');
  const [page, setPage] = useState(1);
  const [operation, setOperation] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);

  const query = useMemo(() => buildQuery({ page, pageSize: 12, operation, status }), [hashOf({ page, operation, status })]);
  const { data, loading, error, refetch } = useApi(() => blockchainService.transactions(query), [query]);
  const txs = data?.data?.transactions || [];
  const net = data?.data?.network;

  const columns = [
    {
      key: 'tx',
      header: 'Transaction ID',
      render: (t) => (
        <button className="text-left" onClick={() => setSelected(t)}>
          <HashChip hash={t.transaction_hash} />
        </button>
      ),
    },
    { key: 'property_id', header: 'Property', render: (t) => <span className="font-mono text-[12px] font-semibold">{t.property_id || '—'}</span> },
    { key: 'operation', header: 'Operation', render: (t) => <OperationBadge operation={t.operation} /> },
    { key: 'from', header: 'Previous owner', render: (t) => <span className="font-mono text-[11px]">{t.from_address ? `${t.from_address.slice(0, 8)}…${t.from_address.slice(-6)}` : '—'}</span> },
    { key: 'to', header: 'New owner', render: (t) => <span className="font-mono text-[11px]">{t.to_address ? `${t.to_address.slice(0, 8)}…${t.to_address.slice(-6)}` : '—'}</span> },
    { key: 'block', header: 'Block', render: (t) => <span className="num">{t.block_number ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status === 'CONFIRMED' ? 'COMPLETED' : 'FAILED'} /> },
    { key: 'timestamp', header: 'Timestamp', render: (t) => <span className="text-[12px] muted">{formatDate(t.timestamp, { withTime: true })}</span> },
  ];

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader kicker="Ledger operations" title="Blockchain ledger." description="Append-only settlement record. Every entry is a real transaction observed on the local network." />

      {/* Network summary */}
      <SectionKicker>Network status</SectionKicker>
      {net && !net.available ? (
        <div className="rounded border border-[rgb(var(--ll-warn)/0.5)] bg-[rgb(var(--ll-warn-soft))] px-4 py-3.5 flex items-center gap-3">
          <WifiOff size={17} className="text-[rgb(var(--ll-warn))] flex-none" />
          <div>
            <p className="font-bold text-[13.5px] text-[rgb(var(--ll-warn))]">Blockchain unavailable</p>
            <p className="text-[12.5px] text-foreground/75 mt-0.5">
              The registry cannot reach the Hardhat node right now. Stored records remain visible below — no synchronization is faked.
            </p>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <MetricBlock label="Network" value={net?.available ? 'Hardhat' : 'Unavailable'} tone={net?.available ? 'primary' : 'bad'} />
        <MetricBlock label="Connection" value={net?.available ? 'Connected' : 'Offline'} tone={net?.available ? 'ok' : 'bad'} />
        <MetricBlock label="Latest block" value={net?.latestBlock ?? '—'} />
        <MetricBlock label="Contract" value={net?.contractAddress ? `${net.contractAddress.slice(0, 8)}…` : '—'} foot={net?.contractAddress} />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterSelect value={operation} onChange={(v) => { setOperation(v); setPage(1); }} options={['PROPERTY_REGISTER', 'OWNERSHIP_TRANSFER']} placeholder="All operations" ariaLabel="Filter operation" />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={['CONFIRMED', 'FAILED']} placeholder="All statuses" ariaLabel="Filter status" />
      </div>

      {loading ? (
        <LoadingState label="Reading the ledger…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={txs}
            empty={<EmptyState title="No blockchain transactions" message="Approved properties and transfers settle here with real transaction hashes." icon={Boxes} />}
          />
          <Pagination page={page} pageSize={12} total={data?.data?.total} onPage={setPage} />
        </>
      )}

      {/* Transaction detail */}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Transaction detail" kicker="Ledger record" width="max-w-xl">
        {selected ? (
          <div className="detail-grid !grid-cols-1 sm:!grid-cols-2">
            <div className="detail-cell col-span-full">
              <p className="detail-label">Hash</p>
              <p className="font-mono text-[11.5px] break-all">{selected.transaction_hash}</p>
            </div>
            <div className="detail-cell"><p className="detail-label">Block</p><p className="detail-value num">{selected.block_number ?? '—'}</p></div>
            <div className="detail-cell"><p className="detail-label">Timestamp</p><p className="detail-value">{formatDate(selected.timestamp, { withTime: true })}</p></div>
            <div className="detail-cell col-span-full">
              <p className="detail-label">Contract</p>
              <p className="font-mono text-[11.5px] break-all">{selected.contract_address || '—'}</p>
            </div>
            <div className="detail-cell"><p className="detail-label">Property</p><p className="detail-value font-mono text-[12px]">{selected.property_id || '—'}</p></div>
            <div className="detail-cell"><p className="detail-label">Operation</p><p className="detail-value"><OperationBadge operation={selected.operation} /></p></div>
            <div className="detail-cell">
              <p className="detail-label">Previous owner</p>
              <p className="font-mono text-[11px] break-all">{selected.from_address || '—'}</p>
            </div>
            <div className="detail-cell">
              <p className="detail-label">New owner</p>
              <p className="font-mono text-[11px] break-all">{selected.to_address || '—'}</p>
            </div>
            <div className="detail-cell"><p className="detail-label">Status</p><p className="detail-value"><StatusBadge status={selected.status === 'CONFIRMED' ? 'COMPLETED' : 'FAILED'} /></p></div>
            <div className="detail-cell"><p className="detail-label">Network</p><p className="detail-value">{selected.network}</p></div>
            {selected.error_message ? (
              <div className="detail-cell col-span-full bg-[rgb(var(--ll-destructive-soft)/0.5)]">
                <p className="detail-label">Error</p>
                <p className="text-[12.5px] text-destructive font-medium">{selected.error_message}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
