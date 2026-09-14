import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { propertyService } from '../../services';
import { useDocumentTitle } from '../../hooks/index.js';
import PageHeader from '../../components/registry/PageHeader.jsx';
import Input, { Select, Textarea } from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PROPERTY_TYPES } from '../../utils/constants.js';

export default function PropertyRegisterPage() {
  useDocumentTitle('Register property');
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    addressLine: '',
    city: '',
    district: user?.district || '',
    state: user?.state || '',
    areaValue: '',
    areaUnit: 'sq ft',
    propertyType: '',
    description: '',
    ownerWallet: user?.walletAddress || '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined, form: undefined }));
  };

  function clientValidate() {
    const er = {};
    if (form.title.trim().length < 3) er.title = 'Give the property a clear reference or title';
    if (!form.addressLine.trim()) er.addressLine = 'Address is required';
    if (!form.city.trim()) er.city = 'City is required';
    if (!form.district.trim()) er.district = 'District is required';
    if (!form.state.trim()) er.state = 'State is required';
    if (!form.areaValue || Number(form.areaValue) <= 0) er.areaValue = 'Area must be a positive number';
    if (!form.propertyType) er.propertyType = 'Select the property type';
    if (form.ownerWallet && !/^0x[a-fA-F0-9]{40}$/.test(form.ownerWallet.trim())) er.ownerWallet = 'Wallet address must be a valid 0x address';
    return er;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const er = clientValidate();
    if (Object.keys(er).length) {
      setErrors(er);
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const res = await propertyService.create({
        ...form,
        areaValue: Number(form.areaValue),
        ownerWallet: form.ownerWallet.trim() || undefined,
      });
      toast.success('Property submitted for registrar review.');
      navigate(`/citizen/properties/${res.data.property.property_id}`, { replace: true });
    } catch (err) {
      if (err.details) setErrors(err.details);
      setErrors((x) => ({ ...x, form: err.message }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl fade-up">
      <PageHeader
        kicker="New registry entry"
        title="Register a property."
        description="Submitted records enter pending registrar review. After approval the record is registered on the ledger with your wallet."
      />

      <form className="registry-panel mt-6 p-5 sm:p-6 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        {errors.form ? (
          <div className="rounded border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] px-3.5 py-2.5 text-[13px] font-semibold text-destructive" role="alert">
            {errors.form}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
          <Input label="Property reference / title" placeholder="e.g. Survey 142/2, Koregaon Park" value={form.title} onChange={set('title')} error={errors.title} required className="sm:col-span-2" />
          <Input label="Address" placeholder="Street / survey number" value={form.addressLine} onChange={set('addressLine')} error={errors.addressLine} required className="sm:col-span-2" />
          <Input label="City" value={form.city} onChange={set('city')} error={errors.city} required />
          <Input label="District" value={form.district} onChange={set('district')} error={errors.district} required />
          <Input label="State" value={form.state} onChange={set('state')} error={errors.state} required />
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Input label="Area" type="number" min="0" step="0.01" value={form.areaValue} onChange={set('areaValue')} error={errors.areaValue} required />
            <Select label="Unit" options={['sq ft', 'sq m', 'acre']} value={form.areaUnit} onChange={set('areaUnit')} error={errors.areaUnit} />
          </div>
          <Select label="Property type" options={PROPERTY_TYPES} value={form.propertyType} onChange={set('propertyType')} error={errors.propertyType} required />
          <Input
            label="Wallet address"
            placeholder="0x…"
            value={form.ownerWallet}
            onChange={set('ownerWallet')}
            error={errors.ownerWallet}
            help="Used for ledger-backed ownership settlement."
          />
          <Textarea label="Description" rows={3} value={form.description} onChange={set('description')} error={errors.description} className="sm:col-span-2" />
        </div>

        <div className="flex items-start gap-2.5 rounded border border-[rgb(var(--ll-info)/0.4)] bg-[rgb(var(--ll-info-soft))] px-3.5 py-3">
          <Info size={15} className="text-[rgb(var(--ll-info))] mt-0.5 flex-none" />
          <p className="text-[12.5px] text-[rgb(var(--ll-info))] leading-relaxed">
            After submitting, attach supporting documents from the property detail page. A registrar reviews the evidence before the record is
            registered on the blockchain ledger.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={submitting} iconRight={ArrowRight}>
            Submit for review
          </Button>
        </div>
      </form>
    </div>
  );
}
