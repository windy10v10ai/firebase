'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

const COPIED_RESET_DELAY_MS = 1500;

interface CopyIdButtonProps {
  value: string;
  tooltip: string;
  copiedLabel: string;
}

/** 复制 ID 的小按钮，跟着 ID 文字走，不单独占布局空间 */
export default function CopyIdButton({ value, tooltip, copiedLabel }: CopyIdButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
  };

  const label = copied ? copiedLabel : tooltip;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      aria-label={label}
      className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-md transition-colors ${
        copied ? 'text-success' : 'text-faint hover:bg-panel-soft hover:text-heading'
      }`}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
