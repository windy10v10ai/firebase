import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

import { ProxyErrorCode, buildProxyErrorHtml } from './proxy-response.util';

const STATUS_ERROR_CODE: Partial<Record<number, ProxyErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'unauthorized',
  [HttpStatus.NOT_FOUND]: 'not_found',
};

// 网页控件读不到非 200 的 title，所有异常（鉴权、参数校验、业务抛出）都要转成
// 200 + <title>requestId|ERR:<code></title>，让客户端能立刻读到失败原因
@Catch()
export class ProxyExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.query.requestId as string) ?? '';

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = STATUS_ERROR_CODE[status] ?? 'internal';

    if (code === 'internal') {
      logger.error('[Proxy] unhandled exception', { requestId, exception });
    }

    response.status(HttpStatus.OK).type('html').send(buildProxyErrorHtml(requestId, code));
  }
}
