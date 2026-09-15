// SteamID64 与 32 位账号 ID 的固定偏移量，见 Valve 的 SteamID 规范
const STEAM_ID64_BASE = BigInt('76561197960265728');

/** 32 位账号 ID 转 SteamID64：Steam 的接口只认后者，库里与对外接口只用前者 */
export function toSteamId64(accountId: number): string {
  return (BigInt(accountId) + STEAM_ID64_BASE).toString();
}

/** SteamID64 转 32 位账号 ID，落在正整数安全范围之外时返回 undefined */
export function toAccountId(steamId64: string): number | undefined {
  const accountId = BigInt(steamId64) - STEAM_ID64_BASE;
  if (accountId <= BigInt(0) || accountId > BigInt(Number.MAX_SAFE_INTEGER)) {
    return undefined;
  }
  return Number(accountId);
}
