import { auth } from '@/config/firebase';

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed with status code ${status}`);
    this.name = 'ApiError';
  }
}

export const apiFetch = async <Response>(path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  // 首屏按提示 cookie 渲染时 SDK 可能还没恢复出用户，不等的话已登录玩家的请求会被当成匿名发出去
  await auth.authStateReady();
  // 有登录态就带上，没有就当匿名请求发出去，由 API 侧决定这条路由要不要求身份
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }

  // 同源请求：部分网络连不到单独的 API 域名，而页面能打开就说明本站域名是通的
  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as Response;
};
