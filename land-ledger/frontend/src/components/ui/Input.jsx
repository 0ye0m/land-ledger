import { useId, useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

export function Field({ label, htmlFor, help, error, required, children }) {
  return (
    <div>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-primary ml-0.5">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="field-error flex items-center gap-1" role="alert">
          <AlertCircle size={12} /> {error}
        </p>
      ) : help ? (
        <p className="field-help">{help}</p>
      ) : null}
    </div>
  );
}

export default function Input({ label, help, error, required, className = '', ...rest }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} help={help} error={error} required={required}>
      <input id={id} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export function PasswordInput({ label, help, error, required, className = '', ...rest }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} htmlFor={id} help={help} error={error} required={required}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={`input pr-10 ${error ? 'input-error' : ''} ${className}`}
          aria-invalid={Boolean(error)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 tr-muted hover:text-foreground transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={0}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  );
}

export function Textarea({ label, help, error, required, className = '', rows = 4, ...rest }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} help={help} error={error} required={required}>
      <textarea id={id} rows={rows} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export function Select({ label, help, error, required, options = [], placeholder = 'Select…', className = '', ...rest }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} help={help} error={error} required={required}>
      <select id={id} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={Boolean(error)} {...rest}>
        <option value="">{placeholder}</option>
        {options.map((opt) =>
          typeof opt === 'string' ? (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ) : (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        )}
      </select>
    </Field>
  );
}

export function Checkbox({ label, error, className = '', ...rest }) {
  const id = useId();
  return (
    <Field error={error}>
      <label className={`flex items-center gap-2 text-[13px] font-medium cursor-pointer select-none ${className}`} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="w-4 h-4 rounded border-input accent-[rgb(var(--ll-primary))] focus:ring-2 focus:ring-ring/40"
          {...rest}
        />
        {label}
      </label>
    </Field>
  );
}
