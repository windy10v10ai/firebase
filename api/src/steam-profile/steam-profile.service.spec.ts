import { SteamProfile } from './entities/steam-profile.entity';
import { SteamProfileApiService } from './steam-profile.api.service';
import { SteamProfileService } from './steam-profile.service';

const STEAM_ID = 123456789;
const HOUR_MS = 60 * 60 * 1000;
const SUMMARY = { personaName: '新昵称', avatarUrl: 'https://new.jpg' };

// 不传 summary 就是「Steam 给不出结果」
function createService(
  cached?: Partial<SteamProfile> & { ageMs: number },
  summary?: typeof SUMMARY,
) {
  const store = new Map<string, SteamProfile>();
  if (cached) {
    const { ageMs, ...fields } = cached;
    store.set(`${STEAM_ID}`, {
      id: `${STEAM_ID}`,
      fetchedAt: new Date(Date.now() - ageMs),
      ...fields,
    });
  }
  const repository = {
    findById: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
    create: jest.fn((doc: SteamProfile) => Promise.resolve(store.set(doc.id, doc) && doc)),
    update: jest.fn((doc: SteamProfile) => Promise.resolve(store.set(doc.id, doc) && doc)),
  };
  const apiService = { fetchPlayerSummary: jest.fn(() => Promise.resolve(summary)) };
  const service = new SteamProfileService(
    repository as never,
    apiService as unknown as SteamProfileApiService,
  );
  return { service, apiService, store };
}

describe('SteamProfileService', () => {
  it('缓存还新鲜时直接返回，不打 Steam', async () => {
    const { service, apiService } = createService({
      ageMs: HOUR_MS,
      personaName: '老昵称',
      avatarUrl: 'https://old.jpg',
    });

    const dto = await service.findBySteamId(STEAM_ID);

    expect(dto).toEqual({
      steamId: `${STEAM_ID}`,
      personaName: '老昵称',
      avatarUrl: 'https://old.jpg',
    });
    expect(apiService.fetchPlayerSummary).not.toHaveBeenCalled();
  });

  it('缓存过期后重新问 Steam 并写回', async () => {
    const { service, store } = createService(
      { ageMs: 25 * HOUR_MS, personaName: '老昵称' },
      SUMMARY,
    );

    const dto = await service.findBySteamId(STEAM_ID);

    expect(dto.personaName).toBe(SUMMARY.personaName);
    expect(store.get(`${STEAM_ID}`)?.avatarUrl).toBe(SUMMARY.avatarUrl);
  });

  it('Steam 查不到时返回空字段，并留下负缓存', async () => {
    const { service, store } = createService();

    const dto = await service.findBySteamId(STEAM_ID);

    expect(dto).toEqual({ steamId: `${STEAM_ID}`, personaName: null, avatarUrl: null });
    expect(store.get(`${STEAM_ID}`)?.fetchedAt).toBeInstanceOf(Date);
  });
});
