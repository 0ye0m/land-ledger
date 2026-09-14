import { AlertTriangle, CheckCircle2, CircleDot, Clock3, XCircle, ShieldAlert, ArrowRightLeft, FileCheck2, Landmark, Link2 } from 'lucide-react';
import { STATUS_LABELS, STATUS_TONES, RISK_TONES } from '../../utils/constants';

const TONE_CLASSES = {
  ok: 'text-[rgb(var(--ll-accent-foreground))] border-[rgb(var(--ll-accent)/0.4)] bg-[rgb(var(--ll-accent-soft))]',
  pending: 'text-[rgb(var(--ll-warn))] border-[rgb(var(--ll-warn)/0.4)] bg-[rgb(var(--ll-warn-soft))]',
  bad: 'text-destructive border-destructive/40 bg-[rgb(var(--ll-destructive-soft))]',
  info: 'text-[rgb(var(--ll-info))] border-[rgb(var(--ll-info)/0.4)] bg-[rgb(var(--ll-info-soft))]',
  primary: 'text-primary border-primary/40 bg-[rgb(var(--ll-primary-soft))]',
  neutral: 'text-muted-foreground border-border-strong bg-muted/60',
};

const TONE_ICONS = {
  ok: CheckCircle2,
  pending: Clock3,
  bad: XCircle,
  info: CircleDot,
  primary: Landmark,
  neutral: CircleDot,
};

export function StatusBadge({ status, tone, icon: IconOverride, label }) {
  const resolvedTone = tone || STATUS_TONES[status] || 'neutral';
  const Icon = IconOverride || TONE_ICONS[resolvedTone] || CircleDot;
  return (
    <span className={`status-badge ${TONE_CLASSES[resolvedTone]}`}>
      <Icon />
      {label || STATUS_LABELS[status] || status}
    </span>
  );
}

export function RiskBadge({ risk }) {
  const tone = RISK_TONES[risk] || 'neutral';
  const Icon = risk === 'HIGH' ? ShieldAlert : risk === 'MEDIUM' ? AlertTriangle : CheckCircle2;
  return (
    <span className={`status-badge ${TONE_CLASSES[tone]}`}>
      <Icon />
      {risk || '—'} risk
    </span>
  );
}

export function OperationBadge({ operation }) {
  const isTransfer = operation === 'OWNERSHIP_TRANSFER';
  return (
    <span className={`status-badge ${isTransfer ? TONE_CLASSES.primary : TONE_CLASSES.info}`}>
      {isTransfer ? <ArrowRightLeft /> : <FileCheck2 />}
      {isTransfer ? 'Ownership transfer' : 'Property registration'}
    </span>
  );
}

export function StatusDot({ tone = 'idle', label }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
      <span className={`status-dot ${tone}`} />
      {label}
    </span>
  );
}

export function Pill({ children, primary, icon: Icon, className = '' }) {
  return (
    <span className={`pill ${primary ? 'pill-primary' : ''} ${className}`}>
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

export function HashChip({ hash, href }) {
  if (!hash) return <span className="tr-muted text-[12px]">—</span>;
  const short = `${hash.slice(0, 12)}…${hash.slice(-10)}`;
  const inner = (
    <>
      <Link2 size={11} className="flex-none opacity-70" />
      <span className="truncate">{short}</span>
    </>
  );
  return href ? (
    <a className="hash-chip link no-underline" href={href} target="_blank" rel="noreferrer" title={hash}>
      {inner}
    </a>
  ) : (
    <span className="hash-chip" title={hash}>
      {inner}
    </span>
  );
}
