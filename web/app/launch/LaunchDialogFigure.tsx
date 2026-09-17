interface LaunchDialogFigureProps {
  title: string;
  body: string;
  params?: string;
  note?: string;
  confirm: string;
  cancel: string;
  /** 浏览器的对话框是胶囊按钮，Steam 的是直角，照各自原样画 */
  pill?: boolean;
}

/**
 * 复刻点启动链接后会跳出的系统对话框。
 * 整块对读屏隐藏：同样的信息已经写在上方的步骤说明里，念两遍反而啰嗦。
 */
export default function LaunchDialogFigure({
  title,
  body,
  params,
  note,
  confirm,
  cancel,
  pill = false,
}: LaunchDialogFigureProps) {
  const buttonShape = pill ? 'rounded-full' : 'rounded-[3px]';

  return (
    <div
      aria-hidden="true"
      className="rounded-[10px] border border-line-strong bg-panel-raised px-4 py-3.5"
    >
      <p className="text-[15px] leading-6 text-heading">{title}</p>
      <p className="mt-1.5 text-[13px] leading-5 text-muted">{body}</p>
      {params ? (
        <p className="mt-2.5 rounded-[4px] bg-surface px-2 py-1.5 font-mono text-xs leading-5 break-all text-content">
          {params}
        </p>
      ) : null}
      {note ? <p className="mt-2 text-[13px] leading-5 text-muted">{note}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <span className={`bg-primary px-4 py-1.5 text-xs text-white ${buttonShape}`}>
          {confirm}
        </span>
        <span
          className={`border border-line-strong px-4 py-1.5 text-xs text-content ${buttonShape}`}
        >
          {cancel}
        </span>
      </div>
    </div>
  );
}
