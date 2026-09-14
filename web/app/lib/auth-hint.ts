/** 服务端据此决定首屏按哪种登录形态渲染；它不是凭据，不得用于任何鉴权、跳转或归属判断 */
export const PLAYER_UID_COOKIE = 'player-uid';

// 每次打开页面都会重写，一年足够覆盖不常来的玩家，且在 Chrome 的 400 天上限之内
export const PLAYER_UID_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** 只认纯数字，被改成别的值时按未登录处理 */
export function parsePlayerUid(value: string | undefined): string | null {
  return value && /^\d+$/.test(value) ? value : null;
}
