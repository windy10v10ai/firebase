/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { KofiType } from '../src/kofi/enums/kofi-type.enum';
import { MemberLevel } from '../src/members/entities/members.entity';
import { SECRET } from '../src/util/secret/secret.service';

import { initTest } from './util/util-http';
import { createPlayer, getMemberDto, getPlayer } from './util/util-player';

describe('KofiController (e2e)', () => {
  let app: INestApplication;
  const prefixPath = '/api/kofi';
  const daysPerMonth = 31;

  // 创建基础的 webhook 请求数据
  const createWebhookRequest = (data: Partial<any> = {}) => ({
    verification_token: 'kofi-verification-token',
    message_id: 'test-message-id',
    timestamp: new Date().toISOString(),
    type: KofiType.DONATION,
    is_public: true,
    from_name: 'Test User',
    message: '200010000',
    amount: '4.00',
    url: 'https://ko-fi.com/test',
    email: 'default@example.com',
    currency: 'USD',
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    kofi_transaction_id: 'test-transaction-id',
    shop_items: null,
    tier_name: null,
    shipping: null,
    ...data,
  });

  beforeAll(async () => {
    app = await initTest();
    // 创建测试所需的玩家
    await createPlayer(app, { steamId: 200010001 });
    await createPlayer(app, { steamId: 200010002 });
    await createPlayer(app, { steamId: 200010003 });
    await createPlayer(app, { steamId: 200010004 });
    await createPlayer(app, { steamId: 200010005 });
    await createPlayer(app, { steamId: 200010006 });
    await createPlayer(app, { steamId: 200010007 });

    // 为不同月份测试创建额外的玩家
    await createPlayer(app, { steamId: 200010011 });
    await createPlayer(app, { steamId: 200010012 });
    await createPlayer(app, { steamId: 200010013 });
    await createPlayer(app, { steamId: 200010014 });

    // 为表单格式测试创建额外的玩家
    await createPlayer(app, { steamId: 200010999 });
  });

  afterAll(async () => {
    await app.close();
    // 清除测试环境变量
    delete process.env[SECRET.KOFI_VERIFICATION_TOKEN];
  });

  // ======================== Ko-fi Webhook测试 ========================
  describe('/kofi/webhook (POST)', () => {
    describe('Ko-fi Webhook 异常请求 Validation', () => {
      it('认证失败', async () => {
        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                verification_token: 'wrong-token',
                email: 'auth-failed@example.com',
              }),
            ),
          });

        expect(response.status).toEqual(401);
      });

      it('缺少必要字段', async () => {
        const requestWithoutMessageId = {
          ...createWebhookRequest(),
          email: 'missing-field@example.com',
        };
        delete requestWithoutMessageId.message_id;

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(requestWithoutMessageId),
          });

        expect(response.status).toEqual(400);
      });

      it('异常请求格式', async () => {
        // 测试非JSON格式请求
        const response1 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: 'This is not a valid JSON request',
          });

        expect(response1.status).toEqual(400);

        // 测试空请求体
        const response2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({});

        expect(response2.status).toEqual(400);

        // 测试格式错误的JSON
        const response3 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: '{invalid json}',
          });

        expect(response3.status).toEqual(400);

        // 测试与预期完全不同的数据结构
        const response4 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify({
              some_random_field: 'random_value',
              another_field: 123,
              email: 'abnormal-request@example.com',
            }),
          });

        expect(response4.status).toEqual(400);
      });
    });

    describe('Ko-fi Webhook Content-Type测试', () => {
      it('处理form-data格式请求', async () => {
        const memberId = 200010999;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);

        // 创建表单数据
        const formData = {
          verification_token: 'kofi-verification-token',
          message_id: `form-data-${memberId}`,
          timestamp: new Date().toISOString(),
          type: KofiType.DONATION,
          is_public: true,
          from_name: 'Form Test User',
          message: `${memberId}`,
          amount: '4.00',
          url: 'https://ko-fi.com/form-test',
          email: 'form-data@example.com',
          currency: 'USD',
          is_subscription_payment: false,
          is_first_subscription_payment: false,
          kofi_transaction_id: 'form-transaction-id',
        };

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(formData),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'success');

        // 检查会员期限
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.PREMIUM);
      });
    });

    describe('Ko-fi Webhook开通会员', () => {
      it.each([
        [0.5, 200010011, 2.0, 15, 'halfmonth@example.com', 500], // 0.5个月，约15天
        [1, 200010012, 4.0, 31, 'onemonth@example.com', 1000], // 1个月，31天
        [1.5, 200010013, 6.0, 46, 'onepointfive@example.com', 1500], // 1.5个月，约46天
        [3, 200010014, 12.0, 93, 'threemonths@example.com', 3000], // 3个月，93天
      ])(
        'Ko-fi Webhook捐赠开通高级会员 %s个月',
        async (month, memberId, amount, days, email, point) => {
          const dateExpire = new Date();
          dateExpire.setUTCDate(new Date().getUTCDate() + days);

          const response = await request(app.getHttpServer())
            .post(`${prefixPath}/webhook`)
            .type('form')
            .send({
              data: JSON.stringify(
                createWebhookRequest({
                  message_id: `donation-month-${month}-${memberId}`,
                  message: `${memberId}`,
                  amount: amount.toFixed(2), // 不同金额对应不同月份
                  currency: 'USD',
                  type: KofiType.DONATION,
                  email,
                }),
              ),
            });

          expect(response.status).toEqual(201);
          expect(response.body).toHaveProperty('status', 'success');

          // 检查会员期限
          const memberDto = await getMemberDto(app, memberId);
          expect(memberDto.expireDateString).toEqual(dateExpire.toISOString().split('T')[0]);
          expect(memberDto.enable).toEqual(true);
          expect(memberDto.level).toEqual(MemberLevel.PREMIUM);

          // 检查玩家积分（首次订阅额外获得1000积分）
          const player = await getPlayer(app, memberId);
          expect(player.memberPointTotal).toEqual(point);
        },
      );

      it('Ko-fi Webhook单月捐赠开通高级会员', async () => {
        const memberId = 200010001;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `donation-${memberId}`,
                message: `${memberId}`,
                amount: '4.00', // 单月高级会员（4美元/月）
                currency: 'USD',
                type: KofiType.DONATION,
                email: 'single-donation@example.com',
              }),
            ),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'success');

        // 检查会员期限
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.PREMIUM);
        // 检查玩家积分（首次订阅额外获得1000积分）
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(1000);
      });

      it('Ko-fi Webhook首次订阅获得额外积分', async () => {
        const memberId = 200010002;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `subscription-${memberId}`,
                message: `${memberId}`,
                amount: '4.00',
                currency: 'USD',
                type: KofiType.SUBSCRIPTION,
                is_subscription_payment: true,
                is_first_subscription_payment: true,
                email: 'first-subscription@example.com',
              }),
            ),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'success');

        // 检查会员期限
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.PREMIUM);

        // 检查玩家积分（首次订阅额外获得1000积分）
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(2000);
      });

      it('Ko-fi Webhook多月订阅', async () => {
        const memberId = 200010003;
        const months = 3;
        const dateNextMonths = new Date();
        dateNextMonths.setUTCDate(new Date().getUTCDate() + daysPerMonth * months);

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `subscription-multi-${memberId}`,
                message: `${memberId}`,
                amount: `${4.0 * months}`, // 多个月份的高级会员（4美元/月）
                currency: 'USD',
                type: KofiType.SUBSCRIPTION,
                is_subscription_payment: true,
                is_first_subscription_payment: true,
                email: 'multi-month@example.com',
              }),
            ),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'success');

        // 检查会员期限
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonths.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.PREMIUM);

        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(4000); // 3次订阅+首次订阅额外积分
      });

      it('Ko-fi Webhook重复请求', async () => {
        const memberId = 200010004;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);

        // 第一次请求
        const response1 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `duplicate-${memberId}`,
                message: `${memberId}`,
                amount: '4.00',
                currency: 'USD',
                type: KofiType.DONATION,
                email: 'duplicate-request@example.com',
              }),
            ),
          });

        expect(response1.status).toEqual(201);
        expect(response1.body).toHaveProperty('status', 'success');

        // 重复相同的请求
        const response2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `duplicate-${memberId}`, // 相同的message_id
                message: `${memberId}`,
                amount: '4.00',
                currency: 'USD',
                type: KofiType.DONATION,
                email: 'duplicate-request@example.com', // 相同email
              }),
            ),
          });

        expect(response2.status).toEqual(201);
        expect(response2.body).toHaveProperty('status', 'already_processed');

        // 检查会员期限（确保没有重复添加）
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.PREMIUM);
      });

      it('Ko-fi Webhook不支持的货币', async () => {
        const memberId = 200010001;

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `unsupported-currency-${memberId}`,
                message: `${memberId}`,
                amount: '400.00',
                currency: 'JPY', // 不支持的货币
                type: KofiType.DONATION,
                email: 'unsupported-currency@example.com',
              }),
            ),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'failed');
      });

      describe('Ko-fi Webhook SteamID获取测试', () => {
        it.each([
          [
            '从message中获取steamID',
            200010005,
            `${200010005}`, // message
            'Test User', // name
            'message-steam@example.com',
          ],
          [
            '从name中获取steamID',
            200010006,
            '', // message
            `${200010006}`, // name
            'name-steam@example.com',
          ],
        ])('%s', async (_, memberId, message, fromName, email) => {
          const dateNextMonth = new Date();
          dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);

          const response = await request(app.getHttpServer())
            .post(`${prefixPath}/webhook`)
            .type('form')
            .send({
              data: JSON.stringify(
                createWebhookRequest({
                  message_id: `steam-test-${memberId}`,
                  message,
                  from_name: fromName,
                  amount: '4.00',
                  currency: 'USD',
                  type: KofiType.DONATION,
                  email,
                }),
              ),
            });

          expect(response.status).toEqual(201);
          expect(response.body).toHaveProperty('status', 'success');

          // 检查会员期限
          const memberDto = await getMemberDto(app, memberId);
          expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
          expect(memberDto.enable).toEqual(true);
          expect(memberDto.level).toEqual(MemberLevel.PREMIUM);

          // 检查玩家积分
          const player = await getPlayer(app, memberId);
          expect(player.memberPointTotal).toEqual(1000);
        });

        it('Ko-fi 订阅过的用户 从KofiUser中获取steamID', async () => {
          const memberId = 200010007;
          const sharedEmail = 'repeat-user@example.com';

          // 第一次请求，记录email和steamId的关联
          const response1 = await request(app.getHttpServer())
            .post(`${prefixPath}/webhook`)
            .type('form')
            .send({
              data: JSON.stringify(
                createWebhookRequest({
                  message_id: `email-assoc-1-${memberId}`,
                  message: `${memberId}`, // 提供steamId
                  email: sharedEmail,
                  amount: '4.00',
                  currency: 'USD',
                  type: KofiType.DONATION,
                }),
              ),
            });

          expect(response1.status).toEqual(201);
          expect(response1.body).toHaveProperty('status', 'success');

          // 第二次请求，不提供steamId，但使用相同email
          const response2 = await request(app.getHttpServer())
            .post(`${prefixPath}/webhook`)
            .type('form')
            .send({
              data: JSON.stringify(
                createWebhookRequest({
                  message_id: `email-assoc-2-${memberId}`,
                  message: '', // 不提供steamId
                  email: sharedEmail, // 相同email
                  amount: '4.00',
                  currency: 'USD',
                  type: KofiType.DONATION,
                }),
              ),
            });

          expect(response2.status).toEqual(201);
          expect(response2.body).toHaveProperty('status', 'success');

          // 检查会员期限（确认两个月都已添加）
          const twoMonths = 2;
          const dateTwoMonths = new Date();
          dateTwoMonths.setUTCDate(new Date().getUTCDate() + daysPerMonth * twoMonths);

          const memberDto = await getMemberDto(app, memberId);
          expect(memberDto.expireDateString).toEqual(dateTwoMonths.toISOString().split('T')[0]);
          expect(memberDto.enable).toEqual(true);
          expect(memberDto.level).toEqual(MemberLevel.PREMIUM);
        });

        it('Ko-fi Webhook无效steamId', async () => {
          const nonExistingId = 200019999; // 不存在的ID

          const response = await request(app.getHttpServer())
            .post(`${prefixPath}/webhook`)
            .type('form')
            .send({
              data: JSON.stringify(
                createWebhookRequest({
                  message_id: `invalid-steam-${nonExistingId}`,
                  message: `${nonExistingId}`, // 不存在的玩家ID
                  amount: '4.00',
                  currency: 'USD',
                  type: KofiType.DONATION,
                  email: 'invalid-steam@example.com',
                }),
              ),
            });

          expect(response.status).toEqual(201);
          expect(response.body).toHaveProperty('status', 'invalid_steam_id');

          // 确认会员未创建
          try {
            await getMemberDto(app, nonExistingId);
            fail('Member should not exist');
          } catch (error) {
            expect(error.status).toEqual(404);
          }
        });
      });
    });

    describe('Ko-fi Webhook购买商品', () => {
      it.each([
        [
          '单个商品 Tier1 3500积分',
          200010101,
          'single-item-t1@example.com',
          [
            {
              direct_link_code: '74a1b5be84',
              quantity: 1,
              variation_name: null,
            },
          ],
          3500,
        ],
        [
          '单个商品 Tier2 11000积分',
          200010102,
          'single-item-t2@example.com',
          [
            {
              direct_link_code: '0e9591aa5d',
              quantity: 1,
              variation_name: null,
            },
          ],
          11000,
        ],
        [
          '单个商品 Tier3 28000积分',
          200010103,
          'single-item-t3@example.com',
          [
            {
              direct_link_code: '3d4304d9a7',
              quantity: 1,
              variation_name: null,
            },
          ],
          28000,
        ],
        [
          '一个商品多件',
          200010104,
          'multiple-same@example.com',
          [
            {
              direct_link_code: '0e9591aa5d',
              quantity: 2,
              variation_name: null,
            },
          ],
          22000,
        ],
        [
          '多种商品多件',
          200010105,
          'multiple-different@example.com',
          [
            {
              direct_link_code: '74a1b5be84', // Tier1
              quantity: 2,
              variation_name: null,
            },
            {
              direct_link_code: '3d4304d9a7', // Tier3
              quantity: 1,
              variation_name: null,
            },
          ],
          35000,
        ],
      ])('%s', async (_, memberId, email, shopItems, expectedPoints) => {
        // 创建玩家
        await createPlayer(app, { steamId: memberId });

        // 第一次请求，开通单词会员 获得1000积分，并记录email和steamId的关联
        const response1 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `shop-1-${memberId}`,
                message: `${memberId}`,
                email,
                amount: '4.00',
                currency: 'USD',
                type: KofiType.DONATION,
              }),
            ),
          });

        expect(response1.status).toEqual(201);
        expect(response1.body).toHaveProperty('status', 'success');

        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(1000);

        // 第二次请求，不提供steamId，但使用相同email
        const response2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `shop-2-${memberId}`,
                message: '', // 不提供steamId
                email, // 相同email
                amount: '0.00',
                currency: 'USD',
                type: KofiType.SHOP_ORDER,
                shop_items: shopItems,
              }),
            ),
          });

        expect(response2.status).toEqual(201);
        expect(response2.body).toHaveProperty('status', 'success');

        // 检查玩家积分（确认积分已累加）
        const player2 = await getPlayer(app, memberId);
        expect(player2.memberPointTotal).toEqual(expectedPoints + 1000);
      });

      it('商品数量为0', async () => {
        const memberId = 200010191;
        await createPlayer(app, { steamId: memberId });

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `shop-zero-${memberId}`,
                message: `${memberId}`,
                email: 'zero-quantity@example.com',
                amount: '0.00',
                currency: 'USD',
                type: KofiType.SHOP_ORDER,
                shop_items: [
                  {
                    direct_link_code: '74a1b5be84',
                    quantity: 0,
                    variation_name: null,
                  },
                ],
              }),
            ),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'failed');

        // 检查玩家积分（确认没有增加）
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(0);
      });

      it('KofiUser不存在的情况', async () => {
        const memberId = 200010192;
        await createPlayer(app, { steamId: memberId });

        const response = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .type('form')
          .send({
            data: JSON.stringify(
              createWebhookRequest({
                message_id: `shop-no-user-${memberId}`,
                message: '', // 不提供steamId
                email: 'no-kofi-user@example.com', // 未关联的email
                amount: '0.00',
                currency: 'USD',
                type: KofiType.SHOP_ORDER,
                shop_items: [
                  {
                    direct_link_code: '74a1b5be84',
                    quantity: 1,
                    variation_name: null,
                  },
                ],
              }),
            ),
          });

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('status', 'invalid_steam_id');

        // 检查玩家积分（确认没有增加）
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(0);
      });
    });
  });
});
