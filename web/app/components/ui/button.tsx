import type { ComponentPropsWithoutRef } from 'react';

type ButtonVariant = 'season' | 'member' | 'secondary';

const BASE_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  season: 'btn-season',
  member: 'btn-member',
  secondary:
    'inline-flex min-h-11 md:min-h-10 items-center justify-center rounded-[7px] border border-line px-5 text-sm font-extrabold text-content transition-colors hover:bg-panel-soft disabled:text-[#5d5d66]',
};

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
}

const Button = ({
  className = '',
  type = 'button',
  variant = 'season',
  ...props
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} ${BASE_CLASS} ${className}`}
      {...props}
    />
  );
};

export default Button;
