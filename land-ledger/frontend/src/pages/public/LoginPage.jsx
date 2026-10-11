import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, MailCheck, Timer, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Input, { PasswordInput } from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useDocumentTitle } from '../../hooks/index.js';
import { ApiError } from '../../services/api.js';
import { DEMO_ACCOUNTS } from '../../utils/constants.js';

const ROLE_HOME = {
  citizen: '/citizen',
  surveyor: '/surveyor',
  clerk: '/clerk',
  registrar: '/registrar',
  admin: '/admin',
};

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { login, verifyOtp, resendOtp, completeLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [challenge, setChallenge] = useState(null); // { challengeId, maskedEmail, expiresInSeconds, resendCooldownSeconds }
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const submittingRef = useRef(false);
  const otpRefs = useRef([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendReadyIn, setResendReadyIn] = useState(0);
  const [devCode, setDevCode] = useState(null); // MFA_DEV_MODE demo hint only

  // Countdown timers for expiry + resend cooldown.
  useEffect(() => {
    if (step !== 'otp') return undefined;
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendReadyIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const otpValue = useMemo(() => otpDigits.join(''), [otpDigits]);

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

  function land(destUser) {
    toast.success(`Welcome back, ${destUser.fullName.split(' ')[0]}.`);
    const dest = location.state?.from || ROLE_HOME[destUser.role] || '/citizen';
    navigate(dest, { replace: true });
  }

  async function doLogin(credentials) {
    setSubmitting(true);
    setErrors({});
    try {
      // Step 1: password factor -> MFA challenge (no token is returned here).
      const data = await login(credentials);
      setChallenge(data);
      setSecondsLeft(data.expiresInSeconds || 300);
      setResendReadyIn(data.resendCooldownSeconds || 45);
      setDevCode(data.devCode || null);
      setOtpDigits(['', '', '', '', '', '']);
      setStep('otp');
      setTimeout(() => otpRefs.current?.[0]?.focus(), 60);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setErrors((er) => ({ ...er, form: err.message }));
    } finally {
      setSubmitting(false);
    }
  }

  async function doVerify(codeOverride) {
    if (submittingRef.current) return; // never double-POST verify-otp
    const code = codeOverride || otpValue;
    if (!/^\d{6}$/.test(code)) {
      setErrors((er) => ({ ...er, form: 'Enter the 6-digit verification code.' }));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    try {
      const data = await verifyOtp({ challengeId: challenge.challengeId, otp: code });
      const user = completeLogin(data);
      land(user);
    } catch (err) {
      // An expired challenge can never be verified - send the user back to
      // step 1 instead of leaving them stuck on a dead OTP screen.
      if (err instanceof ApiError && err.errorCode === 'MFA_EXPIRED') {
        setChallenge(null);
        setStep('credentials');
        setErrors({ form: 'Your verification code expired. Please sign in again to receive a new one.' });
        return;
      }
      setErrors((er) => ({ ...er, form: err.message }));
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current?.[0]?.focus(), 60);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function doResend() {
    if (resendReadyIn > 0 || submitting) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await resendOtp(challenge.challengeId);
      setChallenge((c) => ({ ...c, ...res.data }));
      setSecondsLeft(res.data.expiresInSeconds || 300);
      setResendReadyIn(res.data.resendCooldownSeconds || 45);
      setDevCode(res.data.devCode || null);
      setOtpDigits(['', '', '', '', '', '']);
      toast.info('A new verification code has been sent.');
      setTimeout(() => otpRefs.current?.[0]?.focus(), 60);
    } catch (err) {
      if (err instanceof ApiError && (err.errorCode === 'MFA_EXPIRED' || secondsLeft <= 0)) {
        setChallenge(null);
        setStep('credentials');
        setErrors({ form: 'Your verification code expired. Please sign in again to receive a new one.' });
        return;
      }
      setErrors((er) => ({ ...er, form: err.message }));
    } finally {
      setSubmitting(false);
    }
  }

  function onOtpChange(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits((d) => {
      const next = [...d];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) otpRefs.current?.[index + 1]?.focus();
    // Auto-submit once all six digits are in.
    if (digit && index === 5) {
      const joined = otpDigits.slice(0, 5).join('') + digit;
      if (/^\d{6}$/.test(joined)) doVerify(joined);
    }
  }

  function onOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current?.[index - 1]?.focus();
    }
  }

  function onPaste(e) {
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      e.preventDefault();
      setOtpDigits(text.split(''));
      doVerify(text);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (step === 'credentials') {
      const er = clientValidate();
      if (Object.keys(er).length) {
        setErrors(er);
        return;
      }
      doLogin({ email: form.email.trim(), password: form.password });
    } else {
      doVerify();
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
          <p className="section-kicker">Secure registry access</p>
          <h1 className="page-title text-[28px] sm:text-[42px] xl:text-[52px] mt-4 sm:mt-5">
            Ownership records you can trace and trust.
          </h1>
          <p className="muted text-[14px] sm:text-[15px] leading-relaxed mt-4 sm:mt-6">
            Two-factor protected sign-in: your password plus a one-time email verification code. Review property records, verify document integrity, and follow every ownership transfer from submission to settlement.
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
          <ShieldCheck size={16} className="text-[rgb(var(--ll-accent))]" /> Password + email OTP, every sign-in
        </p>
      </section>

      {/* RIGHT — form */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[460px]">
          {step === 'credentials' ? (
            <>
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
                  Continue
                </Button>
              </form>

              <div className="flex items-center gap-3 my-7" aria-hidden="true">
                <span className="divider-h flex-1" />
              </div>

              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">Preview an office account</p>
              <p className="text-[11.5px] muted mb-3">Chips fill the form; each sign-in still needs the email code.</p>
              <div className="flex flex-wrap gap-2.5">
                {DEMO_ACCOUNTS.map((acc) => (
                  <Button
                    key={acc.email}
                    variant="secondary"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setForm({ email: acc.email, password: acc.password })}
                    title={`${acc.email} · ${acc.role}`}
                  >
                    {acc.label}
                  </Button>
                ))}
              </div>

              <p className="text-[13.5px] mt-8 muted">
                New to Land Ledger?{' '}
                <Link to="/register" className="link">
                  Create an account
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="kicker-number">
                <span className="num">02</span> Two-factor check
              </p>
              <h2 className="page-title text-[30px] mt-3">Verify your email</h2>
              <p className="muted text-[13.5px] mt-2 flex items-center gap-2">
                <MailCheck size={15} className="text-[rgb(var(--ll-accent))]" />
                Enter the 6-digit code sent to <span className="font-semibold text-foreground">{challenge?.maskedEmail}</span>
              </p>

              <form className="mt-8 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
                {errors.form ? (
                  <div className="rounded border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] px-3.5 py-2.5 text-[13px] font-semibold text-destructive" role="alert">
                    {errors.form}
                  </div>
                ) : null}

                {devCode ? (
                  <div className="rounded border border-[rgb(var(--ll-accent)/0.5)] bg-[rgb(var(--ll-accent-soft))] px-3.5 py-2.5 text-[12.5px] text-foreground/85" role="note">
                    <span className="font-bold">Demo mode (no SMTP configured):</span> your verification code is{' '}
                    <span className="font-mono font-bold text-[14px] tracking-wider">{devCode}</span>. Configure SMTP to email codes for real.
                  </div>
                ) : null}

                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2">Verification code</p>
                  <div className="flex gap-2" onPaste={onPaste}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={i === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        value={digit}
                        onChange={(e) => onOtpChange(i, e.target.value)}
                        onKeyDown={(e) => onOtpKeyDown(i, e)}
                        aria-label={`Digit ${i + 1}`}
                        className="w-12 h-14 text-center text-[20px] font-bold font-mono rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ll-accent))] focus:border-transparent transition"
                      />
                    ))}
                  </div>
                </div>

                <p className="text-[12.5px] muted flex items-center gap-1.5" aria-live="polite">
                  <Timer size={13} />
                  {secondsLeft > 0 ? (
                    <>Code expires in <span className="font-mono font-semibold text-foreground">{formatCountdown(secondsLeft)}</span></>
                  ) : (
                    <span className="text-destructive font-semibold">Code expired — sign in again to receive a new one.</span>
                  )}
                </p>

                <Button type="submit" block size="lg" loading={submitting} iconRight={ArrowRight}>
                  Verify OTP
                </Button>

                <div className="flex items-center justify-between gap-3">
                  {secondsLeft > 0 ? (
                    <button
                      type="button"
                      onClick={doResend}
                      disabled={resendReadyIn > 0 || submitting}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold link disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={13} />
                      {resendReadyIn > 0 ? `Resend OTP in ${resendReadyIn}s` : 'Resend OTP'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setChallenge(null); setStep('credentials'); setErrors({}); }}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-destructive hover:underline"
                    >
                      <RefreshCw size={13} />
                      Code expired - sign in again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setStep('credentials'); setErrors({}); setDevCode(null); }}
                    className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Use a different account
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
