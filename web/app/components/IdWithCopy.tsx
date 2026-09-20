import CopyIdButton from './CopyIdButton';

interface IdWithCopyProps {
  id: string;
  idText: string;
  copyTooltip: string;
  copiedLabel: string;
}

// relative 让按钮能盖在主页摘要卡的透明跳转链接上面接住点击，个人主页身份卡没有那层链接，是无操作的兜底

export default function IdWithCopy({ id, idText, copyTooltip, copiedLabel }: IdWithCopyProps) {
  return (
    <span className="relative flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{idText}</span>
      <CopyIdButton value={id} tooltip={copyTooltip} copiedLabel={copiedLabel} />
    </span>
  );
}
