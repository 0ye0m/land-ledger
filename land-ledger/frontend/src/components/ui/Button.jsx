import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  destructive: 'btn-destructive',
};

export default function Button({
  variant = 'primary',
  size,
  block,
  loading,
  icon: Icon,
  iconRight: IconRight,
  children,
  className = '',
  disabled,
  ...rest
}) {
  const cls = [
    VARIANTS[variant] || 'btn-primary',
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
      {IconRight ? <IconRight size={15} /> : null}
    </button>
  );
}
