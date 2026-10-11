import { SetMetadata } from '@nestjs/common';

export const ALLOW_VIEW_OTHERS_KEY = 'allowViewOthers';
/** 只读路由允许网站访客（未登录或非本人）读取 `:steamId` 对应玩家的公开资料 */
export const AllowViewOthers = () => SetMetadata(ALLOW_VIEW_OTHERS_KEY, true);
