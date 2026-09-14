import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Input, { PasswordInput } from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useDocumentTitle } from '../../hooks/index.js';
import { ApiError } from '../../services/api.js';

const INITIAL = {
  fullName: '',
  email: '',
  phone: '',
  district: '',
  state: '',
  walletAddress: '',
  password: '',
};

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined, form: undefined }));
  };

  function clientValidate() {
    const er = {};
    if (form.fullName.trim().length < 3) er.fullName = 'Enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) er.email = 'Enter a valid email address';
    if (form.phone && !/^[+\d][\d\s-]{6,18}$/.test(form.phone)) er.phone = 'Enter a valid phone number';
    if (!form.district.trim()) er.district = 'District is required';
    if (!form.state.trim()) er.state = 'State is required';
    if (form.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(form.walletAddress.trim())) er.walletAddress = 'Wallet address must be a valid 0x address';
    if (form.password.length < 8) er.password = 'Use at least 8 characters';
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
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        district: form.district.trim(),
        state: form.state.trim(),
        walletAddress: form.walletAddress.trim() || undefined,
        password: form.password,
      });
      setSuccess(true);
      toast.success('Account created. Welcome to Land Ledger.');
      navigate('/citizen', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details) setErrors(err.details);
        if (err.errorCode === 'EMAIL_TAKEN') setErrors((x) => ({ ...x, email: 'An account with this email already exists' }));
        setErrors((x) => ({ ...x, form: err.message }));
      } else {
        setErrors((x) => ({ ...x, form: 'Registration failed. Please try again.' }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background site-noise">
      {/* LEFT — brand narrative (stacks above the form on mobile, side-by-side on lg+) */}
      <section className="flex flex-col justify-between gap-8 sm:gap-10 p-6 sm:p-10 xl:p-14 bg-[rgb(var(--ll-secondary)/0.3)] border-b lg:border-b-0 lg:border-r border-border">
        <div className="flex items-center gap-3">
          <div className="brand-mark brand-mark-lg" aria-hidden="true" />
          <p className="font-display font-bold tracking-[0.05em] text-[17px]">LAND LEDGER</p>
        </div>
        <div className="max-w-md">
          <p className="section-kicker">Citizen registration</p>
          <h1 className="page-title text-[28px] sm:text-[42px] xl:text-[52px] mt-4 sm:mt-5">
            Bring every property record into one clear view.
          </h1>
          <p className="muted text-[14px] sm:text-[15px] leading-relaxed mt-4 sm:mt-6">
            Create your account to access holdings, submit supporting records, and initiate verified ownership transfers.
          </p>
        </div>
        <p className="text-[13.5px] muted">
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </p>
      </section>

      {/* RIGHT — form */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[600px]">
          <p className="kicker-number">
            <span className="num">01</span> Your details
          </p>
          <h2 className="page-title text-[30px] mt-3">Create citizen account</h2>

          <form className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5" onSubmit={onSubmit} noValidate>
            {errors.form ? (
              <div className="sm:col-span-2 rounded border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] px-3.5 py-2.5 text-[13px] font-semibold text-destructive" role="alert">
                {errors.form}
              </div>
            ) : null}
            <Input label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
            <Input label="Email address" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
            <Input label="Phone number" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
            <Input label="District" value={form.district} onChange={set('district')} error={errors.district} required />
            <Input label="State" value={form.state} onChange={set('state')} error={errors.state} required />
            <Input
              label="Wallet address"
              placeholder="0x…"
              value={form.walletAddress}
              onChange={set('walletAddress')}
              error={errors.walletAddress}
              help="Used for ledger-backed ownership settlement."
            />
            <div className="sm:col-span-2 sm:max-w-[280px]">
              <PasswordInput
                label="Password"
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                error={errors.password}
                help="Use at least 8 characters."
                required
              />
            </div>
            <div className="sm:col-span-2 mt-1">
              <Button type="submit" size="lg" loading={submitting} iconRight={ArrowRight} disabled={success}>
                Create account
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
