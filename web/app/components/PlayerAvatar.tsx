'use client';

import { UserRound } from 'lucide-react';
import { useState } from 'react';

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined;
  /** 图片与兜底图标各自的尺寸类，两者要等宽等高，否则图取不到时布局会跳 */
  imageClassName: string;
  iconClassName: string;
  iconStrokeWidth?: number;
}

/** 玩家头像，没有地址或图片取不到时显示人形图标 */
export default function PlayerAvatar({
  avatarUrl,
  imageClassName,
  iconClassName,
  iconStrokeWidth,
}: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!avatarUrl || failed) {
    return <UserRound className={iconClassName} strokeWidth={iconStrokeWidth} aria-hidden="true" />;
  }

  return (
    // 用原生 img 不用 next/image：后者会把图片拉到自己的服务器再转发，
    // 而这张图的全部价值就在于浏览器直连 Steam 的图床，我们不碰字节
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      onError={() => setFailed(true)}
      className={imageClassName}
    />
  );
}
