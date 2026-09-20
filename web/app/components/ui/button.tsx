import { LoaderCircle } from 'lucide-react';

import type { ComponentPropsWithoutRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'season' | 'member';

/** 跳去 Steam 的入口：次按钮外观加 Steam 图标，登录与创意工坊订阅共用 */
export const STEAM_BUTTON_CLASS =
  'inline-flex items-center whitespace-nowrap rounded-md border border-line bg-control text-content transition-colors hover:bg-control-hover';

export const STEAM_BUTTON_SIZE_CLASS = {
  // 36px 高，与登录后的账号控件统一，见 phase-2g-header-layout.md
  default: 'h-9 gap-1.5 px-2.5',
  large: 'min-h-14 gap-3 px-6 text-lg',
};

// 纯色是网站自己的操作，渐变只给花勇士积分或会员积分的操作，选型见 web/CLAUDE.md「按钮」
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  season: 'btn-season',
  member: 'btn-member',
};

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  /** 请求进行中：按钮内转圈并禁用，文案由调用方换成进行时 */
  loading?: boolean;
}

const Button = ({
  className = '',
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
};

export default Button;
