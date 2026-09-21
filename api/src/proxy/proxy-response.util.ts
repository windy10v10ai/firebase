import { BadRequestException } from '@nestjs/common';
import { logger } from 'firebase-functions';

// DOTAHTMLPanel 的 title 超过这个长度会被静默截断，不报错；恰好等于该值时无法区分
// 是完整数据还是被截断，一律当失败处理
const TITLE_MAX_LENGTH = 4096;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type ProxyErrorCode = 'unauthorized' | 'bad_request' | 'not_found' | 'too_long' | 'internal';

export function validateRequestId(requestId: string): void {
  if (!requestId || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new BadRequestException();
  }
}

export function buildProxySuccessHtml(requestId: string, payload: unknown): string {
  const title = `${escapeProxyTitle(requestId)}|${escapeProxyTitle(JSON.stringify(payload))}`;
  if (title.length >= TITLE_MAX_LENGTH) {
    // 超限时客户端只会拿到 too_long，没有日志就无从发现
    logger.warn('[Proxy] title too long', { requestId, titleLength: title.length });
    return buildProxyErrorHtml(requestId, 'too_long');
  }
  return wrapTitleHtml(title);
}

export function buildProxyErrorHtml(requestId: string, code: ProxyErrorCode): string {
  return wrapTitleHtml(`${escapeProxyTitle(requestId)}|ERR:${code}`);
}

function wrapTitleHtml(title: string): string {
  return `<!DOCTYPE html><title>${title}</title>`;
}

function escapeProxyTitle(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
