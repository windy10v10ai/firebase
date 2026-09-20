import { Injectable, UnauthorizedException } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';

import { SITE_ORIGIN_WHITELIST } from '../util/settings';

import {
  STEAM_OPENID_ENDPOINT,
  buildCheckAuthenticationBody,
  isAllowedReturnTo,
  isValidResponse,
  parseAccountId,
} from './steam-openid';

export interface SteamVerifyResult {
  customToken: string;
  steamId: number;
}

@Injectable()
export class AuthService {
  async verifySteamCallback(openidParams: string): Promise<SteamVerifyResult> {
    const params = new URLSearchParams(openidParams);

    if (params.get('openid.mode') !== 'id_res') {
      throw this.reject('openid.mode 不是 id_res');
    }
    // 回调地址参与签名，不核对的话别人能拿这个接口给自己的站点换 token
    if (!isAllowedReturnTo(params.get('openid.return_to'), SITE_ORIGIN_WHITELIST)) {
      throw this.reject('openid.return_to 不在白名单内');
    }

    const response = await fetch(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      body: buildCheckAuthenticationBody(params),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!response.ok) {
      throw this.reject(`Steam 核对请求失败 ${response.status}`);
    }
    if (!isValidResponse(await response.text())) {
      throw this.reject('Steam 判定签名无效');
    }

    const steamId = parseAccountId(params.get('openid.claimed_id'));
    if (steamId === undefined) {
      throw this.reject('openid.claimed_id 格式不符');
    }

    const customToken = await getAuth().createCustomToken(`${steamId}`);
    logger.info('Steam 登录成功', { steamId });
    return { customToken, steamId };
  }

  // 对外只给 401，不透露是哪一步不通过，避免给探测者提供线索
  private reject(reason: string): UnauthorizedException {
    logger.warn('Steam 登录校验不通过', { reason });
    return new UnauthorizedException();
  }
}
