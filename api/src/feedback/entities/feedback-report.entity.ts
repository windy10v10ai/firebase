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
] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export const LAUNCHER_MODES = ['solo', 'host', 'join'] as const;
export type LauncherMode = (typeof LAUNCHER_MODES)[number];

export interface LauncherError {
  message: string;
  stage?: string;
  detail?: string;
}

export interface GameState {
  /** 游戏内已进行的秒数 */
  gameTime?: number;
  heroName?: string;
  /** 这局跑在玩家自己的机器上，而不是服务器主机 */
  localHost?: boolean;
  /** 这局没连上服务器 */
  offline?: boolean;
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
