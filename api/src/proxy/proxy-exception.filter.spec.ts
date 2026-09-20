import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ProxyExceptionFilter } from './proxy-exception.filter';

function createHost(requestId?: string) {
  const response = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  const request = { query: requestId === undefined ? {} : { requestId } };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ProxyExceptionFilter', () => {
  const filter = new ProxyExceptionFilter();

  it.each([
    [new UnauthorizedException(), 'unauthorized'],
    [new ForbiddenException(), 'unauthorized'],
    [new BadRequestException(), 'bad_request'],
    [new NotFoundException(), 'not_found'],
    [new Error('boom'), 'internal'],
  ])('把 %s 转成 ERR:%s，且响应状态码始终是 200', (exception, code) => {
    const { host, response } = createHost('req1');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith(`<!DOCTYPE html><title>req1|ERR:${code}</title>`);
  });

  it('query 里没有 requestId 时，用空字符串占位', () => {
    const { host, response } = createHost(undefined);

    filter.catch(new BadRequestException(), host);

    expect(response.send).toHaveBeenCalledWith('<!DOCTYPE html><title>|ERR:bad_request</title>');
  });
});
