import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Input, { PasswordInput } from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useDocumentTitle } from '../../hooks/index.js';
import { ApiError } from '../../services/api.js';
import { DEMO_ACCOUNTS } from '../../utils/constants.js';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined, form: undefined }));
  };

  function clientValidate() {
    const er = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) er.email = 'Enter a valid email address';
    if (!form.password) er.password = 'Password is required';
    return er;
  }

  async function doLogin(credentials) {
    setSubmitting(true);
    setErrors({});
    try {
      const user = await login(credentials);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}.`);
      const dest = location.state?.from || (user.role === 'registrar' ? '/registrar' : '/citizen');
      navigate(dest, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setErrors((er) => ({ ...er, form: err.message }));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const er = clientValidate();
    if (Object.keys(er).length) {
      setErrors(er);
      return;
    }
    doLogin({ email: form.email.trim(), password: form.password });
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
          <p className="section-kicker">Secure registry access</p>
          <h1 className="page-title text-[28px] sm:text-[42px] xl:text-[52px] mt-4 sm:mt-5">
            Ownership records you can trace and trust.
          </h1>
          <p className="muted text-[14px] sm:text-[15px] leading-relaxed mt-4 sm:mt-6">
            Review property records, verify document integrity, and follow every ownership transfer from submission to settlement.
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
          <ShieldCheck size={16} className="text-[rgb(var(--ll-accent))]" /> Protected role-based access
        </p>
      </section>

      {/* RIGHT — form */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[460px]">
          <p className="kicker-number">
            <span className="num">01</span> Account access
          </p>
          <h2 className="page-title text-[30px] mt-3">Welcome back</h2>
          <p className="muted text-[13.5px] mt-2">Enter your registered account details.</p>

          <form className="mt-8 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
            {errors.form ? (
              <div className="rounded border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] px-3.5 py-2.5 text-[13px] font-semibold text-destructive" role="alert">
                {errors.form}
              </div>
            ) : null}
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={set('email')}
              error={errors.email}
              required
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={set('password')}
              error={errors.password}
              required
            />
            <Button type="submit" block size="lg" loading={submitting} iconRight={ArrowRight}>
              Sign in
            </Button>
          </form>

          <div className="flex items-center gap-3 my-7" aria-hidden="true">
            <span className="divider-h flex-1" />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">Preview an account</p>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" size="sm" disabled={submitting} onClick={() => doLogin(DEMO_ACCOUNTS.citizen)}>
              Citizen
            </Button>
            <Button variant="secondary" size="sm" disabled={submitting} onClick={() => doLogin(DEMO_ACCOUNTS.registrar)}>
              Registrar
            </Button>
          </div>

          <p className="text-[13.5px] mt-8 muted">
            New to Land Ledger?{' '}
            <Link to="/register" className="link">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
