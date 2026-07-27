import { SERVER_TYPE } from '../util/secret/secret.service';

import { AnalyticsService } from './analytics.service';
import { GameEndDto, GameEndPlayerDto } from './dto/game-end-dto';

function buildPlayer(overrides: Partial<GameEndPlayerDto> = {}): GameEndPlayerDto {
  return {
    heroName: 'npc_dota_hero_abaddon',
    steamId: 1,
    teamId: 2,
    isDisconnected: false,
    level: 1,
    totalGoldEarned: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    battlePoints: 0,
    lastHits: 0,
    heroDamage: 0,
    damageTaken: 0,
    healing: 0,
    towerKills: 0,
    ...overrides,
  } as GameEndPlayerDto;
}

function buildGameEnd(players: GameEndPlayerDto[]): GameEndDto {
  return {
    matchId: '123',
    version: 'v4.00',
    difficulty: 0,
    gameOptions: {
      multiplierRadiant: 1,
      multiplierDire: 1,
      playerNumberRadiant: 1,
      playerNumberDire: 1,
      towerPowerPct: 100,
    },
    winnerTeamId: 2,
    gameTimeMsec: 1000,
    players,
  } as GameEndDto;
}

describe('AnalyticsService.gameEndPlayerBot', () => {
  it('sends awaken as 1 when player.awaken is 1', async () => {
    const service = new AnalyticsService(null);
    const sendEventSpy = jest.spyOn(service, 'sendEvent').mockResolvedValue(true);

    const gameEnd = buildGameEnd([buildPlayer({ awaken: 1 })]);
    await service.gameEndPlayerBot(gameEnd, SERVER_TYPE.TEST);

    expect(sendEventSpy).toHaveBeenCalledTimes(1);
    const event = sendEventSpy.mock.calls[0][1] as unknown as { params: { awaken: number } };
    expect(event.params.awaken).toBe(1);
  });

  it('defaults awaken to 0 when player.awaken is not provided', async () => {
    const service = new AnalyticsService(null);
    const sendEventSpy = jest.spyOn(service, 'sendEvent').mockResolvedValue(true);

    const gameEnd = buildGameEnd([buildPlayer()]);
    await service.gameEndPlayerBot(gameEnd, SERVER_TYPE.TEST);

    expect(sendEventSpy).toHaveBeenCalledTimes(1);
    const event = sendEventSpy.mock.calls[0][1] as unknown as { params: { awaken: number } };
    expect(event.params.awaken).toBe(0);
  });
});
