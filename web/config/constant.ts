// 浏览器直连 API，域名在构建期注入
export const API_DOMAIN = process.env.NEXT_PUBLIC_API_DOMAIN;

export const afdianActiveUrl = `${API_DOMAIN}/api/afdian/order/active`;
export const kofiActiveUrl = `${API_DOMAIN}/api/kofi/order/active`;

// 误连生产 API 在页面上没有任何表现，启动时把实际域名打出来
if (process.env.NODE_ENV === 'development') {
  console.info(`[web] NEXT_PUBLIC_API_DOMAIN = ${API_DOMAIN}`);
}
