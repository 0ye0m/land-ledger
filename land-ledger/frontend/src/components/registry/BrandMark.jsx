import { Link } from 'react-router-dom';

/** Rotated square registry mark + wordmark. */
export function BrandMark({ size = 'default', subline = 'PROPERTY REGISTRY', to = '/' }) {
  const cls = size === 'lg' ? 'brand-mark brand-mark-lg' : 'brand-mark';
  const inner = (
    <span className="inline-flex items-center gap-3">
      <span className={cls} aria-hidden="true" />
      <span className="leading-none">
        <span className="block font-display font-bold tracking-[0.04em] text-[15px]">LAND LEDGER</span>
        {subline ? <span className="block text-[9px] font-bold tracking-[0.22em] text-muted-foreground mt-1">{subline}</span> : null}
      </span>
    </span>
  );
  return to ? (
    <Link to={to} className="inline-flex items-center" aria-label="Land Ledger home">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Avatar({ name, className = '' }) {
  const init = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`inline-grid place-items-center w-9 h-9 rounded border border-primary/50 text-primary text-[12px] font-bold bg-primary/5 flex-none ${className}`}
      aria-hidden="true"
    >
      {init}
    </span>
  );
}
