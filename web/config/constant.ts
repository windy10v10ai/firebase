// 浏览器直连 API，域名在构建期注入
export const API_DOMAIN = process.env.NEXT_PUBLIC_API_DOMAIN;

export const afdianActiveUrl = `${API_DOMAIN}/api/afdian/order/active`;
export const kofiActiveUrl = `${API_DOMAIN}/api/kofi/order/active`;
