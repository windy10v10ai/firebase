// 离线快照导出脚本，背景见 windy10v10ai 仓库 docs/superpowers/specs/2026-09-16-offline-snapshot-design.md。
// 本地脚本，只读 Firestore，不新增线上端点。凭据来自运行时的 gcloud 身份（`gcloud auth application-default login`）。
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import {
  CollectionReference,
  DocumentReference,
  Firestore,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';

import { PlayerLevelHelper } from '../../src/player/helpers/player-level.helper';

import { KvObject, serializeKvFile } from './kv-writer';

const PROJECT_ID = 'windy10v10ai';

// 会员到期日窗口：含最近一年内过期的，付费权益不与活跃度绑定，回来时必须仍然生效
const MEMBER_EXPIRE_WINDOW_DAYS = 365;
// Players 最近对局窗口：每周随地图重新下载，不活跃玩家的展示数据不值得让所有人多背流量
const PLAYER_LAST_MATCH_WINDOW_DAYS = 365;

const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'output');
// Firestore getAll 单批建议大小，避免一次性拉几千个 DocumentReference
const BATCH_GET_SIZE = 300;

interface MemberDoc {
  expireDate: Timestamp;
  level: number;
}

interface PlayerDoc {
  seasonPointTotal?: number;
  memberPointTotal?: number;
  usedSeasonPoint?: number;
  usedMemberPoint?: number;
}

interface PropertyDoc {
  properties: { name: string; level: number }[];
}

interface AwakeningDoc {
  awakenings: { heroName: string }[];
}

interface SettingDoc {
  isRememberAbilityKey?: boolean;
  activeAbilityKey?: string;
  passiveAbilityKey?: string;
  passiveAbilityKey2?: string;
  activeAbilityQuickCast?: boolean;
  passiveAbilityQuickCast?: boolean;
  passiveAbilityQuickCast2?: boolean;
  inventorySlot7Key?: string;
  inventorySlot7QuickCast?: boolean;
  inventorySlot8Key?: string;
  inventorySlot8QuickCast?: boolean;
  inventorySlot9Key?: string;
  inventorySlot9QuickCast?: boolean;
  wardObserverKey?: string;
  wardObserverQuickCast?: boolean;
  wardSentryKey?: string;
  wardSentryQuickCast?: boolean;
  gamePresetDota?: { difficulty: number };
  gamePresetHard?: { difficulty: number };
  gamePresetCustom?: { gameOptions: Record<string, string | number> };
}

// 非默认值才写进 KV：大部分玩家从没改过键位，省略即代表默认（未改键/未开快速施法）
const SETTING_STRING_FIELDS = [
  'activeAbilityKey',
  'passiveAbilityKey',
  'passiveAbilityKey2',
  'inventorySlot7Key',
  'inventorySlot8Key',
  'inventorySlot9Key',
  'wardObserverKey',
  'wardSentryKey',
] as const;

const SETTING_BOOLEAN_FIELDS = [
  'isRememberAbilityKey',
  'activeAbilityQuickCast',
  'passiveAbilityQuickCast',
  'passiveAbilityQuickCast2',
  'inventorySlot7QuickCast',
  'inventorySlot8QuickCast',
  'inventorySlot9QuickCast',
  'wardObserverQuickCast',
  'wardSentryQuickCast',
] as const;

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function toUnixSeconds(timestamp: Timestamp): number {
  return Math.floor(timestamp.toMillis() / 1000);
}

async function fetchByIds<T extends FirebaseFirestore.DocumentData>(
  db: Firestore,
  collectionName: string,
  ids: string[],
): Promise<FirebaseFirestore.DocumentSnapshot<T>[]> {
  const collection = db.collection(collectionName) as CollectionReference<T>;
  const results: FirebaseFirestore.DocumentSnapshot<T>[] = [];

  for (let i = 0; i < ids.length; i += BATCH_GET_SIZE) {
    const chunk = ids.slice(i, i + BATCH_GET_SIZE);
    const refs = chunk.map((id) => collection.doc(id) as DocumentReference<T>);
    const docs = (await db.getAll(...refs)) as FirebaseFirestore.DocumentSnapshot<T>[];
    results.push(...docs);
  }
  return results;
}

async function fetchExtraPlayers(
  db: Firestore,
  steamIds: string[],
): Promise<Map<string, PlayerDoc>> {
  const docs = await fetchByIds<PlayerDoc>(db, 'Players', steamIds);
  const result = new Map<string, PlayerDoc>();
  for (const doc of docs) {
    if (doc.exists) {
      result.set(doc.id, doc.data() as PlayerDoc);
    }
  }
  return result;
}

function buildMemberSnapshot(memberDocs: FirebaseFirestore.QueryDocumentSnapshot[]): KvObject {
  const out: KvObject = {};
  for (const doc of memberDocs) {
    const data = doc.data() as MemberDoc;
    out[doc.id] = {
      level: data.level,
      expireDate: toUnixSeconds(data.expireDate),
    };
  }
  return out;
}

function buildPlayerSnapshot(
  players: Map<string, PlayerDoc>,
  propertiesById: Map<string, PropertyDoc>,
): KvObject {
  const out: KvObject = {};
  for (const [steamId, player] of players) {
    const seasonPointTotal = player.seasonPointTotal ?? 0;
    const memberPointTotal = player.memberPointTotal ?? 0;
    const usedSeasonPoint = player.usedSeasonPoint ?? 0;
    const usedMemberPoint = player.usedMemberPoint ?? 0;

    const record: KvObject = {
      seasonPointTotal,
      memberPointTotal,
      useableSeasonPoint: Math.max(0, seasonPointTotal - usedSeasonPoint),
      useableMemberPoint: Math.max(0, memberPointTotal - usedMemberPoint),
      seasonLevel: PlayerLevelHelper.getSeasonLevelBuyPoint(seasonPointTotal),
      memberLevel: PlayerLevelHelper.getMemberLevelBuyPoint(memberPointTotal),
    };

    const properties = propertiesById.get(steamId)?.properties.filter((p) => p.level > 0) ?? [];
    if (properties.length > 0) {
      const propertiesOut: KvObject = {};
      for (const property of properties) {
        propertiesOut[property.name] = property.level;
      }
      record.properties = propertiesOut;
    }

    out[steamId] = record;
  }
  return out;
}

function buildAwakenSnapshot(awakeningDocs: FirebaseFirestore.QueryDocumentSnapshot[]): KvObject {
  const out: KvObject = {};
  for (const doc of awakeningDocs) {
    const data = doc.data() as AwakeningDoc;
    if (!data.awakenings || data.awakenings.length === 0) continue;

    const record: KvObject = {};
    data.awakenings.forEach((item, index) => {
      record[String(index + 1)] = item.heroName;
    });
    out[doc.id] = record;
  }
  return out;
}

function buildSettingSnapshot(
  settingDocs: FirebaseFirestore.DocumentSnapshot<SettingDoc>[],
): KvObject {
  const out: KvObject = {};
  for (const doc of settingDocs) {
    if (!doc.exists) continue;
    const data = doc.data() as SettingDoc;
    const record: KvObject = {};

    for (const field of SETTING_STRING_FIELDS) {
      const value = data[field];
      if (value) record[field] = value;
    }
    for (const field of SETTING_BOOLEAN_FIELDS) {
      if (data[field]) record[field] = 1;
    }
    if (data.gamePresetDota) record.gamePresetDota = data.gamePresetDota.difficulty;
    if (data.gamePresetHard) record.gamePresetHard = data.gamePresetHard.difficulty;
    if (data.gamePresetCustom) {
      const optionsOut: KvObject = {};
      for (const [key, value] of Object.entries(data.gamePresetCustom.gameOptions)) {
        optionsOut[key] = value;
      }
      record.gamePresetCustom = optionsOut;
    }

    if (Object.keys(record).length > 0) {
      out[doc.id] = record;
    }
  }
  return out;
}

function writeKvFile(outputDir: string, fileName: string, rootKey: string, data: KvObject): void {
  const content = serializeKvFile(rootKey, data);
  const filePath = path.join(outputDir, fileName);
  writeFileSync(filePath, content, 'utf8');

  const rowCount = Object.keys(data).length;
  const byteSize = Buffer.byteLength(content, 'utf8');
  console.info(`${fileName}: ${rowCount} 行, ${byteSize} 字节`);
}

async function main(): Promise<void> {
  const outputDir = process.argv[2] ?? DEFAULT_OUTPUT_DIR;
  mkdirSync(outputDir, { recursive: true });

  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
  const db = getFirestore();

  const [memberSnapshot, playerSnapshot, propertySnapshot, awakeningSnapshot] = await Promise.all([
    db.collection('Members').where('expireDate', '>', daysAgo(MEMBER_EXPIRE_WINDOW_DAYS)).get(),
    db
      .collection('Players')
      .where('lastMatchTime', '>', daysAgo(PLAYER_LAST_MATCH_WINDOW_DAYS))
      .get(),
    db.collection('PlayerProperties').get(),
    db.collection('PlayerHeroAwakenings').get(),
  ]);

  const playersById = new Map<string, PlayerDoc>(
    playerSnapshot.docs.map((doc) => [doc.id, doc.data() as PlayerDoc]),
  );
  const propertiesById = new Map<string, PropertyDoc>(
    propertySnapshot.docs.map((doc) => [doc.id, doc.data() as PropertyDoc]),
  );

  // 属性与觉醒名单里的 steamId，对应的 Players 行无条件一起取，不受活跃窗口限制
  const extraSteamIds = new Set<string>();
  for (const doc of propertySnapshot.docs) {
    if (!playersById.has(doc.id)) extraSteamIds.add(doc.id);
  }
  for (const doc of awakeningSnapshot.docs) {
    if (!playersById.has(doc.id)) extraSteamIds.add(doc.id);
  }
  const extraPlayers = await fetchExtraPlayers(db, [...extraSteamIds]);
  for (const [steamId, player] of extraPlayers) {
    playersById.set(steamId, player);
  }

  // 快捷键设置跟 Players 活跃窗口取交集：按已知 steamId 精确取，不用全量扫描省 Firestore 读取
  const settingDocs = await fetchByIds<SettingDoc>(db, 'PlayerSettings', [...playersById.keys()]);

  writeKvFile(
    outputDir,
    'player_snapshot_member.kv',
    'player_snapshot_member',
    buildMemberSnapshot(memberSnapshot.docs),
  );
  writeKvFile(
    outputDir,
    'player_snapshot_player.kv',
    'player_snapshot_player',
    buildPlayerSnapshot(playersById, propertiesById),
  );
  writeKvFile(
    outputDir,
    'player_snapshot_awaken.kv',
    'player_snapshot_awaken',
    buildAwakenSnapshot(awakeningSnapshot.docs),
  );
  writeKvFile(
    outputDir,
    'player_snapshot_setting.kv',
    'player_snapshot_setting',
    buildSettingSnapshot(settingDocs),
  );
  // 游戏内离线提示要告诉玩家数据截至哪天，否则看不出是否已同步网站上的改动
  writeKvFile(outputDir, 'player_snapshot_meta.kv', 'player_snapshot_meta', {
    exportedAt: Math.floor(Date.now() / 1000),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
