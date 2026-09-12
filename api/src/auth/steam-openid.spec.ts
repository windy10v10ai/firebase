import {
  buildCheckAuthenticationBody,
  isAllowedReturnTo,
  isValidResponse,
  parseAccountId,
} from './steam-openid';

const ALLOWED = ['https://windy10v10ai.com', 'http://localhost:3000'];

describe('isAllowedReturnTo', () => {
  it('白名单内的地址通过，路径和查询串不影响判断', () => {
    expect(isAllowedReturnTo('https://windy10v10ai.com/login/callback?next=%2F', ALLOWED)).toBe(
      true,
    );
  });

  it('白名单外的域名不通过', () => {
    expect(isAllowedReturnTo('https://windy10v10ai.com.evil.net/login/callback', ALLOWED)).toBe(
      false,
    );
  });

  it('协议不同不通过', () => {
    expect(isAllowedReturnTo('http://windy10v10ai.com/login/callback', ALLOWED)).toBe(false);
  });

  it('缺失或不是合法 URL 不通过', () => {
    expect(isAllowedReturnTo(null, ALLOWED)).toBe(false);
    expect(isAllowedReturnTo('/login/callback', ALLOWED)).toBe(false);
  });
});

describe('buildCheckAuthenticationBody', () => {
  it('只改 mode，其余参数原样保留', () => {
    const params = new URLSearchParams({
      'openid.mode': 'id_res',
      'openid.sig': 'abc+/=',
      'openid.signed': 'signed,op_endpoint',
    });

    const body = buildCheckAuthenticationBody(params);

    expect(body.get('openid.mode')).toBe('check_authentication');
    expect(body.get('openid.sig')).toBe('abc+/=');
    expect(body.get('openid.signed')).toBe('signed,op_endpoint');
    expect(params.get('openid.mode')).toBe('id_res');
  });
});

describe('isValidResponse', () => {
  it('认可带回车的响应', () => {
    expect(isValidResponse('ns:http://specs.openid.net/auth/2.0\r\nis_valid:true\r\n')).toBe(true);
  });

  it('false 与缺失都不认可', () => {
    expect(isValidResponse('is_valid:false\n')).toBe(false);
    expect(isValidResponse('ns:http://specs.openid.net/auth/2.0\n')).toBe(false);
  });
});

describe('parseAccountId', () => {
  it('换算成 32 位账号 ID', () => {
    expect(parseAccountId('https://steamcommunity.com/openid/id/76561198096673251')).toBe(
      136407523,
    );
  });

  it('域名或路径不符返回 undefined', () => {
    expect(parseAccountId('https://evil.net/openid/id/76561198096673251')).toBeUndefined();
    expect(parseAccountId('https://steamcommunity.com/openid/id/123')).toBeUndefined();
    expect(parseAccountId(null)).toBeUndefined();
  });

  it('小于偏移量的 ID 返回 undefined', () => {
    expect(
      parseAccountId('https://steamcommunity.com/openid/id/76561197960265728'),
    ).toBeUndefined();
  });
});
