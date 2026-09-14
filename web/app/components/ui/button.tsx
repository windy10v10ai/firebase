import type { ComponentPropsWithoutRef } from 'react';

type ButtonVariant = 'season' | 'member' | 'secondary' | 'steam';

/** 跳去 Steam 的中性控件，登录与创意工坊订阅共用 */
export const STEAM_BUTTON_CLASS =
  'inline-flex items-center whitespace-nowrap rounded-md border border-line bg-control text-content transition-colors hover:bg-control-hover';

export const STEAM_BUTTON_SIZE_CLASS = {
  // 36px 高，与登录后的账号控件统一，见 phase-2g-header-layout.md
  default: 'h-9 gap-1.5 px-2.5',
  large: 'min-h-14 gap-3 px-6 text-lg',
};

const BASE_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  season: 'btn-season',
  member: 'btn-member',
  secondary:
    'inline-flex min-h-11 md:min-h-10 items-center justify-center rounded-[7px] border border-line px-5 text-sm font-extrabold text-content transition-colors hover:bg-panel-soft disabled:text-[#5d5d66]',
  // 页面里的独立操作，比头部那个挤在一行里的同风格入口留更多横向余量
  steam: `${STEAM_BUTTON_CLASS} h-9 px-8 justify-center`,
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
