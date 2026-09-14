/**
 * 玩家页面的地址。未登录时拼不出 steamId，先落到 `/my`，由那一页在登录后跳到带 id 的地址。
 * 登录态还在恢复时同样走 `/my`——这一瞬间被点到也能正确落地，只是多一跳。
 */
export function playerPagePath(uid: string | null, subPath = ''): string {
  const base = uid ? `/profile/${uid}` : '/my';
  return subPath ? `${base}/${subPath}` : base;
}
