'use client';

import { Check, Share } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { playerPagePath } from '@/app/lib/player-path';

const COPIED_RESET_DELAY_MS = 2000;

/** 分享个人主页：触屏设备调起系统分享面板，其余复制链接 */
export default function ShareButton({
  steamId,
  disabled = false,
}: {
  steamId: string;
  disabled?: boolean;
}) {
  const t = useTranslations('profile.share');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleShare = async () => {
    const url = `${window.location.origin}${playerPagePath(steamId)}`;
    // 手机上能直接发进聊天软件；电脑上的系统分享面板反而比复制多一步
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={disabled}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] border border-line bg-control px-3 text-sm transition-colors hover:bg-control-hover disabled:bg-panel-soft disabled:text-faint ${
        copied ? 'text-success' : 'text-content hover:text-heading'
      }`}
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Share className="size-4" aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? t('copied') : t('label')}</span>
    </button>
  );
}
