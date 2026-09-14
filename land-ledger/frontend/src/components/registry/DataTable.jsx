/**
 * Structured registry table.
 * columns: [{ key, header, render?, className?, mobilePrimary? }]
 * On mobile it becomes stacked record rows (spec: tables become records).
 */
export default function DataTable({ columns, rows, keyField = 'id', empty, rowActions, onRowClick, dense }) {
  if (!rows || rows.length === 0) {
    return empty || null;
  }
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block registry-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.headerClass || ''}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[keyField]} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.className || ''} ${dense ? '!py-2' : ''}`}>
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked records */}
      <div className="md:hidden flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row[keyField]}
            className="registry-panel p-4"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            role={onRowClick ? 'button' : undefined}
          >
            {columns
              .filter((c) => !c.hideMobile)
              .map((c, i) => (
                <div key={c.key} className={`flex justify-between gap-3 py-1.5 ${i > 0 ? 'border-t border-border mt-1.5 pt-2.5' : ''}`}>
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground pt-0.5 flex-none">{c.header}</span>
                  <span className={`text-[13px] text-right ${c.mobileClass || 'font-medium'}`}>{c.render ? c.render(row) : row[c.key] ?? '—'}</span>
                </div>
              ))}
            {rowActions ? <div className="border-t border-border mt-2 pt-3 flex flex-wrap gap-2">{rowActions(row)}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}
