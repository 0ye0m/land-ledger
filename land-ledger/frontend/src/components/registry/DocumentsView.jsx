import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, RefreshCw, Download, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { documentService } from '../../services';
import { useApi, useDocumentTitle, hashOf, useDebounced } from '../../hooks/index.js';
import PageHeader from '../../components/registry/PageHeader.jsx';
import DataTable from '../../components/registry/DataTable.jsx';
import { StatusBadge, HashChip } from '../../components/registry/Badges.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/registry/States.jsx';
import { SearchBar, FilterSelect, Pagination } from '../../components/registry/Filters.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { formatDate, formatFileSize, buildQuery, truncateText } from '../../utils/format.js';
import { DOCUMENT_TYPES } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * Document registry (shared citizen/registrar).
 * role: 'citizen' | 'registrar'
 */
export default function DocumentsView({ role }) {
  useDocumentTitle('Documents');
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounced(keyword);
  const [status, setStatus] = useState('');
  const [docType, setDocType] = useState('');
  const [page, setPage] = useState(1);
  const [detailDoc, setDetailDoc] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  const query = useMemo(() => buildQuery({ keyword: debouncedKeyword, status, documentType: docType, page, pageSize: 10 }), [hashOf({ debouncedKeyword, status, docType, page })]);
  const { data, loading, error, refetch } = useApi(() => documentService.list(query), [query]);
  const docs = data?.data?.documents || [];
  const isRegistrar = role === 'registrar';

  async function checkIntegrity(doc) {
    setBusyId(doc.id);
    try {
      const res = await documentService.verifyIntegrity(doc.id);
      if (res.data.intact) toast.success(`Integrity verified — SHA-256 fingerprints match`);
      else toast.error(`Hash mismatch detected for ${truncateText(doc.file_name, 26)}`);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function registrarVerify(doc, outcome) {
    setVerifyingId(doc.id);
    try {
      const res = await documentService.verify(doc.id, outcome);
      toast.success(res.message);
      refetch();
      setDetailDoc(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setVerifyingId(null);
    }
  }

  const columns = [
    {
      key: 'file_name',
      header: 'Document',
      render: (d) => (
        <button className="text-left" onClick={() => setDetailDoc(d)}>
          <p className="font-semibold truncate max-w-[220px] hover:text-primary transition-colors">{d.file_name}</p>
          <p className="text-[11px] muted">{formatFileSize(d.file_size)} · {formatDate(d.created_at)}</p>
        </button>
      ),
    },
    {
      key: 'property',
      header: 'Property',
      render: (d) => (
        <Link to={isRegistrar ? `/registrar/properties/${d.property_business_id}` : `/citizen/properties/${d.property_business_id}`} className="link font-mono text-[12px]">
          {d.property_business_id}
        </Link>
      ),
    },
    { key: 'document_type', header: 'Type', render: (d) => <span className="text-[12.5px]">{DOCUMENT_TYPES.find((t) => t.value === d.document_type)?.label || d.document_type}</span> },
    { key: 'hash', header: 'Hash status', render: (d) => <HashChip hash={d.sha256_hash} /> },
    { key: 'verification_status', header: 'Verification', render: (d) => <StatusBadge status={d.verification_status} /> },
    { key: 'uploaded_by_name', header: 'Uploaded by', render: (d) => <span className="text-[12.5px]">{d.uploaded_by_name || '—'}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => (
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" icon={RefreshCw} loading={busyId === d.id} onClick={() => checkIntegrity(d)} title="Re-check SHA-256 integrity">
            Re-check
          </Button>
          <a className="btn btn-ghost btn-sm" href={documentService.downloadUrl(d.id)} target="_blank" rel="noreferrer" title="Download">
            <Download size={13} />
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 fade-up">
      <PageHeader
        kicker="Document registry"
        title="Documents."
        description="Every upload carries a SHA-256 fingerprint. Re-check integrity at any time — modifications are detected instantly."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar
          value={keyword}
          onChange={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          placeholder="Search by file or property…"
        />
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: 'PENDING', label: 'Pending' },
              { value: 'VERIFIED', label: 'Verified' },
              { value: 'TAMPERED', label: 'Tampered' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
            placeholder="All verification"
            ariaLabel="Filter by verification status"
          />
          <FilterSelect
            value={docType}
            onChange={(v) => {
              setDocType(v);
              setPage(1);
            }}
            options={DOCUMENT_TYPES}
            placeholder="All types"
            ariaLabel="Filter by document type"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading document registry…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={docs}
            empty={
              <EmptyState
                title="No documents found"
                message="Documents uploaded against your property records will appear in this registry."
                icon={FileText}
              />
            }
          />
          <Pagination page={page} pageSize={10} total={data?.data?.total} onPage={setPage} />
        </>
      )}

      {/* Document detail modal */}
      <Modal
        open={Boolean(detailDoc)}
        onClose={() => setDetailDoc(null)}
        title={detailDoc?.file_name || 'Document'}
        kicker="Document record"
        width="max-w-xl"
        footer={
          detailDoc && isRegistrar && detailDoc.verification_status === 'PENDING' ? (
            <>
              <Button variant="destructive" icon={XCircle} loading={verifyingId === detailDoc.id} onClick={() => registrarVerify(detailDoc, 'REJECTED')}>
                Reject
              </Button>
              <Button icon={CheckCircle2} loading={verifyingId === detailDoc.id} onClick={() => registrarVerify(detailDoc, 'VERIFIED')}>
                Mark verified
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setDetailDoc(null)}>
              Close
            </Button>
          )
        }
      >
        {detailDoc ? (
          <div className="flex flex-col gap-4">
            <div className="detail-grid">
              <div className="detail-cell">
                <p className="detail-label">Property</p>
                <p className="detail-value font-mono text-[12.5px]">{detailDoc.property_business_id}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Type</p>
                <p className="detail-value">{DOCUMENT_TYPES.find((t) => t.value === detailDoc.document_type)?.label}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Size</p>
                <p className="detail-value">{formatFileSize(detailDoc.file_size)}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Uploaded</p>
                <p className="detail-value">{formatDate(detailDoc.created_at, { withTime: true })}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Uploaded by</p>
                <p className="detail-value">{detailDoc.uploaded_by_name || '—'}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Verification</p>
                <p className="detail-value">
                  <StatusBadge status={detailDoc.verification_status} />
                </p>
              </div>
              {detailDoc.verified_by_name ? (
                <>
                  <div className="detail-cell">
                    <p className="detail-label">Verified by</p>
                    <p className="detail-value">{detailDoc.verified_by_name}</p>
                  </div>
                  <div className="detail-cell">
                    <p className="detail-label">Verified at</p>
                    <p className="detail-value">{formatDate(detailDoc.verified_at, { withTime: true })}</p>
                  </div>
                </>
              ) : null}
              <div className="detail-cell sm:col-span-2 lg:col-span-3 !border-r-0 !border-b-0">
                <p className="detail-label">SHA-256 fingerprint</p>
                <p className="font-mono text-[11.5px] break-all text-foreground/85">{detailDoc.sha256_hash}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded border border-border bg-muted/40 px-3.5 py-3">
              <ShieldCheck size={15} className="mt-0.5 flex-none text-muted-foreground" />
              <p className="text-[12px] muted leading-relaxed">
                The hash verifies file integrity relative to the stored fingerprint — it is not by itself proof of legal authenticity. Registrar
                verification remains part of the workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" icon={RefreshCw} loading={busyId === detailDoc.id} onClick={() => checkIntegrity(detailDoc)}>
                Verify integrity now
              </Button>
              <a className="btn btn-secondary btn-sm" href={documentService.downloadUrl(detailDoc.id)} target="_blank" rel="noreferrer">
                <Download size={13} /> Download
              </a>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
