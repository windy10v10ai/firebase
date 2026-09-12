const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

/** 拼 Steam OpenID 跳转链接，回调地址里带上当前页面，登录完跳回来 */
export function buildSteamLoginUrl(currentPath: string): string {
  const origin = window.location.origin;
  const returnTo = `${origin}/login/callback?next=${encodeURIComponent(currentPath)}`;

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

/** 挡掉指向站外的 next，只接受站内绝对路径 */
export function isSafeNextPath(next: string | null): next is string {
  return !!next && next.startsWith('/') && !next.startsWith('//');
}
