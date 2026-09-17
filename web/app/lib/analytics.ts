export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';

type GtagValue = string | number | boolean | null | undefined;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** 记录一个事件。脚本被网络拦截或没配测量 ID 时静默丢弃，统计不影响页面功能 */
export function trackEvent(name: string, params?: Record<string, GtagValue>) {
  window.gtag?.('event', name, params);
}

/** 把玩家 ID 挂到后续事件上，退出时传 null 解除，否则下一个登录的人会记在上一个人名下 */
export function setAnalyticsUserId(uid: string | null) {
  window.gtag?.('set', { user_id: uid });
}
