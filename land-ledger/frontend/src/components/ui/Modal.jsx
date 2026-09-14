import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from './Button';

/**
 * Modal rendered through a React portal on document.body.
 *
 * Why a portal: page roots use the `fade-up` animation whose fill-mode keeps
 * `transform` applied after it finishes. A transformed ancestor becomes the
 * containing block for `position: fixed` descendants, which previously trapped
 * the overlay inside the content column (backdrop not covering the viewport,
 * dialog offset when the page is scrolled). Portalling to <body> escapes every
 * transformed/filtered ancestor, so `fixed inset-0` always spans the viewport.
 */
export default function Modal({ open, onClose, title, kicker, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[rgb(15_20_30/0.55)] overlay-in" onClick={onClose} />
      <div className={`relative registry-panel shadow-raised w-full ${width} max-h-[92vh] sm:max-h-[88vh] flex flex-col fade-up`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border flex-none">
          <div className="min-w-0">
            {kicker ? <p className="eyebrow mb-1">{kicker}</p> : null}
            <h2 className="font-display font-bold text-[17px] leading-snug">{title}</h2>
          </div>
          <button onClick={onClose} className="tr-muted hover:text-foreground transition-colors mt-1 flex-none" aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="px-5 py-3.5 border-t border-border bg-muted/40 flex flex-wrap justify-end gap-2 rounded-b-md flex-none">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary', loading, children }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'destructive' ? 'destructive' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] muted leading-relaxed">{message}</p>
      {children}
    </Modal>
  );
}
