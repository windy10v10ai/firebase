'use client';

import { TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface AcceleratorHintProps {
  variant?: 'inline' | 'tooltip';
}

/** 国内网络访问 Steam 常打不开登录跳转的页面，按界面语言判断是否提示，不用 IP 或地区库 */
export default function AcceleratorHint({ variant = 'inline' }: AcceleratorHintProps) {
  const locale = useLocale();
  const t = useTranslations('auth');

  if (locale !== 'zh') {
    return null;
  }

  const text = t.rich('acceleratorHint', { b: (chunks) => <b>{chunks}</b> });

  if (variant === 'tooltip') {
    return (
      <div className="pointer-events-none absolute top-full right-0 z-10 mt-2 whitespace-nowrap rounded-md border border-warning/50 bg-panel-raised px-3 py-2 text-xs text-warning opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="flex items-center gap-1.5">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {text}
        </span>
      </div>
    );
  }

  return (
    <p className="flex items-start gap-1.5 text-sm text-warning">
      <TriangleAlert className="size-4 shrink-0 translate-y-0.5" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
