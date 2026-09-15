import CopyIdButton from './CopyIdButton';

interface IdWithCopyProps {
  id: string;
  idText: string;
  copyTooltip: string;
  copiedLabel: string;
}

/** ID 文字挨着复制按钮，外层要给 flex 容器才能正常省略号截断 */
export default function IdWithCopy({ id, idText, copyTooltip, copiedLabel }: IdWithCopyProps) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{idText}</span>
      <CopyIdButton value={id} tooltip={copyTooltip} copiedLabel={copiedLabel} />
    </span>
  );
}
