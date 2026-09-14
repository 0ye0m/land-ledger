import { Link } from 'react-router-dom';
import { ArrowRight, Fingerprint, FileCheck2, SearchCheck, Boxes, CircleCheck } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/index.js';

const FEATURES = [
  {
    icon: Fingerprint,
    tone: 'primary',
    title: 'Verified ownership',
    body: 'A single property record connects ownership, survey details, status, and supporting evidence.',
  },
  {
    icon: FileCheck2,
    tone: 'info',
    title: 'Document integrity',
    body: 'Every uploaded record receives a SHA-256 fingerprint for repeatable integrity checks.',
  },
  {
    icon: SearchCheck,
    tone: 'ok',
    title: 'Protected transfers',
    body: 'Structured risk checks surface duplicate requests, missing documents, and valuation anomalies.',
  },
  {
    icon: Boxes,
    tone: 'warn',
    title: 'Traceable settlement',
    body: 'Confirmed ownership changes are mirrored to an append-only ledger for independent reconciliation.',
  },
];

const TONE_STYLES = {
  primary: 'border-primary/40 bg-[rgb(var(--ll-primary-soft))] text-primary',
  info: 'border-[rgb(var(--ll-info)/0.45)] bg-[rgb(var(--ll-info-soft))] text-[rgb(var(--ll-info))]',
  ok: 'border-[rgb(var(--ll-accent)/0.5)] bg-[rgb(var(--ll-accent-soft))] text-[rgb(var(--ll-accent-foreground))]',
  warn: 'border-[rgb(var(--ll-warn)/0.5)] bg-[rgb(var(--ll-warn-soft))] text-[rgb(var(--ll-warn))]',
};

const STAGES = [
  { num: '01', title: 'Register', body: 'Create an authoritative property record.' },
  { num: '02', title: 'Verify', body: 'Check documents and transfer risk.' },
  { num: '03', title: 'Settle', body: 'Confirm ownership and preserve history.' },
];

export default function HomePage() {
  useDocumentTitle('Property Registry');
  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left */}
          <div>
            <p className="section-kicker">Trusted property records</p>
            <h1 className="page-title text-[40px] sm:text-[56px] lg:text-[62px] mt-5">
              A clearer chain of<br className="hidden sm:block" /> <span className="text-primary">ownership.</span>
            </h1>
            <p className="muted text-[15.5px] leading-relaxed mt-6 max-w-lg">
              Land Ledger brings property records, verified documents, transfer reviews, and ledger settlement into one accountable registry.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/register" className="btn btn-primary btn-lg">
                Register your account <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="btn btn-secondary btn-lg">
                Access the registry
              </Link>
            </div>
            <div className="divider-h mt-10 mb-5 max-w-lg" />
            <ul className="flex flex-wrap gap-x-6 gap-y-2.5">
              {['Role-protected access', 'End-to-end audit trail', 'Integrity verification'].map((item) => (
                <li key={item} className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground/85">
                  <CircleCheck size={15} className="text-[rgb(var(--ll-accent-foreground))] text-[rgb(var(--ll-accent))]" style={{ color: 'rgb(var(--ll-accent))' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: structured 2x2 feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 border border-border bg-card/40">
            {FEATURES.map((f, i) => (
              <article key={f.title} className={`feature-panel border-border ${i % 2 === 0 ? 'sm:border-r' : ''} ${i < 2 ? 'border-b' : ''} ${i % 2 === 0 ? 'border-r sm:border-r' : ''}`}>
                <span className={`inline-grid place-items-center w-11 h-11 rounded border ${TONE_STYLES[f.tone]}`}>
                  <f.icon size={19} />
                </span>
                <h3 className="font-display font-bold text-[17px] mt-5">{f.title}</h3>
                <p className="muted text-[13.5px] leading-relaxed mt-2">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PROCESS ================= */}
      <section className="bg-[rgb(var(--ll-secondary)/0.35)] border-b border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-16 grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-14">
          <div>
            <p className="kicker-number">
              <span className="num">01</span> Every step accounted for
            </p>
            <h2 className="page-title text-[30px] sm:text-[38px] mt-4">From record to settlement.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-8">
            {STAGES.map((s, i) => (
              <div key={s.num} className={`sm:px-6 first:sm:pl-0 last:sm:pr-0 ${i > 0 ? 'sm:border-l sm:border-[rgb(var(--ll-border-strong)/0.6)]' : ''}`}>
                <p className="text-[12px] font-bold text-primary tracking-[0.08em]">{s.num}</p>
                <h3 className="font-display font-bold text-[19px] mt-2.5">{s.title}</h3>
                <p className="muted text-[13.5px] leading-relaxed mt-2 max-w-[220px]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
