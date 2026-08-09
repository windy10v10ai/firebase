'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectDefaultDay,
  buildPersonalStateUpdate,
  buildGlobalUpdates,
  buildPointTotals,
  buildRewardLedger,
  taskSearchText,
  selectedTaskIdOf,
  assertPersonalSaveVersion,
} = require('./daily-challenge-local.cjs');

test('assertPersonalSaveVersion allows an explicit local force override across stale GUI tokens', () => {
  const staleSnapshot = {
    exists: true,
    updateTime: { toMillis: () => 200 },
  };

  assert.doesNotThrow(() =>
    assertPersonalSaveVersion(staleSnapshot, {
      expectedPlayerStateUpdateTime: 100,
      forceOverride: true,
    }, false),
  );
  assert.throws(
    () =>
      assertPersonalSaveVersion(staleSnapshot, {
        expectedPlayerStateUpdateTime: 100,
        forceOverride: false,
      }, false),
    /changed after the last refresh/i,
  );
});

test('selectedTaskIdOf keeps the current assigned task and never falls back to a configured task', () => {
  assert.equal(selectedTaskIdOf({ taskId: 'current-personal' }), 'current-personal');
  assert.equal(selectedTaskIdOf({ id: 'current-global' }), 'current-global');
  assert.equal(selectedTaskIdOf(undefined), null);
  assert.equal(selectedTaskIdOf(null), null);
});

test('selectDefaultDay prefers the newest open challenge day even before the player has a state', () => {
  const selected = selectDefaultDay([
    { dayId: '2026-08-07', acceptedTask: undefined, status: 'open' },
    { dayId: '2026-08-06', acceptedTask: { taskId: 'damage' }, status: 'settled' },
    { dayId: '2026-08-05', acceptedTask: { taskId: 'kills' }, status: 'settled' },
  ]);
  assert.equal(selected, '2026-08-07');
});

test('selectDefaultDay falls back to the newest assigned day when no day is open', () => {
  const selected = selectDefaultDay([
    { dayId: '2026-08-06', acceptedTask: undefined, status: 'settled' },
    { dayId: '2026-08-05', acceptedTask: { taskId: 'damage' }, status: 'settled' },
    { dayId: '2026-08-04', acceptedTask: { taskId: 'kills' }, status: 'settled' },
  ]);
  assert.equal(selected, '2026-08-05');
});

test('buildPersonalStateUpdate keeps player progress and task progress in sync', () => {
  const state = { currentRound: 2, totalRounds: 3, progress: 12, acceptedTask: undefined };
  const task = {
    taskId: 'general_damage',
    revision: 1,
    configVersion: 3,
    scope: 'personal_general',
    metric: 'hero_damage',
    unit: 'damage',
    minDataVersion: 2,
    title: { cn: '伤害', en: 'Damage', ru: 'Урон' },
    description: { cn: '说明', en: 'Description', ru: 'Описание' },
    target: 100,
    rewardSeasonPoint: 20,
  };
  const update = buildPersonalStateUpdate({
    state,
    task,
    dayId: '2026-08-06',
    steamId: '483215844',
    progress: 40,
    target: 120,
    rewardSeasonPoint: 35,
    now: new Date('2026-08-06T12:00:00.000Z'),
  });
  assert.equal(update.progress, 40);
  assert.equal(update.acceptedTask.progress, 40);
  assert.equal(update.acceptedTask.target, 120);
  assert.equal(update.acceptedTask.rewardSeasonPoint, 35);
  assert.equal(update.acceptedTask.round, 2);
  assert.equal(update.acceptedTask.totalRounds, 3);
  assert.match(update.acceptedTask.assignmentId, /^2026-08-06-483215844-local-/);
});

test('buildPersonalStateUpdate normalizes published config tasks that use id instead of taskId', () => {
  const update = buildPersonalStateUpdate({
    state: { currentRound: 1, totalRounds: 3, progress: 0 },
    task: {
      id: 'general_hero_damage',
      revision: 1,
      configVersion: 3,
      scope: 'personal_general',
      metric: 'hero_damage',
      unit: 'damage',
      minDataVersion: 2,
      title: { cn: '\u4f24\u5bb3', en: 'Damage', ru: 'Damage' },
      description: { cn: '\u8bf4\u660e', en: 'Description', ru: 'Description' },
      target: 500000,
      rewardSeasonPoint: 100,
    },
    dayId: '2026-08-06',
    steamId: '483215844',
    progress: 25,
    target: 500000,
    rewardSeasonPoint: 100,
    now: new Date('2026-08-06T12:00:00.000Z'),
  });
  assert.equal(update.acceptedTask.taskId, 'general_hero_damage');
  assert.equal(update.acceptedTask.id, undefined);
  assert.match(update.acceptedTask.assignmentId, /general_hero_damage-\d+$/);
});

test('buildPersonalStateUpdate replaces task A with task B using a fresh assignment', () => {
  const acceptedAt = new Date('2026-08-06T08:00:00.000Z');
  const now = new Date('2026-08-06T12:34:56.000Z');
  const state = {
    currentRound: 1,
    totalRounds: 3,
    progress: 88,
    acceptedAt,
    acceptedTask: {
      taskId: 'general_stun_duration',
      assignmentId: 'assignment-a',
      scope: 'personal_general',
    },
  };
  const update = buildPersonalStateUpdate({
    state,
    task: {
      id: 'general_slow_duration',
      scope: 'personal_general',
      metric: 'slow_duration_ms',
      title: { cn: '\u51cf\u901f\u4efb\u52a1' },
      target: 60000,
      rewardSeasonPoint: 100,
    },
    dayId: '2026-08-06',
    steamId: '483215844',
    progress: 0,
    target: 60000,
    rewardSeasonPoint: 120,
    now,
  });

  assert.equal(update.acceptedTask.taskId, 'general_slow_duration');
  assert.equal(update.acceptedTask.metric, 'slow_duration_ms');
  assert.equal(update.acceptedTask.progress, 0);
  assert.equal(update.acceptedTask.rewardSeasonPoint, 120);
  assert.notEqual(update.acceptedTask.assignmentId, 'assignment-a');
  assert.match(update.acceptedTask.assignmentId, /general_slow_duration-1786019696000$/);
  assert.equal(update.acceptedAt, now);
});

test('buildPersonalStateUpdate keeps the assignment when editing the current task', () => {
  const acceptedAt = new Date('2026-08-06T08:00:00.000Z');
  const update = buildPersonalStateUpdate({
    state: {
      currentRound: 1,
      totalRounds: 3,
      acceptedAt,
      acceptedTask: {
        taskId: 'general_stun_duration',
        assignmentId: 'assignment-a',
        scope: 'personal_general',
      },
    },
    task: {
      taskId: 'general_stun_duration',
      scope: 'personal_general',
      metric: 'stun_duration_ms',
      target: 90000,
      rewardSeasonPoint: 100,
    },
    dayId: '2026-08-06',
    steamId: '483215844',
    progress: 10,
    target: 90000,
    rewardSeasonPoint: 100,
    now: new Date('2026-08-06T12:00:00.000Z'),
  });

  assert.equal(update.acceptedTask.assignmentId, 'assignment-a');
  assert.equal(update.acceptedAt, acceptedAt);
});

test('taskSearchText includes Chinese title, task id and metric for GUI filtering', () => {
  const searchText = taskSearchText({
    id: 'hero_snapfire_1',
    scope: 'personal_hero',
    metric: 'stun_duration_ms',
    heroName: 'npc_dota_hero_snapfire',
    title: { cn: '\u4f7f\u7528\u7535\u708e\u7edd\u624b\u4f7f\u654c\u65b9 Bot \u7729\u6655', en: 'Stun enemy Bots as Snapfire' },
  });
  assert.ok(searchText.includes('\u7729\u6655'));
  assert.match(searchText, /hero_snapfire_1/);
  assert.match(searchText, /stun_duration_ms/);
  assert.match(searchText, /npc_dota_hero_snapfire/);
});

test('buildGlobalUpdates synchronizes day, player snapshot, contribution and tiers', () => {
  const task = {
    id: 'global_towers',
    revision: 1,
    configVersion: 3,
    scope: 'global',
    metric: 'tower_kills',
    unit: 'count',
    minDataVersion: 2,
    title: { cn: '推塔', en: 'Towers', ru: 'Башни' },
    description: { cn: '说明', en: 'Description', ru: 'Описание' },
    target: 100,
    rewardSeasonPoint: 10,
  };
  const updates = buildGlobalUpdates({
    task,
    dayId: '2026-08-06',
    steamId: '483215844',
    progress: 80,
    target: 75,
    playerContribution: 15,
    rewards: { topRewardSeasonPoint: 90, middleRewardSeasonPoint: 60, baseRewardSeasonPoint: 30 },
    existingTiers: { topPercent: 10, middlePercent: 30 },
    existingTask: { taskId: 'global_other', assignmentId: 'old-global-assignment' },
    now: new Date('2026-08-06T12:00:00.000Z'),
  });
  assert.equal(updates.day.globalProgress, 80);
  assert.equal(updates.day.globalCompleted, true);
  assert.equal(updates.player.globalTask.target, 75);
  assert.equal(updates.player.globalTask.taskId, 'global_towers');
  assert.equal(updates.player.globalTask.id, undefined);
  assert.equal(updates.contribution.value, 15);
  assert.equal(updates.day.globalRewardTiers.topPercent, 10);
  assert.equal(updates.day.globalRewardTiers.baseRewardSeasonPoint, 30);
  assert.notEqual(updates.day.globalTask.assignmentId, 'old-global-assignment');
  assert.match(updates.day.globalTask.assignmentId, /global_towers-1786017600000$/);
});


test('buildGlobalUpdates rolls a changed player contribution into visible global progress', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');
  const existingTask = {
    taskId: 'global_hero_damage',
    assignmentId: '2026-08-08-global-local-global_hero_damage-1',
    scope: 'global',
    metric: 'hero_damage',
  };
  const updates = buildGlobalUpdates({
    task: existingTask,
    dayId: '2026-08-08',
    steamId: '483215844',
    progress: 0,
    target: 100000000,
    playerContribution: 99900000,
    rewards: { topRewardSeasonPoint: 100, middleRewardSeasonPoint: 90, baseRewardSeasonPoint: 80 },
    existingTiers: { topPercent: 10, middlePercent: 30 },
    existingTask,
    existingProgress: 0,
    existingContribution: {
      assignmentId: existingTask.assignmentId,
      metric: existingTask.metric,
      value: 0,
    },
    now,
  });

  assert.equal(updates.day.globalProgress, 99900000);
  assert.equal(updates.day.globalTask.progress, 99900000);
  assert.equal(updates.day.globalCompleted, false);
});

test('buildPointTotals applies deltas without allowing negative totals', () => {
  assert.deepEqual(
    buildPointTotals({ seasonPointTotal: 100, memberPointTotal: 50 }, 25, -10),
    { seasonPointTotal: 125, memberPointTotal: 40 },
  );
  assert.throws(
    () => buildPointTotals({ seasonPointTotal: 5, memberPointTotal: 5 }, -6, 0),
    /cannot be negative/i,
  );
});

test('buildRewardLedger creates a pending local test reward', () => {
  const ledger = buildRewardLedger({
    dayId: '2026-08-06',
    steamId: 483215844,
    source: 'personal',
    seasonPoint: 88,
    now: new Date('2026-08-06T12:00:00.000Z'),
    nonce: 'abc',
  });
  assert.equal(ledger.id, 'local_gui_2026-08-06_483215844_abc');
  assert.equal(ledger.notificationStatus, 'pending');
  assert.equal(ledger.seasonPoint, 88);
});
