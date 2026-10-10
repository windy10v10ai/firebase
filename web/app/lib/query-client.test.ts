import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api';
import { clearOnAccountChange, createQueryClient } from './query-client';

async function callsUntilSettled(error: Error) {
  const client = createQueryClient();
  const queryFn = vi.fn().mockRejectedValue(error);
  await client.fetchQuery({ queryKey: ['retry'], queryFn, retryDelay: 0 }).catch(() => undefined);
  return queryFn.mock.calls.length;
}

describe('失败重试', () => {
  it('4xx 不重试', async () => {
    expect(await callsUntilSettled(new ApiError(404))).toBe(1);
    expect(await callsUntilSettled(new ApiError(401))).toBe(1);
  });

  it('5xx 重试一次', async () => {
    expect(await callsUntilSettled(new ApiError(500))).toBe(2);
  });

  it('网络错误重试一次', async () => {
    expect(await callsUntilSettled(new TypeError('Failed to fetch'))).toBe(2);
  });
});

describe('换账号', () => {
  it('账号不变时保留缓存', () => {
    const client = createQueryClient();
    client.setQueryData(['player', '1', 'info'], { seeded: true });

    clearOnAccountChange(client, '1', '1');

    expect(client.getQueryData(['player', '1', 'info'])).toEqual({ seeded: true });
  });

  it.each([
    ['换号', '1', '2'],
    ['退出', '1', null],
    ['登录', null, '1'],
  ])('%s时清空全部缓存', (_, previous, next) => {
    const client = createQueryClient();
    client.setQueryData(['player', '1', 'info'], { seeded: true });
    client.setQueryData(['leaderboard'], { seeded: true });

    clearOnAccountChange(client, previous, next);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
