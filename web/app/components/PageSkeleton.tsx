interface PageSkeletonProps {
  label: string;
}

/** 等登录态或数据时的占位，避免先闪一下「需要登录」再跳走 */
export default function PageSkeleton({ label }: PageSkeletonProps) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="card-container h-40 animate-pulse" />
      <div className="card-container h-72 animate-pulse" />
    </div>
  );
}
