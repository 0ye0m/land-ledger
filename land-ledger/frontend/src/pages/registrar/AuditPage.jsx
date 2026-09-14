import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { registrarService } from '../../services';
import { useApi, useDocumentTitle, hashOf } from '../../hooks/index.js';
import PageHeader from '../../components/registry/PageHeader.jsx';
import DataTable from '../../components/registry/DataTable.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { FilterSelect, Pagination } from '../../components/registry/Filters.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { formatDate, buildQuery } from '../../utils/format.js';

const ACTIONS = [
  'USER_REGISTER', 'USER_LOGIN', 'USER_LOGIN_FAILED', 'PROPERTY_CREATE', 'PROPERTY_UPDATE', 'PROPERTY_APPROVE',
  'PROPERTY_REJECT', 'PROPERTY_REGISTERED', 'DOCUMENT_UPLOAD', 'DOCUMENT_VERIFY', 'DOCUMENT_HASH_CHECK',
  'TRANSFER_CREATE', 'FRAUD_CHECK', 'TRANSFER_APPROVE', 'TRANSFER_REJECT', 'BLOCKCHAIN_TX', 'BLOCKCHAIN_TX_FAILED',
  'OWNERSHIP_CHANGE', 'PROFILE_UPDATE', 'PASSWORD_CHANGE', 'DOCUMENT_DOWNLOAD',
];

const ENTITY_TYPES = ['user', 'property', 'document', 'transfer', 'blockchain'];

export default function AuditPage() {
  useDocumentTitle('Audit log');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [selected, setSelected] = useState(null);

  const query = useMemo(() => buildQuery({ page, pageSize: 20, action, entityType }), [hashOf({ page, action, entityType })]);
  const { data, loading, error, refetch } = useApi(() => registrarService.auditLogs(query), [query]);
  const logs = data?.data?.logs || [];

  const columns = [
    { key: 'timestamp', header: 'Timestamp', render: (l) => <span className="text-[12px] muted whitespace-nowrap">{formatDate(l.created_at, { withTime: true })}</span> },
    { key: 'actor', header: 'Actor', render: (l) => <span className="font-semibold text-[12.5px]">{l.actor_name || 'system'}</span> },
    { key: 'role', header: 'Role', render: (l) => <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{l.actor_role || 'system'}</span> },
    { key: 'action', header: 'Action', render: (l) => <span className="font-mono text-[11.5px] font-semibold">{l.action}</span> },
    { key: 'entity_type', header: 'Entity', render: (l) => <span className="text-[12px] capitalize">{l.entity_type}</span> },
    {
      key: 'entity_id',
      header: 'Entity ID',
      render: (l) => (
        <button className="font-mono text-[11.5px] link truncate max-w-[140px] block text-left" onClick={() => setSelected(l)} title="Inspect metadata">
          {l.entity_id ? `${String(l.entity_id).slice(0, 22)}${String(l.entity_id).length > 22 ? '…' : ''}` : '—'}
        </button>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (l) => (
        <span className={`status-badge ${l.result === 'SUCCESS' ? 'text-[rgb(var(--ll-accent-foreground))] border-[rgb(var(--ll-accent)/0.4)] bg-[rgb(var(--ll-accent-soft))]' : 'text-destructive border-destructive/40 bg-[rgb(var(--ll-destructive-soft))]'}`}>
          {l.result}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader kicker="Chronological event register" title="Audit log." description="Every consequential action in the registry, with actor, entity and outcome. Credentials are never logged." />

      <div className="flex flex-wrap gap-2">
        <FilterSelect value={action} onChange={(v) => { setAction(v); setPage(1); }} options={ACTIONS.map((a) => ({ value: a, label: a.replaceAll('_', ' ') }))} placeholder="All actions" ariaLabel="Filter by action" />
        <FilterSelect value={entityType} onChange={(v) => { setEntityType(v); setPage(1); }} options={ENTITY_TYPES} placeholder="All entities" ariaLabel="Filter by entity" />
      </div>

      {loading ? (
        <LoadingState label="Reading the event register…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={logs}
            empty={<EmptyState title="No audit entries" message="Registry events will appear here in chronological order." icon={ScrollText} />}
          />
          <Pagination page={page} pageSize={20} total={data?.data?.total} onPage={setPage} />
        </>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Audit entry" kicker={selected?.action} width="max-w-lg">
        {selected ? (
          <div className="detail-grid !grid-cols-1 min-[480px]:!grid-cols-2">
            <div className="detail-cell"><p className="detail-label">Timestamp</p><p className="detail-value">{formatDate(selected.created_at, { withTime: true })}</p></div>
            <div className="detail-cell"><p className="detail-label">Actor</p><p className="detail-value">{selected.actor_name || 'system'} {selected.actor_email ? `(${selected.actor_email})` : ''}</p></div>
            <div className="detail-cell"><p className="detail-label">Role</p><p className="detail-value">{selected.actor_role || 'system'}</p></div>
            <div className="detail-cell"><p className="detail-label">Result</p><p className="detail-value">{selected.result}</p></div>
            <div className="detail-cell"><p className="detail-label">Entity</p><p className="detail-value">{selected.entity_type}</p></div>
            <div className="detail-cell"><p className="detail-label">Entity ID</p><p className="detail-value font-mono text-[11.5px] break-all">{selected.entity_id || '—'}</p></div>
            {selected.metadata ? (
              <div className="detail-cell col-span-full">
                <p className="detail-label">Metadata</p>
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-muted/60 rounded p-3 border border-border overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
