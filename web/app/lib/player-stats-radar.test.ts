import { describe, expect, it } from 'vitest';

import { battleRadarCorners, PlayerStatsRadar } from './player-stats-radar';

const base: PlayerStatsRadar = {
  damage: 50,
  gold: 50,
  participation: 50,
  push: 50,
  deaths: 50,
  tank: 50,
  healing: 0,
  assists: 0,
  stuns: 0,
};

describe('battleRadarCorners', () => {
  it('生存把承伤与死亡的平均围绕 50 拉开，超出范围截到 0–100', () => {
    expect(battleRadarCorners({ ...base, tank: 20, deaths: 90 }).survival).toBe(58);
    expect(battleRadarCorners({ ...base, tank: 80, deaths: 80 }).survival).toBe(98);
    expect(battleRadarCorners({ ...base, tank: 100, deaths: 100 }).survival).toBe(100);
    expect(battleRadarCorners({ ...base, tank: 0, deaths: 0 }).survival).toBe(0);
  });

  it('辅助以治疗、助攻里较高的一项为主，另一项加分，控制只占一点', () => {
    const assister = battleRadarCorners({ ...base, healing: 0, assists: 90, stuns: 40 });
    const balanced = battleRadarCorners({ ...base, healing: 60, assists: 60, stuns: 40 });
    const stunner = battleRadarCorners({ ...base, healing: 0, assists: 20, stuns: 90 });
    const capped = battleRadarCorners({ ...base, healing: 100, assists: 100, stuns: 50 });

    expect(assister.support).toBe(77);
    expect(balanced.support).toBe(66);
    expect(stunner.support).toBe(25);
    expect(capped.support).toBe(95);
  });
});
