import { SteamProfile } from './entities/steam-profile.entity';
import { SteamProfileApiService } from './steam-profile.api.service';
import { SteamProfileService } from './steam-profile.service';

const STEAM_ID = 123456789;
const HOUR_MS = 60 * 60 * 1000;

function createFakeRepository() {
  const store = new Map<string, SteamProfile>();
  return {
    repository: {
      findById: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
      create: jest.fn((doc: SteamProfile) => {
        store.set(doc.id, doc);
        return Promise.resolve(doc);
      }),
      update: jest.fn((doc: SteamProfile) => {
        store.set(doc.id, doc);
        return Promise.resolve(doc);
      }),
    },
    store,
  };
}

function createService(
  cached?: SteamProfile,
  summary?: { personaName: string; avatarUrl: string },
) {
  const { repository, store } = createFakeRepository();
  if (cached) {
    store.set(cached.id, cached);
  }
  const apiService = {
    fetchPlayerSummary: jest.fn(() => Promise.resolve(summary)),
  };
  const service = new SteamProfileService(
    repository as never,
    apiService as unknown as SteamProfileApiService,
  );
  return { service, repository, apiService, store };
}

function agedProfile(ageMs: number, fields: Partial<SteamProfile> = {}): SteamProfile {
  return {
    id: `${STEAM_ID}`,
    fetchedAt: new Date(Date.now() - ageMs),
    ...fields,
  };
}

describe('SteamProfileService', () => {
  it('缓存还新鲜时直接返回，不打 Steam', async () => {
    const { service, apiService } = createService(
      agedProfile(HOUR_MS, { personaName: '老昵称', avatarUrl: 'https://old.jpg' }),
    );

    const dto = await service.findBySteamId(STEAM_ID);

    expect(dto).toEqual({
      steamId: `${STEAM_ID}`,
      personaName: '老昵称',
      avatarUrl: 'https://old.jpg',
    });
    expect(apiService.fetchPlayerSummary).not.toHaveBeenCalled();
  });

  it('缓存超过一天后重新问 Steam 并写回', async () => {
    const { service, apiService, store } = createService(
      agedProfile(25 * HOUR_MS, { personaName: '老昵称', avatarUrl: 'https://old.jpg' }),
      { personaName: '新昵称', avatarUrl: 'https://new.jpg' },
    );

    const dto = await service.findBySteamId(STEAM_ID);

    expect(apiService.fetchPlayerSummary).toHaveBeenCalledWith(STEAM_ID);
    expect(dto.personaName).toBe('新昵称');
    expect(store.get(`${STEAM_ID}`)?.avatarUrl).toBe('https://new.jpg');
  });

  it('没有缓存且 Steam 查不到时返回空字段，并留下负缓存', async () => {
    const { service, store } = createService(undefined, undefined);

    const dto = await service.findBySteamId(STEAM_ID);

    expect(dto).toEqual({ steamId: `${STEAM_ID}`, personaName: null, avatarUrl: null });
    expect(store.get(`${STEAM_ID}`)?.personaName).toBeUndefined();
  });

  it('负缓存一小时内不再打 Steam', async () => {
    const { service, apiService } = createService(agedProfile(30 * 60 * 1000));

    await service.findBySteamId(STEAM_ID);

    expect(apiService.fetchPlayerSummary).not.toHaveBeenCalled();
  });

  it('负缓存过一小时就重试', async () => {
    const { service, apiService } = createService(agedProfile(2 * HOUR_MS), {
      personaName: '终于查到了',
      avatarUrl: 'https://new.jpg',
    });

    const dto = await service.findBySteamId(STEAM_ID);

    expect(apiService.fetchPlayerSummary).toHaveBeenCalled();
    expect(dto.personaName).toBe('终于查到了');
  });

  it('Steam 这次没给结果时保留旧昵称，不退回空字段', async () => {
    const { service } = createService(
      agedProfile(25 * HOUR_MS, { personaName: '老昵称', avatarUrl: 'https://old.jpg' }),
      undefined,
    );

    const dto = await service.findBySteamId(STEAM_ID);

    expect(dto.personaName).toBe('老昵称');
    expect(dto.avatarUrl).toBe('https://old.jpg');
  });
});
