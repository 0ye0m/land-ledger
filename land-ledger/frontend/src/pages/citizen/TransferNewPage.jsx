import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, SearchCheck, AlertTriangle } from 'lucide-react';
import { propertyService, transferService, fraudService } from '../../services';
import { useApi, useDocumentTitle, hashOf } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import Input, { Select, Textarea } from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { RiskBadge } from '../../components/registry/Badges.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { buildQuery } from '../../utils/format.js';

export default function TransferNewPage() {
  useDocumentTitle('New transfer');
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ propertyId: '', buyerEmail: '', requestDetails: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const [checking, setChecking] = useState(false);

  const ownedQuery = useMemo(() => buildQuery({ status: 'REGISTERED', pageSize: 50 }), []);
  const { data, loading } = useApi(() => propertyService.list(ownedQuery), [ownedQuery]);
  const owned = (data?.data?.properties || []).filter((p) => p.current_owner_id && p.status === 'REGISTERED');

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined, form: undefined, checks: undefined }));
  };

  async function runPreCheck() {
    if (!form.propertyId || !form.buyerEmail) {
      setErrors({ propertyId: !form.propertyId ? 'Select the property' : undefined, buyerEmail: !form.buyerEmail ? "Enter the buyer's email" : undefined });
      return;
    }
    setChecking(true);
    setErrors({});
    try {
      const res = await fraudService.check({ propertyId: form.propertyId, buyerEmail: form.buyerEmail });
      setPreflight(res.data);
      setStep(2);
    } catch (err) {
      setErrors((x) => ({ ...x, form: err.message, checks: err.details?.reasons }));
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit() {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await transferService.create(form);
      toast.success(res.message);
      navigate(`/citizen/transfers/${res.data.transfer.transfer_reference}`, { replace: true });
    } catch (err) {
      setErrors((x) => ({ ...x, form: err.message, checks: err.details?.reasons }));
      if (err.details?.checksPerformed) setPreflight({ isFraudulent: true, riskLevel: 'HIGH', reasons: err.details.reasons, checksPerformed: err.details.checksPerformed });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedProperty = owned.find((p) => p.property_id === form.propertyId || p.id === form.propertyId);

  return (
    <div className="max-w-3xl fade-up">
      <PageHeader
        kicker="New ownership transfer"
        number="01"
        title="Initiate a transfer."
        description="The registry validates ownership, duplicates, document integrity and fraud rules before the registrar reviews your request."
      />

      <div className="registry-panel mt-6 p-5 sm:p-6 flex flex-col gap-5">
        {errors.form ? (
          <div className="rounded border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] px-3.5 py-3 text-[13px] font-semibold text-destructive flex items-start gap-2" role="alert">
            <AlertTriangle size={15} className="mt-0.5 flex-none" />
            <div>
              {errors.form}
              {errors.checks?.length ? (
                <ul className="list-disc ml-4 mt-1.5 space-y-0.5 font-normal">
                  {errors.checks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <Select
              label="Property to transfer"
              placeholder={loading ? 'Loading your registered properties…' : 'Select a registered property'}
              options={(owned || []).map((p) => ({ value: p.property_id, label: `${p.property_id} — ${p.title}` }))}
              value={form.propertyId}
              onChange={set('propertyId')}
              error={errors.propertyId}
              required
            />
            {owned.length === 0 && !loading ? (
              <p className="text-[13px] muted -mt-2">
                No registered properties available to transfer.{' '}
                <Link to="/citizen/properties/register" className="link">
                  Register one first
                </Link>
                .
              </p>
            ) : null}
            <Input label="Buyer's registered email" type="email" placeholder="buyer@example.com" value={form.buyerEmail} onChange={set('buyerEmail')} error={errors.buyerEmail} help="The buyer must hold a Land Ledger account with a wallet address." required />
            <Textarea label="Transfer details (optional)" rows={3} placeholder="Context for the registrar, e.g. sale agreement reference" value={form.requestDetails} onChange={set('requestDetails')} />

            {selectedProperty ? (
              <div className="rounded border border-border bg-muted/40 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px]">
                <div>
                  <p className="detail-label">Owner</p>
                  <p className="font-semibold">{selectedProperty.current_owner_name}</p>
                </div>
                <div>
                  <p className="detail-label">Area</p>
                  <p className="font-semibold">{Number(selectedProperty.area_value).toLocaleString('en-IN')} {selectedProperty.area_unit}</p>
                </div>
                <div>
                  <p className="detail-label">Documents</p>
                  <p className="font-semibold">{selectedProperty.document_count} attached</p>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button icon={SearchCheck} onClick={runPreCheck} loading={checking} disabled={!owned.length}>
                Run registry checks
              </Button>
            </div>
          </>
        ) : (
          <>
            <SectionKicker>02 · Fraud & conflict results</SectionKicker>
            {preflight ? (
              <div className={`rounded border px-4 py-3.5 ${preflight.isFraudulent ? 'border-destructive/40 bg-[rgb(var(--ll-destructive-soft))]' : preflight.riskLevel === 'MEDIUM' ? 'border-[rgb(var(--ll-warn)/0.4)] bg-[rgb(var(--ll-warn-soft))]' : 'border-[rgb(var(--ll-accent)/0.5)] bg-[rgb(var(--ll-accent-soft))]'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-bold text-[14px]">
                    {preflight.isFraudulent ? 'Blocking conflicts detected' : `Pre-checks clear · ${preflight.riskLevel} risk`}
                  </p>
                  <RiskBadge risk={preflight.riskLevel} />
                </div>
                {preflight.reasons.length > 0 ? (
                  <ul className="list-disc ml-4 mt-2 space-y-1 text-[12.5px]">
                    {preflight.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] mt-1">All deterministic ownership and conflict checks passed. The request will be queued for registrar review.</p>
                )}
              </div>
            ) : null}

            <div className="detail-grid">
              <div className="detail-cell">
                <p className="detail-label">Property</p>
                <p className="detail-value font-mono text-[12.5px]">{selectedProperty?.property_id}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Buyer</p>
                <p className="detail-value">{form.buyerEmail}</p>
              </div>
              <div className="detail-cell">
                <p className="detail-label">Risk level</p>
                <p className="detail-value">{preflight?.riskLevel}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2.5">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back to details
              </Button>
              <Button iconRight={ArrowRight} onClick={onSubmit} loading={submitting}>
                Submit for registrar review
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="text-[12px] muted mt-4 leading-relaxed">
        Ownership changes only after registrar approval <strong>and</strong> a confirmed blockchain transaction. The transfer shows a real
        transaction hash once settled — never a fabricated one.
      </p>
    </div>
  );
}
