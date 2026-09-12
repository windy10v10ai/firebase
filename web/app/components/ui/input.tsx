import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'prefix'> {
  icon: ReactNode;
  invalid?: boolean;
  showCount?: boolean;
}

const Input = ({
  className = '',
  icon,
  invalid = false,
  showCount = false,
  value,
  ...props
}: InputProps) => {
  const borderClass = invalid
    ? 'border-danger focus-within:ring-danger/30'
    : 'border-line focus-within:border-accent focus-within:ring-accent/30';

  return (
    <div
      className={`flex min-h-11 items-center rounded-md border bg-surface/70 text-content transition-shadow focus-within:ring-2 ${borderClass}`}
    >
      <span aria-hidden="true" className="ml-3 shrink-0 text-muted">
        {icon}
      </span>
      <input
        value={value}
        aria-invalid={invalid || undefined}
        className={`min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none placeholder:text-muted ${className}`}
        {...props}
      />
      {showCount ? (
        <span aria-hidden="true" className="mr-3 shrink-0 text-xs tabular-nums text-muted">
          {typeof value === 'string' ? value.length : 0}
        </span>
      ) : null}
    </div>
  );
};

export default Input;
