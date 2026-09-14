import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Landmark } from 'lucide-react';
import { propertyService } from '../../services';
import { useApi, useDocumentTitle, hashOf } from '../../hooks/index.js';
import PageHeader from '../../components/registry/PageHeader.jsx';
import DataTable from '../../components/registry/DataTable.jsx';
import { StatusBadge } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { SearchBar, FilterSelect, Pagination } from '../../components/registry/Filters.jsx';
import { formatDate, formatArea, buildQuery } from '../../utils/format.js';
import { PROPERTY_TYPES } from '../../utils/constants.js';

const STATUS_OPTIONS = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'REGISTERED', label: 'Registered' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function PropertiesPage() {
  useDocumentTitle('Properties');
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [page, setPage] = useState(1);

  const query = useMemo(() => buildQuery({ keyword, status, propertyType, page, pageSize: 10 }), [hashOf({ keyword, status, propertyType, page })]);
  const { data, loading, error, refetch } = useApi(() => propertyService.list(query), [query]);

  const properties = data?.data?.properties || [];

  const columns = [
    {
      key: 'property_id',
      header: 'Property ID',
      render: (p) => (
        <div>
          <p className="font-mono text-[12.5px] font-semibold">{p.property_id}</p>
          <p className="text-[11px] muted">{p.reference_number}</p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Location',
      render: (p) => (
        <div className="max-w-[240px]">
          <p className="font-semibold truncate">{p.title}</p>
          <p className="text-[11.5px] muted truncate">
            {p.city}, {p.district}, {p.state}
          </p>
        </div>
      ),
    },
    { key: 'property_type', header: 'Type', render: (p) => <span className="text-[12.5px]">{PROPERTY_TYPES.find((t) => t.value === p.property_type)?.label || p.property_type}</span> },
    { key: 'area', header: 'Area', render: (p) => formatArea(p.area_value, p.area_unit) },
    { key: 'current_owner_name', header: 'Current owner', render: (p) => p.current_owner_name || '—' },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'updated_at', header: 'Updated', render: (p) => <span className="text-[12px] muted">{formatDate(p.updated_at)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <Link to={`/citizen/properties/${p.property_id}`} className="btn btn-outline btn-sm" onClick={(e) => e.stopPropagation()}>
          Open
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Property registry"
        title="Properties."
        description="Search the registry, review holdings and open any record for full detail."
        actions={
          <Link to="/citizen/properties/register" className="btn btn-primary btn-sm sm:btn">
            <Plus size={15} /> Register property
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar
          value={keyword}
          onChange={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          placeholder="Search by ID, reference, owner, city…"
          onSubmit={() => refetch()}
        />
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            ariaLabel="Filter by status"
          />
          <FilterSelect
            value={propertyType}
            onChange={(v) => {
              setPropertyType(v);
              setPage(1);
            }}
            options={PROPERTY_TYPES}
            placeholder="All types"
            ariaLabel="Filter by property type"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Searching the registry…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={properties}
            onRowClick={(p) => navigate(`/citizen/properties/${p.property_id}`)}
            empty={
              <EmptyState
                title="No properties found"
                message={keyword || status || propertyType ? 'No records match the current filters. Adjust the search and try again.' : 'Register your first property to begin building your verified holdings.'}
                icon={Landmark}
                actionLabel="empty-action"
                action={() => (
                  <Link to="/citizen/properties/register" className="btn btn-primary btn-sm">
                    <Plus size={14} /> Register property
                  </Link>
                )}
              />
            }
          />
          <Pagination page={page} pageSize={10} total={data?.data?.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
