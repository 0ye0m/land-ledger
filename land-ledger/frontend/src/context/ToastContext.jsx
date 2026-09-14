import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, kind = 'info', ttl = 4200) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error', 5600),
      info: (m) => push(m, 'info'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[min(92vw,380px)]" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] || Info;
          const tone =
            t.kind === 'success'
              ? 'border-accent/50 text-accent-foreground'
              : t.kind === 'error'
                ? 'border-destructive/50 text-destructive'
                : 'border-border-strong';
          return (
            <div key={t.id} className={`fade-up registry-panel px-3.5 py-3 flex items-start gap-2.5 shadow-raised ${tone}`}>
              <Icon size={17} className="mt-0.5 flex-none" />
              <p className="text-[13px] font-medium leading-snug flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="tr-muted hover:text-foreground transition-colors" aria-label="Dismiss notification">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
