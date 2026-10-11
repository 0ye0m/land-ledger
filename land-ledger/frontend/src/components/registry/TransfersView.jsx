import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { transferService } from '../../services';
import { useApi, useDocumentTitle, hashOf, useDebounced } from '../../hooks/index.js';
import PageHeader from '../../components/registry/PageHeader.jsx';
import DataTable from '../../components/registry/DataTable.jsx';
import { StatusBadge, RiskBadge } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { SearchBar, FilterSelect, Pagination } from '../../components/registry/Filters.jsx';
import { formatDate, buildQuery } from '../../utils/format.js';

/**
 * Transfer registry (shared). role: 'citizen' | 'registrar'
 */
export default function TransfersView({ role }) {
  useDocumentTitle('Transfers');
  const navigate = useNavigate();
  // Deep-link support: /registrar/transfers?risk=HIGH opens pre-filtered.
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounced(keyword);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [risk, setRisk] = useState(searchParams.get('risk') || '');
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => buildQuery({ propertyId: debouncedKeyword, status, risk, page, pageSize: 10 }),
    [hashOf({ debouncedKeyword, status, risk, page })]
  );
  const { data, loading, error, refetch } = useApi(() => transferService.list(query), [query]);
  const rows = data?.data?.transfers || [];
  const isRegistrar = role === 'registrar';

  const columns = [
    { key: 'transfer_reference', header: 'Transfer ID', render: (t) => <span className="font-mono text-[12.5px] font-semibold">{t.transfer_reference}</span> },
    {
      key: 'property',
      header: 'Property',
      render: (t) => (
        <div className="max-w-[210px]">
          <p className="font-mono text-[12px] font-semibold">{t.property_business_id}</p>
          <p className="text-[11px] muted truncate">{t.property_title}</p>
        </div>
      ),
    },
    { key: 'from', header: 'From', render: (t) => <span className="text-[12.5px]">{t.seller_name || '—'}</span> },
    { key: 'to', header: 'To', render: (t) => <span className="text-[12.5px]">{t.buyer_name || '—'}</span> },
    { key: 'requested', header: 'Requested', render: (t) => <span className="text-[12px] muted">{formatDate(t.created_at)}</span> },
    { key: 'risk', header: 'Risk', render: (t) => <RiskBadge risk={t.risk_level} /> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (t) => (
        <Link to={isRegistrar ? `/registrar/transfers/${t.transfer_reference}` : `/citizen/transfers/${t.transfer_reference}`} className="btn btn-outline btn-sm">
          Open
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Ownership transfers"
        title="Transfers."
        description={
          isRegistrar
            ? 'Every request with its risk posture, fraud results and settlement progress.'
            : 'Transfer requests you have initiated or received, with live risk and settlement status.'
        }
        actions={
          role === 'citizen' ? (
            <Link to="/citizen/transfers/new" className="btn btn-primary btn-sm sm:btn">
              <Plus size={15} /> New transfer
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar
          value={keyword}
          onChange={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          placeholder="Search by property ID…"
        />
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={['CONSENT_PENDING', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED']}
            placeholder="All statuses"
            ariaLabel="Filter by status"
          />
          <FilterSelect
            value={risk}
            onChange={(v) => {
              setRisk(v);
              setPage(1);
            }}
            options={['LOW', 'MEDIUM', 'HIGH']}
            placeholder="All risk"
            ariaLabel="Filter by risk"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading transfer requests…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            onRowClick={(t) => navigate(isRegistrar ? `/registrar/transfers/${t.transfer_reference}` : `/citizen/transfers/${t.transfer_reference}`)}
            empty={
              <EmptyState
                title="No transfers found"
                message={role === 'citizen' ? 'Initiate a transfer from any registered property you own.' : 'No transfer requests match the current filters.'}
                icon={ArrowRightLeft}
              />
            }
          />
          <Pagination page={page} pageSize={10} total={data?.data?.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
