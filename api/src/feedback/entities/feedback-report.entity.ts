import { Collection } from 'fireorm';

export const FEEDBACK_SOURCES = ['launcher', 'game'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_TYPES = ['problem', 'suggestion'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

// 与 docs/design/launcher-feedback 的分类表一一对应，AI 汇总时据此转成仓库标签
export const FEEDBACK_TOPICS = [
  'hero',
  'ability',
  'awaken',
  'item',
  'bot',
  'balance',
  'ui',
  'member',
  'lag',
  'launcher',
  'web',
  'game',
] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export const LAUNCHER_MODES = ['solo', 'host', 'join'] as const;
export type LauncherMode = (typeof LAUNCHER_MODES)[number];

export interface LauncherError {
  message: string;
  stage?: string;
  detail?: string;
}

export interface GameOptions {
  multiplierRadiant?: number;
  multiplierDire?: number;
  playerNumberRadiant?: number;
  playerNumberDire?: number;
  towerPowerPct?: number;
  respawnTimePct?: number;
}

/** 玩家点发送时的游戏现场，字段名与结算保持一致。 */
export interface GameState {
  gameTimeMsec?: number;
  playerCount?: number;
  /** 0 为自定义，1 到 8 对应 N1 到 N8 */
  difficulty?: number;
  gameOptions?: GameOptions;
  /** 这局跑在玩家自己的机器上，而不是服务器主机 */
  localHost?: boolean;
  /** 这局没连上服务器 */
  offline?: boolean;
  heroName?: string;
  level?: number;
  awaken?: number;
  strength?: number;
  agility?: number;
  intellect?: number;
  items?: string[];
  neutralItem?: string;
  neutralPassiveItem?: string;
  abilities?: string[];
}

export interface FeedbackConnection {
  path: string;
  rttMs?: number;
  lossPct?: number;
  roomCode?: string;
}

/** 玩家的一份问题报告或建议。 */
@Collection('FeedbackReports')
export class FeedbackReport {
  id: string;
  source: FeedbackSource;
  type: FeedbackType;
  topics: FeedbackTopic[];
  /** 玩家提交时为空，汇总时补更细的标签 */
  tags: string[];
  description: string;
  steamId?: number;
  /** 启动器读注册表上报的 ID 可以伪造，只有登录态给的才可信 */
  steamIdVerified: boolean;
  launcherVersion?: string;
  mapVersion?: string;
  windowsVersion?: string;
  mode?: LauncherMode;
  launcherError?: LauncherError;
  /** 只有加入别人房间时才有 */
  connection?: FeedbackConnection;
  /** 只有来源为游戏时才有 */
  gameState?: GameState;
  /** gs:// 路径 */
  serverLog?: string;
  clientLog?: string;
  country?: string;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理 */
  expireAt: Date;
}
