# 支付宝订单码支付（当面付）接入方案

## Context

游戏端目前通过 Afdian（爱发电 Webhook + 轮询）和 Ko-fi（Webhook）发放会员/积分礼包。国内玩家缺少便捷支付通道。本次新增**支付宝订单码支付（alipay.trade.precreate）**：

- game 端调 Firebase Cloud Function（NestJS） → 后端生成 `out_trade_no` → 调用支付宝 precreate → 拿到 `qr_code` 字符串
- API 只回 `qr_code` 字符串，游戏端用本地 QR 库自行渲染图片
- 支付宝异步通知（webhook）回到 cloudfunction，验签后落库并发放奖励
- 游戏端轮询查询接口拿到 `SUCCESS` 状态，结束流程
- 沙箱/生产通过环境变量切换 gateway

复用 [afdian](api/src/afdian) / [kofi](api/src/kofi) 的目录结构、Secret 管理、Members/Player 奖励发放等约定，最大限度减少差异。

> **与 afdian/kofi 的主要差异**：订单创建时 steamId 已由客户端明确传入，无需 User 表做 userId→steamId 反查；webhook 丢失时由用户手动触发补单，不做定时回扫。

---

## 数据流总览

```
game ──(POST /api/alipay/order/create  {steamId, productCode})──▶ cloudfunction
                                                                     │
                                                                     ├─ 生成 outTradeNo = "ali-{steamId}-{ts}-{rand}"
                                                                     ├─ 写 AlipayOrder { status: WAITING, steamId, productCode, totalAmount }
                                                                     ├─ 调 alipay.trade.precreate(out_trade_no, total_amount, subject, notify_url)
                                                                     └─ 返回 { outTradeNo, qrCode, totalAmount, expiresAt }

game ──(用 qr_code 字符串本地渲染二维码)
game ──(每 2s 轮询 GET /api/alipay/order/query?outTradeNo=xxx)──▶ cloudfunction
                                                                     └─ 返回 { status: WAITING|SUCCESS|CLOSED }

用户扫码付款
  │
  ▼
支付宝服务器 ──(POST /api/alipay/webhook  application/x-www-form-urlencoded)──▶ cloudfunction
                                                                                  │
                                                                                  ├─ RSA2 验签（alipay-sdk checkNotifySign）
                                                                                  ├─ 幂等：outTradeNo 已 SUCCESS 直接回 "success"
                                                                                  ├─ 校验 trade_status === TRADE_SUCCESS && total_amount 匹配
                                                                                  ├─ 更新订单 SUCCESS、应用奖励（MembersService / PlayerService）
                                                                                  ├─ 发 GA4 purchase 事件
                                                                                  └─ 返回 plain text "success"

webhook 丢失时（用户手动补单）
game ──(POST /api/alipay/order/active  {steamId, outTradeNo})──▶ cloudfunction
                                                                     ├─ 验证 order.steamId === 请求 steamId
                                                                     ├─ 调 alipay.trade.query 确认支付宝侧已付款
                                                                     ├─ 幂等：已 SUCCESS 直接返回成功
                                                                     └─ 走同款激活逻辑
```

---

## 模块结构

新增 `api/src/alipay/`，对齐 [afdian.module.ts](api/src/afdian/afdian.module.ts) 的写法：

```
api/src/alipay/
  alipay.module.ts
  alipay.controller.ts            REST 端点
  alipay.service.ts               业务逻辑（创建/查询/激活/奖励）
  alipay.api.service.ts           包装 alipay-sdk（precreate/query/cancel/checkSign）
  alipay.constants.ts             productCode → 价格/奖励 映射表
  entities/
    alipay-order.entity.ts        Firestore 订单实体（带 outTradeNo 索引）
  dto/
    create-alipay-order.dto.ts    入参 {steamId, productCode, quantity?}
    create-alipay-order-response.dto.ts  出参 {outTradeNo, qrCode, totalAmount, expiresAt}
    query-alipay-order.dto.ts     {outTradeNo}
    alipay-notify.dto.ts          支付宝异步通知字段
    active-alipay-order.dto.ts    手工补单 {outTradeNo, steamId}
  enums/
    alipay-product-code.enum.ts   MEMBER_PREMIUM / POINTS_TIER1..3
    alipay-trade-status.enum.ts   WAITING / SUCCESS / CLOSED / FAILED
```

---

## REST 端点

挂在 NestJS `@Controller('alipay')`，由 `client` Cloud Function 路由（[index.ts:54](api/index.ts) 的 regex 需加 `alipay`）。

| Method | Path | 说明 | Body / Query |
|--------|------|-----|--------------|
| POST | `/api/alipay/order/create` | 生成订单 + 二维码 | `{ steamId: number, productCode: AlipayProductCode, quantity?: number }` |
| GET  | `/api/alipay/order/query` | game 轮询用 | `?outTradeNo=xxx` |
| POST | `/api/alipay/webhook` | 支付宝异步通知 | `application/x-www-form-urlencoded`（不要 JSON parser） |
| POST | `/api/alipay/order/active` | 后台/手工补单 | `{ outTradeNo, steamId }` 复用 [admin pattern](api/src/afdian/afdian.controller.ts) |

**create 返回示例：**
```json
{
  "outTradeNo": "ali-123456789-1714600000000-ab12",
  "qrCode": "https://qr.alipay.com/bax03206rqipznwqounm00a8",
  "totalAmount": "28.00",
  "subject": "Premium 会员",
  "expiresAt": "2026-05-02T12:00:00Z"
}
```

---

## 商品/价格表（`alipay.constants.ts`）

按用户答复，**首期仅卖单份**，后续扩展份数折扣 / 首充优惠：

### 定价对比

| 商品 | Afdian 原价 | Afdian 会员价 | **支付宝价** | vs 原价折扣 | 积分单价（分/元） |
|------|-----------|------------|------------|-----------|--------------|
| 会员/月 | ¥29.80 | — | **¥28.00** | 93.9折 | — |
| 3500 积分 | ¥98.00 | ¥80.00 | **¥78.00** | 79.6折 | 44.87 |
| 11000 积分 | ¥280.00 | ¥246.00 | **¥238.00** | 85.0折 | 46.22 |
| 28000 积分 | ¥648.00 | ¥596.00 | **¥568.00** | 87.7折 | 49.30 |

> 会员定价 ¥28.00，支付宝净收 ¥27.83，略低于 Afdian 净收 ¥28.01，属于有意让利。

```ts
export enum AlipayProductCode {
  MEMBER_PREMIUM = 'MEMBER_PREMIUM',   // 会员，月数由 quantity 决定
  POINTS_TIER1   = 'POINTS_TIER1',
  POINTS_TIER2   = 'POINTS_TIER2',
  POINTS_TIER3   = 'POINTS_TIER3',
}

// priceCentPerUnit：单份价格（分）；quantity 传几份就乘几倍
// reward 中不含 month，month = quantity，由 service 计算
export const ALIPAY_PRODUCT_TABLE: Record<AlipayProductCode, AlipayProductSpec> = {
  MEMBER_PREMIUM: { subjectUnit: 'Premium 会员', priceCentPerUnit: 2800, reward: { kind: 'member', level: PREMIUM } },
  POINTS_TIER1:   { subjectUnit: '积分礼包 3500',  priceCentPerUnit: 7800,  reward: { kind: 'points', points: 3500 } },
  POINTS_TIER2:   { subjectUnit: '积分礼包 11000', priceCentPerUnit: 23800, reward: { kind: 'points', points: 11000 } },
  POINTS_TIER3:   { subjectUnit: '积分礼包 28000', priceCentPerUnit: 56800, reward: { kind: 'points', points: 28000 } },
};
```

**quantity 语义**：
- 会员：quantity = 月数（`POST { productCode: "MEMBER_PREMIUM", quantity: 3 }` → 3 个月，¥84.00）
- 积分：首期固定 quantity=1；后续扩展多份时直接传数量

**未来扩展位（已留口）**：
- 折扣阶梯表（3/12/36 月会员折扣、积分多份折扣）
- `firstOrderDiscount` 标志：根据 `AlipayOrder` 是否存在该 steamId 的 SUCCESS 历史决定
- 价格/折扣计算收敛到 `AlipayService.calculatePrice(productCode, quantity, isFirstOrder)`，奖励发放复用 `MembersService.createMember()` 和 `PlayerService.upsertAddPoint()`（已实现）

---

## 实体设计

### `AlipayOrder`（Firestore，参考 [afdian-order.entity.ts](api/src/afdian/entities/afdian-order.entity.ts)）

```ts
@Collection('alipay-order')
class AlipayOrder {
  id: string;                     // outTradeNo（同时作为主键 + 索引）
  outTradeNo: string;
  steamId: number;
  productCode: AlipayProductCode;
  quantity: number;               // 默认 1
  totalAmountCent: number;        // 内部分单位
  subject: string;
  status: AlipayTradeStatus;      // WAITING / SUCCESS / CLOSED / FAILED
  alipayTradeNo?: string;         // 支付宝侧 trade_no（webhook 回写）
  buyerLogonId?: string;
  buyerUserId?: string;
  gmtPayment?: Date;
  rawNotify?: Record<string, any>;// 异步通知原始字段（审计）
  createdAt: Date;
  updatedAt: Date;
  qrCode: string;                 // precreate 返回的扫码串
  qrCodeExpiresAt: Date;          // 创建时 +2h（支付宝硬限制）
}
```

### `AlipayUser`（buyer ↔ steamId，参考 [kofi-user.entity.ts](api/src/kofi/entities/kofi-user.entity.ts)）

```ts
@Collection('alipay-user')
class AlipayUser {
  id: string;          // buyer_user_id
  buyerUserId: string;
  buyerLogonId?: string;
  steamId: number;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## SDK 与签名

**用 `alipay-sdk` npm 包**（蚂蚁官方维护，TypeScript 友好，自带验签）：
- `npm i alipay-sdk` 加到 [api/package.json](api/package.json) dependencies

`AlipayApiService` 持有一个 SDK 单例（lazy init，从 secret 读 key）：

```ts
const sdk = new AlipaySdk({
  appId,
  privateKey,                 // SECRET.ALIPAY_APP_PRIVATE_KEY (PKCS8)
  alipayPublicKey,            // SECRET.ALIPAY_PUBLIC_KEY
  signType: 'RSA2',
  gateway: env === 'sandbox'
    ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    : 'https://openapi.alipay.com/gateway.do',
  charset: 'utf-8',
});
```

封装方法：
- `precreate(outTradeNo, amountYuan, subject, notifyUrl): Promise<{ qrCode }>`
- `query(outTradeNo): Promise<TradeQueryResult>`
- `cancel(outTradeNo): Promise<void>`
- `verifyNotifySign(params: Record<string,string>): boolean`（用 SDK 的 `checkNotifySign`）

---

## Secrets

[secret.service.ts](api/src/util/secret/secret.service.ts) 的 `SECRET` 枚举增加：

```ts
ALIPAY_APP_ID = 'ALIPAY_APP_ID',
ALIPAY_APP_PRIVATE_KEY = 'ALIPAY_APP_PRIVATE_KEY',  // PKCS8 PEM
ALIPAY_PUBLIC_KEY = 'ALIPAY_PUBLIC_KEY',            // 支付宝公钥 PEM
```

非 secret 配置（走 `.env.${ENVIRONMENT}` + ConfigModule）：
- `ALIPAY_ENV=sandbox|prod`
- `ALIPAY_NOTIFY_URL=https://<your-cf-domain>/api/alipay/webhook`

[index.ts:34](api/index.ts) 的 `commonSecrets` 数组在 prod 分支增加 3 个 `defineSecret(...)`。

**沙箱密钥**走同样 3 个 secret 名，部署到 dev/test 环境时填沙箱值即可。

---

## Webhook 验签与 body 解析

主应用 [index.ts:21](api/index.ts) 设了 `bodyParser: false`，已在 [kofi.controller.ts](api/src/kofi/kofi.controller.ts) 处理过 form-urlencoded。Alipay webhook 同样是 `application/x-www-form-urlencoded`，需要：

1. 在 `AlipayController` 的 webhook 路由上挂 `express.urlencoded({ extended: false })` 中间件（参考 kofi 写法）
2. 把 `req.body` 整体（含 `sign`/`sign_type`）传给 `verifyNotifySign`
3. 验签失败：返回 `failure`（支付宝会重试至多 8 次）
4. 验签成功后业务处理完毕，**必须**回 `success` 纯文本字符串

幂等：`AlipayOrder.id = outTradeNo`，重复通知用 `findById` 命中后若 `status === SUCCESS` 直接回 `success`。

---

## 奖励发放（复用现有服务）

`AlipayService.applyRewards(order)` 根据 `ALIPAY_PRODUCT_TABLE[productCode].reward.kind` 分发：

- `member` → [`MembersService.createMember({ steamId, month, level })`](api/src/members/members.service.ts)
- `points` → [`PlayerService.upsertAddPoint(steamId, points)`](api/src/player)
- 成功后写 `AlipayUser` + 调 `AnalyticsService.alipayPurchase(...)`（新增一个，类比 `afdianPurchase` / `kofiPurchase`）

---

## webhook 丢失兜底

不做定时回扫。用户在支付宝账单页可看到「商家订单号」，通过游戏界面手动触发 `POST /api/alipay/order/active` 补单。二维码 2 小时到期未付款的订单，支付宝自动关单，Firestore 侧保持 WAITING 即可（历史记录，无需主动清理）。

---

## 客户端调用方式

### A. 本地沙箱联调（终端生成二维码）

```bash
# 1. 调 create order 拿到 qrCode 字符串
curl -X POST http://localhost:5001/windy10v10ai/asia-northeast1/client/api/alipay/order/create \
  -H "Content-Type: application/json" \
  -H "x-api-key: Invalid_NotOnDedicatedServer" \
  -d '{"steamId":123456,"productCode":"MEMBER_PREMIUM","quantity":1}'

# 2. 终端渲染二维码
npx qrcode "<上一步返回的 qrCode 字符串>"
```

用支付宝沙箱 App（仅 Android）扫码完成测试；无 Android 设备时，直接手动 POST webhook 模拟支付回调。

> **注意**：真实支付宝 App 扫沙箱二维码会提示"订单已过期"，这是正常现象，沙箱订单只能用沙箱 App 扫。

### B. 游戏端正式接入（后期）
1. `POST {API_DOMAIN}/api/alipay/order/create` → `{ steamId, productCode: "MEMBER_PREMIUM", quantity: 1 }`
2. 拿到 `qrCode` 字符串后用本地 QR 库（如 Lua 的 `qrcode.lua`）生成图像贴在 UI 上
3. 启动 2s 间隔轮询 `GET /api/alipay/order/query?outTradeNo=...`，`SUCCESS` 关弹窗刷新；`CLOSED` 提示重试
4. 弹窗关闭时停止轮询；服务端不依赖客户端通知，webhook 才是真相

---

## 分阶段实施步骤

共 **5 步**，Step 1–2 已完成。Step 1–3 全程沙箱，Step 4 上线，Step 5 上线后补充用户自助补单。

### ✅ Step 1 — 文档落地（已完成）
- 方案另存到 `docs/alipay-payment.md`

### ✅ Step 2 — Alipay 模块骨架 + 创建二维码接口（已完成）
- `api/package.json` 加 `alipay-sdk` 依赖；`npm install`
- [secret.service.ts](api/src/util/secret/secret.service.ts) 加 3 个枚举值（`ALIPAY_APP_ID` / `ALIPAY_APP_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY`）
- [index.ts](api/index.ts) `commonSecrets` prod 分支登记 3 个 secret；路由 regex 加 `alipay`
- `api/.env.local` 占位填沙箱默认值
- 新建 [api/src/alipay/](api/src/alipay) 目录，包含 module / controller / service / api.service / constants / entity / dto / enum
- 实现 `POST /api/alipay/order/create`：生成 `outTradeNo`、写 `AlipayOrder(status=WAITING)`、调 `alipay.trade.precreate`、返回 `{ outTradeNo, qrCode, totalAmount, subject, expiresAt }`
- 实现 `AlipayApiService.precreate()` 包装 SDK
- `app.module.ts` imports 加 `AlipayModule`
- 验收：`npm run build` 通过；`curl POST` 拿到 qrCode 字符串；Firestore 看到 WAITING 订单

### Step 3 — 查询接口 + Webhook 验签 + 奖励发放（沙箱完整流程）
- `GET /api/alipay/order/query?outTradeNo=xxx`：直接读 Firestore 返回 `{ status }`
- `POST /api/alipay/webhook`：
  - 接 form-urlencoded 中间件（参考 [kofi.controller.ts](api/src/kofi/kofi.controller.ts)）
  - SDK `checkNotifySign` 验签；`total_amount` 与订单匹配校验
  - 幂等：`status===SUCCESS` 直接回 `success`
  - 调 `applyRewards()` → `MembersService.createMember` 或 `PlayerService.upsertAddPoint`
  - 发 GA4 `alipayPurchase` 事件；回 `success` 纯文本
- 单测：验签失败拒绝、金额不符拒绝、重复通知幂等、奖励正确分发
- 验收：`npx qrcode <qrCode>` 生成二维码 → 沙箱 App 扫码付款（或手动 POST webhook 模拟）→ Firestore 订单变 SUCCESS → 会员/积分到账

### Step 4 — 上线（生产配置 + 灰度部署）
**代码变更：** 无（仅配置）

**支付宝控制台操作：**
1. 密钥工具生成 PKCS8 RSA2 密钥对 → 上传应用公钥 → 拿支付宝公钥
2. 填写应用网关（异步通知地址）：`https://asia-northeast1-<project>.cloudfunctions.net/client/api/alipay/webhook`

**Firebase 操作：**
```bash
firebase functions:secrets:set ALIPAY_APP_ID
firebase functions:secrets:set ALIPAY_APP_PRIVATE_KEY
firebase functions:secrets:set ALIPAY_PUBLIC_KEY
```
- `.env.production` 设 `ALIPAY_ENV=prod`（notify URL 在支付宝控制台配置，无需环境变量）
- 先放开 1 个 productCode（`MEMBER_PREMIUM`）观察 1–2 周，确认 webhook 到账率
- 验收：真实支付宝付款 → 订单 SUCCESS → 会员到账

### Step 5 — 手动补单接口
> 场景：webhook 延迟/失败，用户在支付宝账单页看到「商家订单号」，在游戏界面输入后自助补单。

- `POST /api/alipay/order/active { steamId, outTradeNo }`
- 后端逻辑：
  1. 验证 `order.steamId === 请求 steamId`（防止他人用你的订单号）
  2. 调 `alipay.trade.query` 确认支付宝侧已付款（防止伪造未付款订单）
  3. 幂等：已 SUCCESS 直接返回成功
  4. 调 `applyRewards()`
- 验收：手动将一条订单设为 WAITING → 用游戏客户端输入 outTradeNo → 奖励到账；用非本人 steamId 调用 → 403

### 未来可选项（所有 Step 完成后视需求实施）

- **动态定价 / 折扣**：新增 `GET /api/alipay/order/price` 查询接口，返回原价与实际价；`AlipayService.calculatePrice(productCode, quantity, steamId)` 根据 SUCCESS 历史决定首次折扣；前端改为先查价格展示再下单
- **定时回扫清理 WAITING 数据**：若 WAITING 订单量积累较多影响查询性能，可复用 `scheduledOrderCheck` 的 30 分钟节奏，扫描超过 2h 的 WAITING 订单调 `alipay.trade.query`，已关单则标记 CLOSED

---

## 改动文件清单

新增：
- `api/src/alipay/alipay.module.ts`
- `api/src/alipay/alipay.controller.ts`
- `api/src/alipay/alipay.service.ts`
- `api/src/alipay/alipay.api.service.ts`
- `api/src/alipay/alipay.constants.ts`
- `api/src/alipay/entities/alipay-order.entity.ts`
- `api/src/alipay/dto/*.ts`（create / create-response / query / notify / active 共 5 个）
- `api/src/alipay/enums/*.ts`（2 个 enum）
- `api/src/alipay/alipay.service.spec.ts`（单测：价格表、奖励分发、签名验证 mock）

修改：
- [api/index.ts](api/index.ts)：① 路由 regex 加 `alipay`；② `commonSecrets` prod 分支加 3 个 alipay secret
- [api/src/app.module.ts](api/src/app.module.ts)：imports 加 `AlipayModule`
- [api/src/util/secret/secret.service.ts](api/src/util/secret/secret.service.ts)：`SECRET` 枚举加 3 项
- [api/src/analytics](api/src/analytics)：新增 `alipayPurchase` 方法（类比现有 `kofiPurchase`/`afdianPurchase`）
- [api/package.json](api/package.json)：`alipay-sdk` 依赖
- `api/.env.local`：补 `ALIPAY_ENV=sandbox`、`ALIPAY_NOTIFY_URL`（仅本地 ngrok 用）、沙箱 3 个 secret 占位值

---

## 验证步骤

1. **单元测试**：`npm --prefix api test alipay`
   - 价格映射正确
   - 奖励分发按 `productCode` 调用对应 service（用 mock）
   - 异步通知幂等（重复同 outTradeNo 不重复发奖）
   - `total_amount` 不匹配应拒绝

2. **本地沙箱联调**：
   - `firebase emulators:start --only functions,firestore`
   - `curl POST http://localhost:5001/.../api/alipay/order/create` 拿 `qrCode`
   - `npx qrcode <qrCode>` 在终端打印二维码
   - 手动 POST `/api/alipay/webhook` 模拟支付回调（无需 ngrok）
   - 观察 Firestore `alipay-order` 文档 `status: WAITING → SUCCESS`，对应 steamId 的会员/积分到账

3. **轮询接口验证**：
   - 在订单 WAITING 时 `GET /api/alipay/order/query?outTradeNo=xxx` → `WAITING`
   - 沙箱付款后再查 → `SUCCESS`

4. **手动补单验证**：沙箱付款后手动将订单重置为 WAITING，调 `POST /api/alipay/order/active` → 奖励到账；用非本人 steamId 调用 → 返回 403

5. **生产灰度**：先开放 1 个 productCode（`MEMBER_PREMIUM`），观察 1–2 周 webhook 成功率，再放开全部

6. **回归**：跑现有 afdian/kofi 单测确保 SECRET 改动没破坏其他模块。
