import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProfileShare } from './share-card';

const fetchMock = vi.fn();

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    const route = routes[path] ?? { status: 404 };
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
  });
}

beforeEach(() => {
  vi.stubEnv('API_ORIGIN', 'http://api.test');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('fetchProfileShare', () => {
  it('公开主页返回昵称、头像与战绩', async () => {
    respond({
      '/api/player/123/info': { status: 200, body: { matchCount: 10, winCount: 6 } },
      '/api/player/123/steam-profile': {
        status: 200,
        body: { steamId: '123', personaName: 'Windy', avatarUrl: 'https://avatar.test/a.jpg' },
      },
    });

    await expect(fetchProfileShare('123')).resolves.toEqual({
      personaName: 'Windy',
      avatarUrl: 'https://avatar.test/a.jpg',
      matchCount: 10,
      winCount: 6,
    });
  });

  it('请求不带任何凭据', async () => {
    respond({});
    await fetchProfileShare('123');
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    }
  });

  it('主页未公开（403）时返回 null，即使昵称接口有返回', async () => {
    respond({
      '/api/player/123/info': { status: 403 },
      '/api/player/123/steam-profile': {
        status: 200,
        body: { steamId: '123', personaName: 'Windy', avatarUrl: null },
      },
    });
    await expect(fetchProfileShare('123')).resolves.toBeNull();
  });

  it('玩家不存在时返回 null', async () => {
    respond({});
    await expect(fetchProfileShare('123')).resolves.toBeNull();
  });

  it('只有昵称接口失败时照常返回，昵称与头像留空', async () => {
    respond({
      '/api/player/123/info': { status: 200, body: { matchCount: 0, winCount: 0 } },
      '/api/player/123/steam-profile': { status: 500 },
    });
    await expect(fetchProfileShare('123')).resolves.toEqual({
      personaName: null,
      avatarUrl: null,
      matchCount: 0,
      winCount: 0,
    });
  });

  it('网络错误或超时返回 null', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(fetchProfileShare('123')).resolves.toBeNull();
  });

  it('非数字 id 不发请求', async () => {
    await expect(fetchProfileShare('../admin')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
