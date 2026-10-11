import { apiFetch } from './api';

// 以下取值照抄 API 的反馈分类，三处来源共用一套
export const FEEDBACK_TYPES = ['problem', 'suggestion'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

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

export const MAX_TOPICS = 2;
export const MAX_DESCRIPTION_LENGTH = 1000;

export interface FeedbackInput {
  type: FeedbackType;
  topics: FeedbackTopic[];
  description: string;
}

/** 已登录时 ID 由 API 取自登录态；未登录时带上玩家填的 ID，API 记为未验证 */
export function sendFeedback(input: FeedbackInput, typedSteamId?: string) {
  if (typedSteamId === undefined) {
    return apiFetch<void>('/api/feedback/web', { method: 'POST', body: JSON.stringify(input) });
  }
  // 未登录时限频按 ID 计：经网站转发的请求，API 看到的都是同一个转发地址
  return apiFetch<void>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ ...input, source: 'web', steamId: Number(typedSteamId) }),
  });
}
