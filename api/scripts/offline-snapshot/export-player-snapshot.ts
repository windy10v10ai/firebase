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

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function toUnixSeconds(timestamp: Timestamp): number {
  return Math.floor(timestamp.toMillis() / 1000);
}

async function fetchExtraPlayers(
  db: Firestore,
  steamIds: string[],
): Promise<Map<string, PlayerDoc>> {
  const result = new Map<string, PlayerDoc>();
  const playersCollection = db.collection('Players') as CollectionReference<PlayerDoc>;

  for (let i = 0; i < steamIds.length; i += BATCH_GET_SIZE) {
    const chunk = steamIds.slice(i, i + BATCH_GET_SIZE);
    const refs = chunk.map((id) => playersCollection.doc(id) as DocumentReference<PlayerDoc>);
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        result.set(doc.id, doc.data() as PlayerDoc);
      }
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
