interface SkeletonProps {
  chars?: number;
}

/** 数据没到时占住一段文字的位置 */
const Skeleton = ({ chars = 4 }: SkeletonProps) => {
  // 用透明文字撑开而不写死高度，行高天然与真实文字一致，数据到了原地替换不会跳
  return (
    <span aria-hidden="true" className="animate-pulse select-none rounded bg-line text-transparent">
      {'0'.repeat(chars)}
    </span>
  );
};

export default Skeleton;
