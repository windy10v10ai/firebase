import { toAccountId } from '../util/steam-id';

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export { STEAM_OPENID_ENDPOINT };

/** 回调地址是否指向自家网站 */
export function isAllowedReturnTo(returnTo: string | null, allowedOrigins: string[]): boolean {
  if (!returnTo) {
    return false;
  }
  try {
    return allowedOrigins.includes(new URL(returnTo).origin);
  } catch {
    return false;
  }
}

/** 把 Steam 回调参数改成向 Steam 二次核对的请求体 */
export function buildCheckAuthenticationBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams(params);
  body.set('openid.mode', 'check_authentication');
  return body;
}

/** Steam 的核对结果是 `键:值` 换行文本，不是 JSON */
export function isValidResponse(responseText: string): boolean {
  return responseText
    .split('\n')
    .map((line) => line.trim())
    .includes('is_valid:true');
}

/** 从 Claimed ID 取出 32 位账号 ID，格式不符或超出范围返回 undefined */
export function parseAccountId(claimedId: string | null): number | undefined {
  const matched = claimedId?.match(CLAIMED_ID_PATTERN);
  if (!matched) {
    return undefined;
  }
  return toAccountId(matched[1]);
}
