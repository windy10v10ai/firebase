import type { ReactNode } from 'react';

/** 数据没到时占住一段文字的位置；传入示意文字时按它的长度撑开 */
const Skeleton = ({ children = '0000' }: { children?: ReactNode }) => {
  // 用透明文字撑开而不写死高度，行高天然与真实文字一致，数据到了原地替换不会跳
  return (
    <span aria-hidden="true" className="animate-pulse select-none rounded bg-line text-transparent">
      {children}
    </span>
  );
};

export default Skeleton;
