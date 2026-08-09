'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

const PROJECT_ID = process.env.DAILY_CHALLENGE_PROJECT_ID || 'windy10v10ai';
const STEAM_ID = String(process.env.DAILY_CHALLENGE_STEAM_ID || '483215844');
const EXPECTED_EMULATOR_HOST = '127.0.0.1:8080';
const API_BASE = String(process.env.DAILY_CHALLENGE_API_BASE || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const API_NODE_MODULES = process.env.DAILY_CHALLENGE_API_NODE_MODULES
  ? path.resolve(process.env.DAILY_CHALLENGE_API_NODE_MODULES)
  : path.resolve(__dirname, '..', '..', 'api', 'node_modules');

function fail(message) {
  throw new Error(message);
}

function asNumber(value, label, { integer = false, min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < min) {
    fail(`${label} must be ${integer ? 'an integer' : 'a number'} >= ${min}`);
  }
  return parsed;
}

function selectDefaultDay(days) {
  const ordered = [...days].sort((a, b) => String(b.dayId).localeCompare(String(a.dayId)));
  return (
    ordered.find((item) => item.status === 'open')?.dayId ??
    ordered.find((item) => item.acceptedTask)?.dayId ??
    ordered[0]?.dayId ??
    null
  );
}

function taskIdOf(task) {
  const taskId = task?.taskId ?? task?.id;
  return taskId === undefined || taskId === null || String(taskId).trim() === '' ? null : String(taskId);
}

function selectedTaskIdOf(currentTask) {
  return taskIdOf(currentTask);
}

function copyTask(task) {
  if (!task || typeof task !== 'object') fail('Task is required');
  const taskId = taskIdOf(task);
  if (!taskId) fail('Task id is required');
  const snapshot = JSON.parse(JSON.stringify(task));
  snapshot.taskId = taskId;
  delete snapshot.id;
  return snapshot;
}

function buildTaskSnapshot({ task, assignmentId, progress, target, rewardSeasonPoint, round, totalRounds }) {
  const snapshot = copyTask(task);
  delete snapshot.enabled;
  delete snapshot.category;
  delete snapshot.weight;
  delete snapshot.expectedMatches;
  delete snapshot.cooldownDays;
  delete snapshot.availableFrom;
  delete snapshot.availableUntil;
  delete snapshot.groupTags;
  delete snapshot.mutexTags;
  delete snapshot.starTargets;
  delete snapshot.pureDamageEvidence;
  snapshot.assignmentId = assignmentId;
  snapshot.progress = progress;
  snapshot.target = target;
  snapshot.rewardSeasonPoint = rewardSeasonPoint;
  if (snapshot.scope !== 'global') {
    snapshot.star = Number(snapshot.star || 2);
    snapshot.round = round;
    snapshot.totalRounds = totalRounds;
  } else {
    delete snapshot.star;
    delete snapshot.round;
    delete snapshot.totalRounds;
  }
  return snapshot;
}

function buildPersonalStateUpdate({ state, task, dayId, steamId, progress, target, rewardSeasonPoint, now }) {
  const safeProgress = asNumber(progress, 'Personal progress');
  const safeTarget = asNumber(target, 'Personal target', { min: 1 });
  const safeReward = asNumber(rewardSeasonPoint, 'Personal reward', { integer: true });
  if (!String(task.scope || '').startsWith('personal_')) fail('Selected task is not a personal task');
  const selectedTaskId = taskIdOf(task);
  if (!selectedTaskId) fail('Selected personal task has no id');
  const sameAssignment = Boolean(state.acceptedTask) && taskIdOf(state.acceptedTask) === selectedTaskId;
  const assignmentId = sameAssignment && state.acceptedTask.assignmentId
    ? state.acceptedTask.assignmentId
    : `${dayId}-${steamId}-local-${selectedTaskId}-${now.getTime()}`;
  const acceptedTask = buildTaskSnapshot({
    task,
    assignmentId,
    progress: Math.min(safeProgress, safeTarget),
    target: safeTarget,
    rewardSeasonPoint: safeReward,
    round: Number(state.currentRound || 1),
    totalRounds: Number(state.totalRounds || 3),
  });
  return {
    acceptedTask,
    acceptedAt: sameAssignment && state.acceptedAt ? state.acceptedAt : now,
    progress: acceptedTask.progress,
    updatedAt: now,
  };
}

function buildGlobalUpdates({
  task,
  dayId,
  steamId,
  progress,
  target,
  playerContribution,
  rewards,
  existingTiers,
  existingTask,
  existingProgress,
  existingContribution,
  now,
}) {
  if (task.scope !== 'global') fail('Selected task is not a global task');
  const safeProgress = asNumber(progress, 'Global progress');
  const safeTarget = asNumber(target, 'Global target', { min: 1 });
  const safeContribution = asNumber(playerContribution, 'Player contribution');
  const tiers = {
    topPercent: asNumber(existingTiers?.topPercent ?? 10, 'Top percent'),
    middlePercent: asNumber(existingTiers?.middlePercent ?? 30, 'Middle percent'),
    topRewardSeasonPoint: asNumber(rewards.topRewardSeasonPoint, 'Top reward', { integer: true }),
    middleRewardSeasonPoint: asNumber(rewards.middleRewardSeasonPoint, 'Middle reward', { integer: true }),
    baseRewardSeasonPoint: asNumber(rewards.baseRewardSeasonPoint, 'Base reward', { integer: true }),
  };
  const selectedTaskId = taskIdOf(task);
  if (!selectedTaskId) fail('Selected global task has no id');
  const sameAssignment = Boolean(existingTask) && taskIdOf(existingTask) === selectedTaskId;
  const assignmentId = sameAssignment && existingTask.assignmentId
    ? existingTask.assignmentId
    : `${dayId}-global-local-${selectedTaskId}-${now.getTime()}`;
  const previousProgress = asNumber(existingProgress ?? safeProgress, 'Existing global progress');
  const previousContribution =
    sameAssignment &&
    existingContribution?.assignmentId === assignmentId &&
    existingContribution?.metric === task.metric
      ? asNumber(existingContribution.value ?? 0, 'Existing player contribution')
      : 0;
  const progressWasEdited = safeProgress !== previousProgress;
  const synchronizedProgress = !sameAssignment || progressWasEdited
    ? Math.max(safeProgress, safeContribution)
    : Math.max(0, previousProgress - previousContribution) + safeContribution;
  const globalTask = buildTaskSnapshot({
    task,
    assignmentId,
    progress: synchronizedProgress,
    target: safeTarget,
    rewardSeasonPoint: tiers.topRewardSeasonPoint,
  });
  return {
    day: {
      globalTask,
      globalRewardTiers: tiers,
      globalProgress: synchronizedProgress,
      globalCompleted: synchronizedProgress >= safeTarget,
      updatedAt: now,
    },
    player: {
      globalTask,
      globalRewardTiers: tiers,
      updatedAt: now,
    },
    contribution: {
      id: `${dayId}_${steamId}`,
      dayId,
      steamId: Number(steamId),
      assignmentId,
      metric: task.metric,
      value: safeContribution,
      updatedAt: now,
    },
  };
}

function buildPointTotals(player, seasonDelta, memberDelta) {
  const seasonPointTotal = Number(player.seasonPointTotal || 0) + asNumber(seasonDelta, 'Season point delta', { min: -Number.MAX_SAFE_INTEGER });
  const memberPointTotal = Number(player.memberPointTotal || 0) + asNumber(memberDelta, 'Member point delta', { min: -Number.MAX_SAFE_INTEGER });
  if (seasonPointTotal < 0 || memberPointTotal < 0) fail('Point totals cannot be negative');
  return { seasonPointTotal, memberPointTotal };
}

function buildRewardLedger({ dayId, steamId, source, seasonPoint, now, nonce }) {
  if (!['personal', 'global', 'streak'].includes(source)) fail(`Invalid reward source: ${source}`);
  const safePoints = asNumber(seasonPoint, 'Reward season points', { integer: true, min: 1 });
  return {
    id: `local_gui_${dayId}_${steamId}_${nonce}`,
    dayId,
    steamId: Number(steamId),
    source,
    seasonPoint: safePoints,
    notificationStatus: 'pending',
    createdAt: now,
  };
}

function getFirebase() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== EXPECTED_EMULATOR_HOST) {
    fail(`Refusing database operation: FIRESTORE_EMULATOR_HOST must be ${EXPECTED_EMULATOR_HOST}`);
  }
  let initializeApp;
  let getApps;
  let getFirestore;
  let FieldValue;
  try {
    ({ initializeApp, getApps } = require(path.join(API_NODE_MODULES, 'firebase-admin', 'lib', 'app')));
    ({ getFirestore, FieldValue } = require(path.join(API_NODE_MODULES, 'firebase-admin', 'lib', 'firestore')));
  } catch (error) {
    fail(`Cannot load firebase-admin from ${API_NODE_MODULES}: ${error.message || error}`);
  }
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return { db: getFirestore(), FieldValue };
}

function updateTimeMillis(snapshot) {
  return snapshot?.updateTime ? snapshot.updateTime.toMillis() : null;
}

function assertUpdateTime(snapshot, expected, label) {
  const actual = updateTimeMillis(snapshot);
  if (!snapshot.exists) fail(`${label} no longer exists; refresh the GUI`);
  if (String(actual) !== String(expected)) fail(`${label} changed after the last refresh; refresh before saving`);
}

function assertPersonalSaveVersion(snapshot, payload, provisioned) {
  if (payload.forceOverride === true) {
    if (!snapshot.exists) fail('Player daily challenge no longer exists; refresh the GUI');
    return;
  }
  if (!provisioned || payload.expectedPlayerStateUpdateTime !== null) {
    assertUpdateTime(snapshot, payload.expectedPlayerStateUpdateTime, 'Player daily challenge');
  } else if (!snapshot.exists) {
    fail('Player daily challenge was not created; refresh the GUI');
  }
}

function normalize(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function taskLabel(task) {
  const taskId = taskIdOf(task);
  const title = task?.title?.cn || taskId || '\u672a\u547d\u540d\u4efb\u52a1';
  const scope = task?.scope === 'global' ? '\u5171\u540c' : task?.scope === 'personal_hero' ? '\u82f1\u96c4' : '\u4e2a\u4eba';
  const metric = task?.metric ? ` | ${task.metric}` : '';
  return `[${scope}] ${title} (${taskId || 'unknown'}${metric})`;
}

function taskSearchText(task) {
  return [
    taskIdOf(task),
    task?.scope,
    task?.metric,
    task?.heroName,
    task?.unit,
    task?.category,
    task?.title?.cn,
    task?.title?.en,
    task?.title?.ru,
    ...(Array.isArray(task?.groupTags) ? task.groupTags : []),
    ...(Array.isArray(task?.mutexTags) ? task.mutexTags : []),
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .join(' ')
    .toLocaleLowerCase();
}

function uniqueTasks(tasks) {
  const map = new Map();
  for (const task of tasks.filter(Boolean)) {
    const normalizedTask = copyTask(task);
    if (!map.has(normalizedTask.taskId)) {
      map.set(normalizedTask.taskId, {
        ...normalize(normalizedTask),
        label: taskLabel(normalizedTask),
        searchText: taskSearchText(normalizedTask),
      });
    }
  }
  return [...map.values()];
}

async function readPublishedConfig(db) {
  const pointer = await db.collection('daily_challenge_config').doc('published').get();
  const versionId = pointer.data()?.versionId;
  if (!versionId) return null;
  const version = await db.collection('daily_challenge_config_versions').doc(versionId).get();
  return version.exists ? version.data()?.snapshot ?? null : null;
}

async function getSummary(dayId) {
  const { db } = getFirebase();
  const steamId = Number(STEAM_ID);
  const [statesSnapshot, daysSnapshot, playerSnapshot, rewardsSnapshot, config] = await Promise.all([
    db.collection('player_daily_challenges').where('steamId', '==', steamId).get(),
    db.collection('daily_challenge_days').get(),
    db.collection('Players').doc(STEAM_ID).get(),
    db.collection('daily_challenge_reward_ledger').where('steamId', '==', steamId).get(),
    readPublishedConfig(db),
  ]);
  if (!playerSnapshot.exists) fail(`Local player ${STEAM_ID} is missing`);
  const dayRows = daysSnapshot.docs.map((doc) => ({ dayId: doc.id, ...doc.data() }));
  const daysById = new Map(dayRows.map((item) => [item.dayId, item]));
  const stateRows = statesSnapshot.docs.map((doc) => ({ ...doc.data(), status: daysById.get(doc.data().dayId)?.status }));
  const statesByDayId = new Map(stateRows.map((item) => [item.dayId, item]));
  const selectableDays = dayRows.map((item) => ({
    ...item,
    acceptedTask: statesByDayId.get(item.dayId)?.acceptedTask,
  }));
  const selectedDayId = dayId || selectDefaultDay(selectableDays);
  if (!selectedDayId) fail('No daily challenge day exists in the local database');
  const stateSnapshot = statesSnapshot.docs.find((doc) => doc.data().dayId === selectedDayId);
  const daySnapshot = daysSnapshot.docs.find((doc) => doc.id === selectedDayId);
  if (!daySnapshot) fail(`Daily challenge day ${selectedDayId} no longer exists`);
  const state = stateSnapshot?.data() || {};
  const day = daySnapshot.data();
  const contributionSnapshot = await db.collection('daily_challenge_global_contributions').doc(`${selectedDayId}_${STEAM_ID}`).get();
  const player = playerSnapshot.data() || {};
  const configTasks = Array.isArray(config?.tasks) ? config.tasks : [];
  const personalTasks = uniqueTasks([
    state.acceptedTask,
    ...(Array.isArray(state.candidates) ? state.candidates : []),
    ...configTasks.filter((task) => String(task.scope || '').startsWith('personal_') && task.enabled !== false),
  ]);
  const globalTasks = uniqueTasks([
    day.globalTask,
    state.globalTask,
    ...configTasks.filter((task) => task.scope === 'global' && task.enabled !== false),
  ]);
  const rewards = rewardsSnapshot.docs
    .map((doc) => ({ ...normalize(doc.data()), id: doc.id }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 20)
    .map((item) => ({ ...item, label: `${item.createdAt || ''} | ${item.source} | +${item.seasonPoint}` }));
  return {
    steamId,
    dayIds: [...new Set(dayRows.map((item) => item.dayId))].sort().reverse(),
    selectedDayId,
    tokens: {
      playerState: updateTimeMillis(stateSnapshot),
      day: updateTimeMillis(daySnapshot),
      points: updateTimeMillis(playerSnapshot),
    },
    points: {
      seasonPointTotal: Number(player.seasonPointTotal || 0),
      usedSeasonPoint: Number(player.usedSeasonPoint || 0),
      seasonPointAvailable: Number(player.seasonPointTotal || 0) - Number(player.usedSeasonPoint || 0),
      memberPointTotal: Number(player.memberPointTotal || 0),
      usedMemberPoint: Number(player.usedMemberPoint || 0),
      memberPointAvailable: Number(player.memberPointTotal || 0) - Number(player.usedMemberPoint || 0),
    },
    personal: {
      state: normalize(state),
      tasks: personalTasks,
      selectedTaskId: selectedTaskIdOf(state.acceptedTask),
    },
    global: {
      day: normalize(day),
      playerContribution: Number(contributionSnapshot.data()?.value || 0),
      tasks: globalTasks,
      selectedTaskId: selectedTaskIdOf(day.globalTask),
    },
    rewards,
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 10000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          reject(new Error(`Daily challenge API returned HTTP ${response.statusCode || 500}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Daily challenge API returned invalid JSON: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Daily challenge API request timed out')));
    request.on('error', reject);
  });
}

async function ensurePlayerStateForSave(db, dayId) {
  const stateRef = db.collection('player_daily_challenges').doc(`${dayId}_${STEAM_ID}`);
  const before = await stateRef.get();
  if (before.exists) return false;

  let snapshot;
  try {
    snapshot = await requestJson(`${API_BASE}/daily-challenge/snapshot?steamId=${STEAM_ID}`);
  } catch (error) {
    fail(`Player has not loaded today's task yet and the local daily challenge API could not create it: ${error.message}`);
  }
  if (String(snapshot?.dayId || '') !== String(dayId)) {
    fail(`Local daily challenge API created day ${snapshot?.dayId || 'unknown'}, but the GUI selected ${dayId}`);
  }
  const after = await stateRef.get();
  if (!after.exists) fail(`Local daily challenge API did not create player state for ${dayId}`);
  return true;
}

function readInput(filePath) {
  if (!filePath || !fs.existsSync(filePath)) fail('Input JSON file is missing');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function savePersonal(payload) {
  const { db } = getFirebase();
  const stateRef = db.collection('player_daily_challenges').doc(`${payload.dayId}_${STEAM_ID}`);
  const provisioned = await ensurePlayerStateForSave(db, payload.dayId);
  const config = await readPublishedConfig(db);
  return db.runTransaction(async (transaction) => {
    const stateSnapshot = await transaction.get(stateRef);
    assertPersonalSaveVersion(stateSnapshot, payload, provisioned);
    const state = stateSnapshot.data();
    const task = [state.acceptedTask, ...(state.candidates || []), ...(config?.tasks || [])].find(
      (item) => taskIdOf(item) === payload.taskId,
    );
    if (!task) fail(`Personal task not found: ${payload.taskId}`);
    const update = buildPersonalStateUpdate({
      state,
      task,
      dayId: payload.dayId,
      steamId: STEAM_ID,
      progress: payload.progress,
      target: payload.target,
      rewardSeasonPoint: payload.rewardSeasonPoint,
      now: new Date(),
    });
    transaction.update(stateRef, update);
    return { ok: true };
  });
}

async function saveGlobal(payload) {
  const { db } = getFirebase();
  const dayRef = db.collection('daily_challenge_days').doc(payload.dayId);
  const stateRef = db.collection('player_daily_challenges').doc(`${payload.dayId}_${STEAM_ID}`);
  const contributionRef = db.collection('daily_challenge_global_contributions').doc(`${payload.dayId}_${STEAM_ID}`);
  const provisioned = await ensurePlayerStateForSave(db, payload.dayId);
  const config = await readPublishedConfig(db);
  return db.runTransaction(async (transaction) => {
    const [daySnapshot, stateSnapshot, contributionSnapshot] = await transaction.getAll(dayRef, stateRef, contributionRef);
    assertUpdateTime(daySnapshot, payload.expectedDayUpdateTime, 'Daily challenge day');
    if (!provisioned || payload.expectedPlayerStateUpdateTime !== null) {
      assertUpdateTime(stateSnapshot, payload.expectedPlayerStateUpdateTime, 'Player daily challenge');
    } else if (!stateSnapshot.exists) {
      fail('Player daily challenge was not created; refresh the GUI');
    }
    const day = daySnapshot.data();
    const state = stateSnapshot.data();
    const task = [day.globalTask, state.globalTask, ...(config?.tasks || [])].find(
      (item) => taskIdOf(item) === payload.taskId,
    );
    if (!task) fail(`Global task not found: ${payload.taskId}`);
    const updates = buildGlobalUpdates({
      task,
      dayId: payload.dayId,
      steamId: STEAM_ID,
      progress: payload.progress,
      target: payload.target,
      playerContribution: payload.playerContribution,
      rewards: payload.rewards,
      existingTiers: day.globalRewardTiers,
      existingTask: day.globalTask,
      existingProgress: day.globalProgress,
      existingContribution: contributionSnapshot.exists ? contributionSnapshot.data() : null,
      now: new Date(),
    });
    transaction.update(dayRef, updates.day);
    transaction.update(stateRef, updates.player);
    transaction.set(contributionRef, {
      ...updates.contribution,
      createdAt: contributionSnapshot.exists ? contributionSnapshot.data().createdAt : new Date(),
    });
    return { ok: true };
  });
}

async function applyPointDelta(payload) {
  const { db } = getFirebase();
  const playerRef = db.collection('Players').doc(STEAM_ID);
  return db.runTransaction(async (transaction) => {
    const playerSnapshot = await transaction.get(playerRef);
    assertUpdateTime(playerSnapshot, payload.expectedPointsUpdateTime, 'Player points');
    const totals = buildPointTotals(playerSnapshot.data() || {}, payload.seasonDelta, payload.memberDelta);
    transaction.update(playerRef, totals);
    return { ok: true, totals };
  });
}

async function grantReward(payload) {
  const { db } = getFirebase();
  const playerRef = db.collection('Players').doc(STEAM_ID);
  const stateRef = db.collection('player_daily_challenges').doc(`${payload.dayId}_${STEAM_ID}`);
  const now = new Date();
  const nonce = `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
  const ledger = buildRewardLedger({
    dayId: payload.dayId,
    steamId: Number(STEAM_ID),
    source: payload.source,
    seasonPoint: payload.seasonPoint,
    now,
    nonce,
  });
  const ledgerRef = db.collection('daily_challenge_reward_ledger').doc(ledger.id);
  return db.runTransaction(async (transaction) => {
    const [playerSnapshot, stateSnapshot] = await transaction.getAll(playerRef, stateRef);
    assertUpdateTime(playerSnapshot, payload.expectedPointsUpdateTime, 'Player points');
    assertUpdateTime(stateSnapshot, payload.expectedPlayerStateUpdateTime, 'Player daily challenge');
    const totals = buildPointTotals(playerSnapshot.data() || {}, ledger.seasonPoint, 0);
    transaction.update(playerRef, totals);
    transaction.update(stateRef, {
      unreadRewardCount: Number(stateSnapshot.data()?.unreadRewardCount || 0) + 1,
      updatedAt: now,
    });
    transaction.create(ledgerRef, ledger);
    return { ok: true, ledgerId: ledger.id, totals };
  });
}

async function runCli() {
  const command = process.argv[2] || 'get';
  let result;
  if (command === 'get') {
    result = await getSummary(process.argv[3]);
  } else {
    const payload = readInput(process.argv[3]);
    if (command === 'save-personal') result = await savePersonal(payload);
    else if (command === 'save-global') result = await saveGlobal(payload);
    else if (command === 'apply-points') result = await applyPointDelta(payload);
    else if (command === 'grant-reward') result = await grantReward(payload);
    else fail(`Unknown command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(normalize(result))}\n`);
}

module.exports = {
  selectDefaultDay,
  buildPersonalStateUpdate,
  buildGlobalUpdates,
  buildPointTotals,
  buildRewardLedger,
  taskSearchText,
  selectedTaskIdOf,
  assertPersonalSaveVersion,
};

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
