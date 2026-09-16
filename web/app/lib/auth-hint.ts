/** 服务端据此决定首屏按哪种登录形态渲染；它不是凭据，不得用于任何鉴权、跳转或归属判断 */
export const PLAYER_UID_COOKIE = 'player-uid';

// 每次打开页面都会重写，一年足够覆盖不常来的玩家，且在 Chrome 的 400 天上限之内
export const PLAYER_UID_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** 只认纯数字，被改成别的值时按未登录处理 */
export function parsePlayerUid(value: string | undefined): string | null {
  return value && /^\d+$/.test(value) ? value : null;
}

/** 服务端据此让昵称头像也在首屏 HTML 里出现，避免先 ID 后昵称的跳变；同样不是凭据 */
export const PLAYER_PROFILE_COOKIE = 'player-profile';

export const PLAYER_PROFILE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export interface PlayerProfileHint {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
}

/** steamId 对不上当前登录的玩家（换过号、cookie 是别人的）一律当没有，退回按 ID 渲染再发请求纠正 */
export function parsePlayerProfileHint(
  value: string | undefined,
  uid: string | null,
): PlayerProfileHint | null {
  if (!value || !uid) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (
      parsed &&
      typeof parsed === 'object' &&
      'steamId' in parsed &&
      (parsed as { steamId: unknown }).steamId === uid
    ) {
      const { steamId, personaName, avatarUrl } = parsed as Record<string, unknown>;
      return {
        steamId: steamId as string,
        personaName: typeof personaName === 'string' ? personaName : null,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
      };
    }
  } catch {
    // 格式不对就当没有
  }
  return null;
}
