export default function MetricBlock({ label, value, icon: Icon, foot, tone = 'default' }) {
  const toneColor =
    tone === 'ok'
      ? 'text-[rgb(var(--ll-accent-foreground))]'
      : tone === 'warn'
        ? 'text-[rgb(var(--ll-warn))]'
        : tone === 'bad'
          ? 'text-destructive'
          : tone === 'primary'
            ? 'text-primary'
            : '';
  return (
    <div className="metric-block">
      <p className="metric-label">
        {Icon ? <Icon size={12} aria-hidden="true" /> : null}
        {label}
      </p>
      <p className={`metric-value ${toneColor}`}>{value ?? '—'}</p>
      {foot ? <p className="metric-foot">{foot}</p> : null}
    </div>
  );
}
