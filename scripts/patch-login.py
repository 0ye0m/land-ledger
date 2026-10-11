#!/usr/bin/env python3
"""LoginPage fixes:
A5 - in-flight guard on doVerify (no double verify-otp POSTs)
A4 - expired challenge recovery (expired code flips back to credentials
     step; Resend hidden after expiry since it can only 401)
"""
P = '/home/z/my-project/land-ledger/frontend/src/pages/public/LoginPage.jsx'
t = open(P).read()

# --- A5: in-flight guard ---
old = """  async function doVerify(codeOverride) {
    const code = codeOverride || otpValue;
    if (!/\\d{6}$/.test(code)) {"""
# careful: the regex in source is /^\d{6}$/ - match exactly
old = """  async function doVerify(codeOverride) {
    const code = codeOverride || otpValue;
    if (!/^\\d{6}$/.test(code)) {"""
new = """  async function doVerify(codeOverride) {
    if (submittingRef.current) return; // never double-POST verify-otp
    const code = codeOverride || otpValue;
    if (!/^\\d{6}$/.test(code)) {"""
assert old in t, 'doVerify anchor not found'
t = t.replace(old, new)

# --- A5: keep a ref in sync with submitting ---
old = """  async function doVerify(codeOverride) {
    if (submittingRef.current) return; // never double-POST verify-otp
    const code = codeOverride || otpValue;
    if (!/^\\d{6}$/.test(code)) {
      setErrors((er) => ({ ...er, form: 'Enter the 6-digit verification code.' }));
      return;
    }
    setSubmitting(true);"""
new = """  async function doVerify(codeOverride) {
    if (submittingRef.current) return; // never double-POST verify-otp
    const code = codeOverride || otpValue;
    if (!/^\\d{6}$/.test(code)) {
      setErrors((er) => ({ ...er, form: 'Enter the 6-digit verification code.' }));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);"""
assert old in t
t = t.replace(old, new)

# finally block: clear ref before navigating
old = """      setErrors((er) => ({ ...er, form: err.message }));
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current?.[0]?.focus(), 60);
    } finally {
      setSubmitting(false);
    }
  }

  async function doResend() {"""
new = """      // An expired challenge can never be verified - send the user back to
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

  async function doResend() {"""
assert old in t
t = t.replace(old, new)

# --- A4: resend on an expired challenge must also recover, not loop 401s ---
old = """    } catch (err) {
      setErrors((er) => ({ ...er, form: err.message }));
    } finally {
      setSubmitting(false);
    }
  }

  function onOtpChange(index, value) {"""
new = """    } catch (err) {
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

  function onOtpChange(index, value) {"""
assert old in t
t = t.replace(old, new)

# --- A4: after expiry show "Sign in again" instead of a dead Resend button ---
old = """                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={doResend}
                    disabled={resendReadyIn > 0 || submitting}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold link disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={13} />
                    {resendReadyIn > 0 ? `Resend OTP in ${resendReadyIn}s` : 'Resend OTP'}
                  </button>"""
new = """                <div className="flex items-center justify-between gap-3">
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
                  )}"""
assert old in t
t = t.replace(old, new)

# expired copy fix (no more "request a new one" dead-end phrasing)
old = "<span className=\"text-destructive font-semibold\">Code expired — request a new one or sign in again.</span>"
new = "<span className=\"text-destructive font-semibold\">Code expired — sign in again to receive a new one.</span>"
assert old in t
t = t.replace(old, new)

# add the submittingRef declaration next to the other refs/state
old = "  const otpRefs ="
assert old in t
t = t.replace(old, "  const submittingRef = React.useRef(false);\n  const otpRefs = ", 1)

open(P, 'w').write(t)
print('LoginPage patched')
