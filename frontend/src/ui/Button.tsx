import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-hover hover:border-ink-faint/40',
  ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-label gap-1.5 rounded-control',
  md: 'h-11 px-4 text-body font-semibold gap-2 rounded-control',
  lg: 'h-13 px-5 text-base font-bold gap-2 rounded-card',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', block = false) {
  return [
    'inline-flex items-center justify-center select-none transition-[background-color,border-color,color,transform] duration-150',
    'active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'disabled:pointer-events-none disabled:bg-line disabled:text-ink-faint disabled:border-transparent disabled:shadow-none',
    VARIANT[variant],
    SIZE[size],
    block ? 'w-full' : '',
  ].join(' ');
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: IconName;
  children?: ReactNode;
}

export function Button({
  variant,
  size,
  block,
  icon,
  loading,
  children,
  className,
  type = 'button',
  disabled,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${buttonClass(variant, size, block)} ${className ?? ''}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} size={size === 'sm' ? 15 : 18} />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  children,
  className,
  ...rest
}: CommonProps & LinkProps) {
  return (
    <Link className={`${buttonClass(variant, size, block)} ${className ?? ''}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 18} />}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}
