# api/ 规约

NestJS 后端 API，同时是 Firebase Functions 的源代码。全仓库通用约定见根目录 [CLAUDE.md](../CLAUDE.md)。

## 本地开发

1. **Firestore emulator**（必须先启动）：`firebase emulators:start --only firestore --project windy10v10ai`
2. **API**（依赖 `FIRESTORE_EMULATOR_HOST=localhost:8080`）：`cd api && npm run start` 或 `npm run start:debug`

## 校验

- **Unit**：`cd api && npm run test`（无需 emulator）
- **E2E**：`cd api && npm run test:e2e`（自带 `firebase emulators:exec`，跑前要确认 8080 没被占用）
- **Lint**：`cd api && npm run lint`

**改了价格、上限这类业务常量，两套都要跑。** `npm run test` 不包含 e2e，单测全绿不代表 e2e 也绿——e2e 里的种子玩家常按旧数值给积分，改价后会因为「积分不够」而失败，而这只有跑 e2e 才看得见。

## 测试写多少

**每条测试都会在每个 PR 的 CI 里重跑，所以按接口的重要程度给预算，不要把分支逐个铺开。** 测试的价值是挡住会造成损失的错误，不是覆盖率数字；写多了只会让每个人的每次提交都多等一会儿。

- **碰积分、会员、支付、扣费的链路**：边界与失败路径都要覆盖。这类错了直接损害玩家，慢一点也值得
- **只读的展示类接口**（昵称头像这种）：一条打通主流程即可，取不到时的兜底顺带在同一条里断言
- **同一段逻辑里的多个阈值**（各种 TTL、各种时长）挑一组有代表性的写一条，不要每个阈值一条
- **guard 的通用行为不逐个接口重复验**，理由与已有的验证位置见下面「常见坑」里那一条
- **能用 unit 覆盖的就不写 e2e**：e2e 要起模拟器，单条的代价比 unit 高一个量级。e2e 只留「这条路由接得通、响应形状对」这类靠 unit 验不到的

## 测试数据构造

**优先调 API 造数据，不要手写 Firestore 文档。**

手写文档的数据形状不经任何校验：字段名拼错、缺字段、类型不符都不会报错，测试通过也不能说明被测代码正确。走 API 时形状由生产代码产生，entity 变更后无需同步修改构造逻辑，并且顺带覆盖了上游链路。

本地凭据在 `api/.env.local` 里，TEST 服务器的 key 是 `apikey`。造一个「已下单但没激活的会员」需要两步，都有现成接口：

```bash
# 建玩家（结算、激活等接口都要求玩家已存在）
curl -H "x-api-key: apikey" "http://localhost:3001/api/game/start?steamIds=<id>&matchId=1&version=test"
# 造一张未激活订单：webhook 的 remark 不放 Dota2 ID，订单会存下来但激活失败
curl -X POST "http://localhost:3001/api/afdian/webhook?token=afdian-webhook" -H "Content-Type: application/json" -d '{...}'
```

**请求体里的业务字段必须取真实值。** 爱发电订单的 `plan_id` 若填一个不存在的值，`getOrderType` 会归入 `OrderType.others`，激活返回 false，而接口仍返回 201，只有日志能看出差别。枚举值取自源码，不要自造。

只有 API 无法构造的状态才直接写 emulator：已过期的会员、线上遗留的旧格式字段、脏数据。此时需在 PR 中说明绕过 API 的原因。

## 常见坑

- `firestore-backup/` 不在仓库里，是从 GCP `gsutil` 拉的；没有它时不要带 `--import` 启动 emulator
- API 通过 `FIRESTORE_EMULATOR_HOST` 连本地 emulator；忘记设这个变量会去连生产 Firestore 然后失败（无凭证）
- Firestore emulator 需要 Java JRE
- E2E 自管 emulator 生命周期；跑之前先杀掉占用 8080 的进程
- **新增顶层路由前缀必须登记到 `api/index.ts` 中 `client` 函数的路径白名单**（那个 `regex` 常量，形如 `^/api/(game|player|...).*`）。不在白名单里的请求在进入 NestJS 之前就被 403 `Invalid path` 拦掉，服务端只留一条 `Abnormal request on API Cloud Function! Path: ...`，controller、guard、e2e 全都看不到任何痕迹——e2e 直连 Nest，不经过这层，所以测试全绿也可能线上 403
- **网站要调的接口必须显式挂 `@AllowWeb()`**（[auth.guard.ts](src/util/auth/auth.guard.ts)），否则网站带 `Authorization: Bearer` 的请求一律 401。架构见 [docs/web/README.md](../docs/web/README.md) 第 2 节
- **`@AllowWeb()` 不等于「只有网站能调」**：不挂任何装饰器时，任何有效的官方服务器 key 都能调，它只是额外放行网页来源，`@AllowLocal()` 同理额外放行本地主机 key。要按来源区分行为或统计，用 `@CurrentServerType()` 取 guard 算出来的来源，不要靠路由挂了什么装饰器去推
- **给已有接口补挂 `@AllowWeb()` 不需要新开 e2e 用例**：归属校验（自己 200 / 别人 403 / 无 token 401）是 `auth.guard.ts` 里对所有带 `:steamId` 路由的通用逻辑，已在 [player-info-web.e2e-spec.ts](test/player-info-web.e2e-spec.ts) 验证过一次，不必逐个接口重复验证。只有装饰器改动之外还有新业务逻辑时才写新用例
- **裸 `/api` 在线上到不了**：Hosting rewrite 是 `^/api/.*`、函数白名单是 `^/api/(game|player|...)`，两个都不匹配，实测 404。要探活用公开端点 `GET /api/hello`
- **functions emulator 会伪造 CORS 头**：它给所有请求套了一层 `cors({ origin: true })`，预检由它直接答、任何 `Origin` 都放行。经 `localhost:5000` 的链路只能验通路，验不了白名单——白名单以 e2e（直连 Nest）和线上为准
- 改了 CORS、鉴权、响应格式这类会影响网站页面行为的东西，最终验证要在浏览器里实际操作页面，做法见 [web/CLAUDE.md](../web/CLAUDE.md) 的「浏览器验证」
- **网站域名的 `/api` 转发驮着支付宝回调**：`ALIPAY_NOTIFY_URL` 指向 `windy10v10ai.com`，请求经 `web/next.config.ts` 的 rewrite 进函数。改那条 rewrite 的目的地要连收款一起验，入口清单见 [docs/api/README.md](../docs/api/README.md) 的「对外入口」

## 命名与文件名

通用命名规则见根目录 [CLAUDE.md](../CLAUDE.md) 的「命名规范」。本目录额外遵守：

- DTO 类后缀 `Dto`，entity 类无后缀（参考 `Player`、`Member`）
- 按职责加文件后缀：`*.controller.ts` / `*.service.ts` / `*.module.ts` / `*.entity.ts` / `*.dto.ts`
- 测试：`*.spec.ts`（unit）、`*.e2e-spec.ts`（e2e）

## Firestore 操作规范

### 删除字段

`undefined` 赋值**不会**删除 Firestore 字段，字段会保留旧值。需要删除字段时必须用 `FieldValue.delete()`：

```ts
import { FieldValue } from 'firebase-admin/firestore';

// ✅ 正确：真正删除字段
preset[dto.map] = FieldValue.delete() as any;

// ❌ 错误：字段不会被删除
preset[dto.map] = undefined;
```

### E2E 测试规范

- **有 Firestore 持久化副作用的 bug 必须先写 e2e 复现（验证 bug 确实发生），再修复，再验证测试通过**
- E2E 用 `test/` 目录下的 `*.e2e-spec.ts`，通过 HTTP 请求验证完整行为（包括持久化后重新读取）
- 各测试用例使用独立 steamId（不同用例间不共享），避免状态污染
- 工具函数放 `test/util/` 下复用

## 模块化模式（player 子模块为例）

新增独立子功能时遵循以下模式：

1. `entities/foo.entity.ts` — Firestore `@Collection()` + 字段定义
2. `dto/update-foo.dto.ts` — 请求体 DTO（class-validator 校验）
3. `foo.service.ts` — 业务逻辑，`getOrGenerateDefault` 负责首次创建
4. `player.module.ts` — `FireormModule.forFeature` 注册 entity，`providers`/`exports` 注册 service
5. `player.controller.ts` — 添加路由，鉴权与现有接口一致
6. 若新增的是**顶层路由前缀**（不在既有 `game`/`player`/`alipay` 等之下），同步更新 `api/index.ts` 的路径白名单（见「常见坑」）
