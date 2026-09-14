import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export function SearchBar({ value, onChange, placeholder = 'Search registry…', onSubmit, className = '' }) {
  return (
    <form
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
      role="search"
    >
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 w-full sm:w-72"
        aria-label={placeholder}
      />
    </form>
  );
}

export function FilterBar({ children, className = '' }) {
  return <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>{children}</div>;
}

export function FilterSelect({ value, onChange, options, placeholder, ariaLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input !w-auto text-[12.5px] py-1.5"
      aria-label={ariaLabel || placeholder}
    >
      <option value="">{placeholder}</option>
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        )
      )}
    </select>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 10)));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between flex-wrap gap-2 pt-1" aria-label="Pagination">
      <p className="text-[12px] text-muted-foreground">
        Showing <strong className="text-foreground">{from}</strong>–<strong className="text-foreground">{to}</strong> of{' '}
        <strong className="text-foreground">{total}</strong> records
      </p>
      <div className="flex items-center gap-1.5">
        <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="text-[12px] font-semibold px-1.5">
          {page} / {totalPages}
        </span>
        <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
