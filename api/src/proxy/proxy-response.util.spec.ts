import { BadRequestException } from '@nestjs/common';
import { logger } from 'firebase-functions';

import {
  buildProxyErrorHtml,
  buildProxySuccessHtml,
  validateRequestId,
} from './proxy-response.util';

describe('validateRequestId', () => {
  it('接受服务端生成格式的 requestId', () => {
    expect(() => validateRequestId('p_1_12345')).not.toThrow();
  });

  it('空字符串抛 BadRequestException', () => {
    expect(() => validateRequestId('')).toThrow(BadRequestException);
  });

  it('包含分隔符 | 之外的非法字符时抛 BadRequestException', () => {
    expect(() => validateRequestId('req|1')).toThrow(BadRequestException);
  });
});

describe('buildProxySuccessHtml', () => {
  it('把 requestId 与 JSON 用 | 拼接，包进 title', () => {
    const html = buildProxySuccessHtml('req1', { a: 1 });

    expect(html).toBe('<!DOCTYPE html><title>req1|{"a":1}</title>');
  });

  it('转义 & < >，避免破坏 title 标签', () => {
    const html = buildProxySuccessHtml('req1', { name: '<a> & b' });

    expect(html).toContain('&lt;a&gt; &amp; b');
    expect(html).not.toContain('<a>');
  });

  it('title 超限时记 warn，带上 requestId 与实际长度', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    buildProxySuccessHtml('req1', 'x'.repeat(4096));

    // requestId + 分隔符 + 4096 个字符加两侧引号
    expect(warn).toHaveBeenCalledWith('[Proxy] title too long', {
      requestId: 'req1',
      titleLength: 4 + 1 + 4096 + 2,
    });
    warn.mockRestore();
  });

  it('title 未超限时不记 warn', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    buildProxySuccessHtml('req1', { a: 1 });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('title 长度达到 4096 时改为返回 ERR:too_long', () => {
    const html = buildProxySuccessHtml('req1', 'x'.repeat(4096));

    expect(html).toBe('<!DOCTYPE html><title>req1|ERR:too_long</title>');
  });

  it('title 长度刚好低于 4096 时正常返回', () => {
    const requestId = 'req1';
    const targetTitleLength = 4095;
    // JSON.stringify(str) 比原字符串多两个引号
    const payloadLength = targetTitleLength - `${requestId}|`.length - 2;

    const html = buildProxySuccessHtml(requestId, 'x'.repeat(payloadLength));

    const title = html.slice('<!DOCTYPE html><title>'.length, -'</title>'.length);
    expect(title.length).toBe(targetTitleLength);
    expect(html).not.toContain('too_long');
  });
});

describe('buildProxyErrorHtml', () => {
  it('拼出 ERR:<code> 格式', () => {
    expect(buildProxyErrorHtml('req1', 'not_found')).toBe(
      '<!DOCTYPE html><title>req1|ERR:not_found</title>',
    );
  });
});
