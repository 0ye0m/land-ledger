import { Inbox, Loader2, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';

export function LoadingState({ label = 'Loading registry data…', block = true }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${block ? 'py-16' : 'py-6'} text-muted-foreground`}>
      <Loader2 size={18} className="animate-spin" />
      <span className="text-[13.5px] font-medium">{label}</span>
    </div>
  );
}

export function EmptyState({ title, message, action: Action, actionLabel, icon: Icon = Inbox }) {
  return (
    <div className="registry-panel py-14 px-6 text-center">
      <span className="inline-grid place-items-center w-11 h-11 rounded-md border border-border bg-muted/60 text-muted-foreground mb-3">
        <Icon size={19} />
      </span>
      <h3 className="font-display font-bold text-[16px]">{title}</h3>
      {message ? <p className="muted text-[13px] mt-1.5 max-w-md mx-auto leading-relaxed">{message}</p> : null}
      {Action ? (
        <div className="mt-4">
          <Action />
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const message = error?.message || 'An unexpected error occurred while reaching the registry.';
  return (
    <div className="registry-panel py-12 px-6 text-center border-destructive/40">
      <span className="inline-grid place-items-center w-11 h-11 rounded-md border border-destructive/40 bg-[rgb(var(--ll-destructive-soft))] text-destructive mb-3">
        <AlertTriangle size={19} />
      </span>
      <h3 className="font-display font-bold text-[16px]">{title}</h3>
      <p className="muted text-[13px] mt-1.5 max-w-md mx-auto leading-relaxed">{message}</p>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
