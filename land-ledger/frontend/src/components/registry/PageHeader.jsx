/** Section kicker with short coral rule. */
export function SectionKicker({ children, number, className = '' }) {
  if (number) {
    return (
      <p className={`kicker-number ${className}`}>
        <span className="num">{number}</span>
        {children}
      </p>
    );
  }
  return <p className={`section-kicker ${className}`}>{children}</p>;
}

/** Standard page header: kicker + editorial heading + optional actions. */
export default function PageHeader({ kicker, number, title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {kicker ? <SectionKicker number={number}>{kicker}</SectionKicker> : null}
        <h1 className="page-title text-[26px] sm:text-[30px] mt-2">{title}</h1>
        {description ? <p className="muted text-[13.5px] mt-1.5 max-w-2xl leading-relaxed">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
