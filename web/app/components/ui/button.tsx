import type { ComponentPropsWithoutRef } from 'react';

type ButtonProps = ComponentPropsWithoutRef<'button'>;

const Button = ({ className = '', type = 'button', ...props }: ButtonProps) => {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-md bg-accent-solid px-5 py-2.5 font-medium text-heading transition-colors hover:bg-accent-solid-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
};

export default Button;
