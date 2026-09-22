import { toSteamId64 } from '../util/steam-id';

import { SteamProfileApiService } from './steam-profile.api.service';

describe('SteamProfileApiService', () => {
  const originalKey = process.env.STEAM_WEB_API_KEY;

  beforeEach(() => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.STEAM_WEB_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it('批量查询按 100 个一批请求，结果按账号 ID 索引，缺字段的玩家不进结果', async () => {
    const steamIds = Array.from({ length: 150 }, (_, i) => i + 1);
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const ids = new URL(input as string).searchParams.get('steamids')!.split(',');
      const players = ids.map((steamid) => ({
        steamid,
        personaname: `name-${steamid}`,
        // 第 1 位玩家没有头像
        avatarmedium:
          steamid === toSteamId64(1) ? undefined : `https://avatar/${steamid}_medium.jpg`,
      }));
      return new Response(JSON.stringify({ response: { players } }));
    });

    const summaries = await new SteamProfileApiService().fetchPlayerSummaries(steamIds);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(summaries.size).toBe(149);
    expect(summaries.has(1)).toBe(false);
    expect(summaries.get(150)).toEqual({
      personaName: `name-${toSteamId64(150)}`,
      avatarUrl: `https://avatar/${toSteamId64(150)}_medium.jpg`,
    });
  });
});
