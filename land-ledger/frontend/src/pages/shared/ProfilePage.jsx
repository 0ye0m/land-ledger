import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { userService } from '../../services';
import { useApi, useDocumentTitle } from '../../hooks/index.js';
import PageHeader, { SectionKicker } from '../../components/registry/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import { PasswordInput } from '../../components/ui/Input.jsx';
import { LoadingState, ErrorState } from '../../components/registry/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { refreshUser } = useAuth();
  const toast = useToast();
  const { data, loading, error, refetch } = useApi(() => userService.profile(), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const profile = data?.data?.user;
  const effective = form || (profile ? {
    fullName: profile.fullName || '',
    phone: profile.phone || '',
    district: profile.district || '',
    state: profile.state || '',
    walletAddress: profile.walletAddress || '',
  } : null);

  if (loading) return <LoadingState label="Loading account record…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const set = (k) => (e) => setForm({ ...(effective || {}), [k]: e.target.value });

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await userService.updateProfile(effective);
      toast.success('Profile updated');
      setForm(null);
      refreshUser();
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pw.newPassword.length < 8) {
      setPwError('New password must use at least 8 characters');
      return;
    }
    setSavingPw(true);
    setPwError('');
    try {
      await userService.changePassword(pw);
      toast.success('Password updated successfully');
      setPw({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="max-w-4xl flex flex-col gap-6 fade-up">
      <PageHeader kicker="Account record" title="Profile." description="Your structured registry account. The role is assigned by the registry and cannot be self-modified." />

      <section>
        <SectionKicker>Account details</SectionKicker>
        <form className="detail-grid mt-3" onSubmit={saveProfile}>
          <div className="detail-cell">
            <p className="detail-label">Full name</p>
            <input className="input !border-transparent !bg-transparent !px-0 font-semibold" value={effective?.fullName || ''} onChange={set('fullName')} aria-label="Full name" />
          </div>
          <div className="detail-cell">
            <p className="detail-label">Email</p>
            <p className="detail-value">{profile.email}</p>
          </div>
          <div className="detail-cell">
            <p className="detail-label">Role</p>
            <p className="detail-value uppercase tracking-wide">{profile.role}</p>
          </div>
          <div className="detail-cell">
            <p className="detail-label">Phone</p>
            <input className="input !border-transparent !bg-transparent !px-0 font-semibold" value={effective?.phone || ''} onChange={set('phone')} placeholder="—" aria-label="Phone" />
          </div>
          <div className="detail-cell">
            <p className="detail-label">District</p>
            <input className="input !border-transparent !bg-transparent !px-0 font-semibold" value={effective?.district || ''} onChange={set('district')} placeholder="—" aria-label="District" />
          </div>
          <div className="detail-cell">
            <p className="detail-label">State</p>
            <input className="input !border-transparent !bg-transparent !px-0 font-semibold" value={effective?.state || ''} onChange={set('state')} placeholder="—" aria-label="State" />
          </div>
          <div className="detail-cell sm:col-span-2 lg:col-span-3">
            <p className="detail-label">Wallet address</p>
            <input className="input !border-transparent !bg-transparent !px-0 font-mono text-[12.5px] font-semibold" value={effective?.walletAddress || ''} onChange={set('walletAddress')} placeholder="0x… — used for ledger settlement" aria-label="Wallet address" />
          </div>
          <div className="detail-cell">
            <p className="detail-label">Account created</p>
            <p className="detail-value">{formatDate(profile.createdAt, { withTime: true })}</p>
          </div>
          <div className="detail-cell">
            <p className="detail-label">Last activity</p>
            <p className="detail-value">{formatDate(profile.lastActivityAt, { withTime: true })}</p>
          </div>
          <div className="detail-cell flex items-end">
            <Button type="submit" size="sm" icon={Save} loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section className="registry-panel p-5">
        <SectionKicker>Security</SectionKicker>
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 items-start" onSubmit={changePassword}>
          <PasswordInput label="Current password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} required />
          <PasswordInput label="New password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => { setPw((p) => ({ ...p, newPassword: e.target.value })); setPwError(''); }} error={pwError} help="Use at least 8 characters." required />
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" icon={KeyRound} loading={savingPw}>
              Update password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
