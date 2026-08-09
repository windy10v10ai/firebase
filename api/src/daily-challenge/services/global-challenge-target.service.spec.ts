import { GlobalChallengeTargetService } from './global-challenge-target.service';

const policy = {
  launchTarget: 10000,
  minTarget: 5000,
  maxTarget: 50000,
  perPlayerExpectedContribution: 10,
  completionFactor: 0.75,
  maxDailyChangeRatio: 0.25,
};

describe('GlobalChallengeTargetService', () => {
  const service = new GlobalChallengeTargetService();

  it('uses the fixed launch target before three complete history days exist', () => {
    expect(
      service.calculate(policy, [{ effectiveParticipants: 1000 }, { effectiveParticipants: 1200 }]),
    ).toBe(10000);
  });

  it('uses available history from day three and no more than the latest seven days', () => {
    const history = [100, 200, 300, 400, 500, 600, 700, 800].map((effectiveParticipants) => ({
      effectiveParticipants,
    }));

    expect(service.calculate(policy, history)).toBe(3750 + 1250); // clamped to minTarget
  });

  it('limits automatic changes to the configured previous-day range', () => {
    const highHistory = Array.from({ length: 7 }, () => ({ effectiveParticipants: 5000 }));

    expect(service.calculate(policy, highHistory, { previousTarget: 10000 })).toBe(12500);
  });

  it('uses a manual target directly after policy bounds are applied', () => {
    expect(service.calculate(policy, [], { previousTarget: 10000, manualTarget: 40000 })).toBe(
      40000,
    );
    expect(service.calculate(policy, [], { manualTarget: 999999 })).toBe(50000);
  });
});
