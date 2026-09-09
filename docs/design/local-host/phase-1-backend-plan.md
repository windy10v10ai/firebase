# 本地主机策略 阶段 1a 后端 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本地主机的 API key 能访问 7 条低风险接口，并对会员积分消耗和支付宝下单加上按 steamId 的每日限额。

**Architecture:** 全局 `AuthGuard` 从「比对 key」改成「解析来源 + 按路由声明放行」，本地 key 只在挂了 `@AllowLocal()` 的路由上通过；限额计数全部复用 `LocalRateLimit` 这一个 Firestore 集合，三个当日计数共用一个日期字段。

**Tech Stack:** NestJS 11 / TypeScript / fireorm + nestjs-fireorm / Firebase Functions / Jest + supertest

**Spec:** `docs/design/local-host/phase-1-backend.md`

## Global Constraints

- 分支：`feature/1105-local-host-phase1-backend`，不在 `develop` 上直接改
- 会员积分：单笔上限 **50**，每日累计上限 **1000**
- 支付宝下单：每日上限 **10** 次，支付成功后清零
- 日切用 **UTC 零点**，与现有本地结算一致
- 限额相关常量一律模块级 `const` + `SCREAMING_SNAKE_CASE`
- 不使用 Firestore 事务：检查与写回之间的空隙允许超出上限一笔，这是设计取舍
- 代码注释用中文，只写「为什么」，不复述代码
- 每个 e2e 用例使用独立 steamId
- 单元测试：`cd api && npm run test`；E2E：`cd api && npm run test:e2e`（先确认 8080 空闲）；Lint：`cd api && npm run lint`
- 任务顺序不可调换：Task 1 是所有放行的前提，Task 3 是 Task 4 / 5 的前提

---

### Task 1: 守卫解析来源 + `@AllowLocal()` / `@CurrentServerType()`

**Files:**
- Create: `api/src/util/auth/allow-local.decorator.ts`
- Create: `api/src/util/auth/server-type.decorator.ts`
- Create: `api/src/util/auth/auth.guard.spec.ts`
- Modify: `api/src/util/auth/auth.guard.ts`

**Interfaces:**
- Consumes: `SecretService.getServerTypeByApiKey(apiKey: string): SERVER_TYPE`（已存在）
- Produces:
  - `ALLOW_LOCAL_KEY: string`、`AllowLocal(): CustomDecorator`
  - `interface RequestWithServerType extends Request { serverType: SERVER_TYPE }`
  - `CurrentServerType(): ParameterDecorator` — handler 注入 `SERVER_TYPE`
  - `AuthGuard` 在放行前把 `serverType` 写入 request

- [ ] **Step 1: 写两个装饰器文件**

`api/src/util/auth/allow-local.decorator.ts`：

```ts
import { SetMetadata } from '@nestjs/common';

export const ALLOW_LOCAL_KEY = 'allowLocal';
export const AllowLocal = () => SetMetadata(ALLOW_LOCAL_KEY, true);
```

`api/src/util/auth/server-type.decorator.ts`：

```ts
import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

import { SERVER_TYPE } from '../secret/secret.service';

export interface RequestWithServerType extends Request {
  serverType: SERVER_TYPE;
}

export const CurrentServerType = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SERVER_TYPE =>
    ctx.switchToHttp().getRequest<RequestWithServerType>().serverType,
);
```

- [ ] **Step 2: 写失败的守卫测试**

新建 `api/src/util/auth/auth.guard.spec.ts`：

```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SERVER_TYPE } from '../secret/secret.service';

import { ALLOW_LOCAL_KEY } from './allow-local.decorator';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithServerType } from './server-type.decorator';

function createContext(apiKey?: string) {
  const request = { headers: apiKey ? { 'x-api-key': apiKey } : {} } as RequestWithServerType;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, request };
}

function createGuard(metadata: Record<string, boolean> = {}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
  const secretService = {
    getServerTypeByApiKey: jest.fn((apiKey: string) => {
      if (apiKey === 'windy-key') return SERVER_TYPE.WINDY;
      if (apiKey === 'local-key') return SERVER_TYPE.LOCAL;
      return SERVER_TYPE.UNKNOWN;
    }),
  };
  return new AuthGuard(reflector, secretService as never);
}

describe('AuthGuard', () => {
  it('官方 key 放行，并把来源写进 request', () => {
    const guard = createGuard();
    const { context, request } = createContext('windy-key');

    expect(guard.canActivate(context)).toBe(true);
    expect(request.serverType).toBe(SERVER_TYPE.WINDY);
  });

  it('未知 key 抛 401', () => {
    const guard = createGuard();
    const { context } = createContext('nope');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('本地 key 未挂 AllowLocal 抛 401', () => {
    const guard = createGuard();
    const { context } = createContext('local-key');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('本地 key 挂了 AllowLocal 放行', () => {
    const guard = createGuard({ [ALLOW_LOCAL_KEY]: true });
    const { context, request } = createContext('local-key');

    expect(guard.canActivate(context)).toBe(true);
    expect(request.serverType).toBe(SERVER_TYPE.LOCAL);
  });

  it('Public 路由直接放行，不解析来源', () => {
    const guard = createGuard({ [IS_PUBLIC_KEY]: true });
    const { context, request } = createContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(request.serverType).toBeUndefined();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd api && npm run test -- auth.guard`
Expected: FAIL，`ALLOW_LOCAL_KEY` 相关断言不通过（本地 key 目前直接 401，挂了装饰器也一样）

- [ ] **Step 4: 改写守卫**

`api/src/util/auth/auth.guard.ts` 整体替换为：

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SERVER_TYPE, SecretService } from '../secret/secret.service';

import { ALLOW_LOCAL_KEY } from './allow-local.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithServerType } from './server-type.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private secretService: SecretService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithServerType>();
    const apiKey = request.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    request.serverType = serverType;

    if (serverType === SERVER_TYPE.UNKNOWN) {
      throw new UnauthorizedException();
    }

    // 本地主机的 key 打包在地图里、随时可能泄露，默认不放行；只有显式声明
    // 接受本地来源的路由才通过
    if (serverType === SERVER_TYPE.LOCAL) {
      const allowLocal = this.reflector.getAllAndOverride<boolean>(ALLOW_LOCAL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowLocal) {
        throw new UnauthorizedException();
      }
    }

    return true;
  }
}
```

构造函数参数名从 `sercretService` 改成 `secretService`，是顺带修正拼写。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd api && npm run test -- auth.guard`
Expected: PASS，5 个用例全绿

- [ ] **Step 6: 跑全量单元测试与 lint**

Run: `cd api && npm run test && npm run lint`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add api/src/util/auth/
git commit -m "$(cat <<'EOF'
Resolve server type in AuthGuard and gate local key per route

Refs #1105

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 放行只读与个人设置接口，改造现有四处手写校验

**Files:**
- Modify: `api/src/player/player.controller.ts`
- Modify: `api/src/player-info/player-info.controller.ts`
- Modify: `api/src/game/game.controller.ts`
- Modify: `api/src/daily-task/daily-task.controller.ts`
- Modify: `api/test/util/util-http.ts`
- Modify: `api/test/game-end-local.e2e-spec.ts`
- Create: `api/test/local-host-allowlist.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `AllowLocal()`、`CurrentServerType()`
- Produces: `getLocalApiKey(): string`（`api/test/util/util-http.ts`），供后续任务的 e2e 复用

- [ ] **Step 1: 给测试工具加本地 key 取值函数**

`api/test/util/util-http.ts` 在 `getAnimeApiKey` 后追加：

```ts
export function getLocalApiKey(): string {
  return process.env.LOCAL_APIKEY ?? 'local-apikey';
}
```

`api/test/game-end-local.e2e-spec.ts` 删掉本文件自己定义的那行 `const localApiKey = process.env.LOCAL_APIKEY ?? 'local-apikey';`，改为从工具导入：

```ts
import { get, getLocalApiKey, getTestApiKey, initTest, mockDate, restoreDate } from './util/util-http';

const localApiKey = getLocalApiKey();
```

- [ ] **Step 2: 写失败的放行名单 e2e**

新建 `api/test/local-host-allowlist.e2e-spec.ts`：

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { getLocalApiKey, initTest } from './util/util-http';
import { createPlayer } from './util/util-player';

const STEAM_ID = 310010001;

describe('本地 key 放行名单 (e2e)', () => {
  let app: INestApplication;
  const localKey = getLocalApiKey();

  beforeAll(async () => {
    app = await initTest();
    await createPlayer(app, {
      steamId: STEAM_ID,
      seasonPointTotal: 5000,
      memberPointTotal: 5000,
      matchCount: 20,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('放行的接口不返回 401', () => {
    it('GET /api/player/ranking', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/player/ranking')
        .set('x-api-key', localKey);
      expect(res.status).not.toBe(401);
    });

    it('GET /api/player/:steamId/info', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/player/${STEAM_ID}/info`)
        .set('x-api-key', localKey);
      expect(res.status).not.toBe(401);
    });

    it('PUT /api/player/:id/setting', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/setting`)
        .set('x-api-key', localKey)
        .send({ isShowNetTable: true });
      expect(res.status).not.toBe(401);
    });

    it('PUT /api/player/:id/game-preset', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/game-preset`)
        .set('x-api-key', localKey)
        .send({ map: 'test_map', preset: { difficulty: 5 } });
      expect(res.status).not.toBe(401);
    });
  });

  describe('未放行的接口返回 401', () => {
    it('PUT /api/player/:steamId/property', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/property`)
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });

    it('DELETE /api/player/:steamId/property', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/player/${STEAM_ID}/property`)
        .set('x-api-key', localKey)
        .query({ useMemberPoint: false });
      expect(res.status).toBe(401);
    });

    it('PUT /api/player/:steamId/hero-awakening', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/hero-awakening`)
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });

    it('PUT /api/player/:steamId/hero-awakening/random', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/hero-awakening/random`)
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });

    it('POST /api/player/conduct', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/player/conduct')
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });
  });

  it('未知 key 打开局接口返回 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/game/start')
      .query({ steamIds: `${STEAM_ID}`, matchId: 1, version: 'v4.05' })
      .set('x-api-key', 'not-a-real-key');
    expect(res.status).toBe(401);
  });
});
```

守卫在校验管道之前执行，所以未放行的接口即使 body 为空也会先拿到 401。

- [ ] **Step 3: 跑 e2e 确认失败**

Run: `cd api && npm run test:e2e -- local-host-allowlist`
Expected: FAIL — 四条「放行」用例返回 401；「未知 key 打开局接口」返回 200

- [ ] **Step 4: 给四条只读与设置路由挂 `@AllowLocal()`**

`api/src/player/player.controller.ts`：`getRanking`、`updatePlayerSetting`、`updatePlayerGamePreset` 三个方法各加一行 `@AllowLocal()`（放在最上面），并 import：

```ts
import { AllowLocal } from '../util/auth/allow-local.decorator';
```

`updatePlayerGamePreset` 另外补一行中文注释，写清路由名和游戏内叫法的对应关系——`game-preset` 这个词在游戏里叫「游戏选项」，不写出来读者对不上：

```ts
  // game-preset 对应游戏内的「游戏选项」
  @AllowLocal()
  @Put(':id/game-preset')
  @ApiOperation({ summary: 'Save or clear a per-map game preset' })
  async updatePlayerGamePreset(
```

`api/src/player-info/player-info.controller.ts`：`getPlayerInfo` 加 `@AllowLocal()`，同样加 import。

- [ ] **Step 5: 改造开局与结算接口**

`api/src/game/game.controller.ts`：

`start` 方法——删掉 `@Public()`、`@Req() req: Request` 参数、以及方法体开头解析 key 和 `UNKNOWN` 分支的六行，改成：

```ts
  @AllowLocal()
  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Query('version') version: string,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<GameStart> {
    steamIds = this.gameService.validateSteamIds(steamIds);
```

`end` 方法签名改成：

```ts
  @ApiBody({ type: GameEndDto })
  @Post('end')
  async end(
    @Body() gameEnd: GameEndDto,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<string> {
```

并删掉方法体开头解析 key 的两行。

`endLocal` 方法改成：

```ts
  @AllowLocal()
  @ApiBody({ type: GameEndDto })
  @Post('end/local')
  async endLocal(
    @Body() gameEnd: GameEndDto,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<string> {
    if (serverType !== SERVER_TYPE.LOCAL) {
      logger.warn('game/end/local: rejected, not a local server key', { serverType });
      return this.gameService.getOK();
    }

    await this.localHostService.settle(gameEnd);
    return this.gameService.getOK();
  }
```

随之清理：构造函数删掉 `private readonly secretService: SecretService,`；import 删掉 `Req`、`Request`、`Public`、`SecretService`、`PlayerInfoDto`；`SERVER_TYPE` 保留；新增

```ts
import { AllowLocal } from '../util/auth/allow-local.decorator';
import { CurrentServerType } from '../util/auth/server-type.decorator';
```

- [ ] **Step 6: 改造每日任务刷新接口**

`api/src/daily-task/daily-task.controller.ts` 整体替换为：

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { AllowLocal } from '../util/auth/allow-local.decorator';

import { DailyTaskSnapshotDto } from './dto/daily-task-snapshot.dto';
import { RefreshDailyTaskDto } from './dto/refresh-daily-task.dto';
import { DailyTaskService } from './services/daily-task.service';

@ApiTags('DailyTask')
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @AllowLocal()
  @ApiBody({ type: RefreshDailyTaskDto })
  @Post('refresh')
  async refresh(@Body() dto: RefreshDailyTaskDto): Promise<DailyTaskSnapshotDto> {
    return this.dailyTaskService.refresh(dto.steamId, dto.dayId);
  }
}
```

- [ ] **Step 7: 跑 e2e 确认通过**

Run: `cd api && npm run test:e2e`
Expected: PASS，含新建的放行名单测试与既有的 `game.e2e-spec` / `game-end-local.e2e-spec` / `daily-task.e2e-spec`

- [ ] **Step 8: 跑单元测试与 lint**

Run: `cd api && npm run test && npm run lint`
Expected: 全部通过

- [ ] **Step 9: 提交**

```bash
git add api/src api/test
git commit -m "$(cat <<'EOF'
Allow local key on read-only and personal setting routes

Replaces the hand-written server type checks in game start, game end,
local settlement and daily task refresh with the AllowLocal decorator.

Refs #1105

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 限流实体改用共用日期字段

**Files:**
- Modify: `api/src/local-host/entities/local-rate-limit.entity.ts`
- Modify: `api/src/local-host/local-host.service.ts`
- Modify: `api/src/local-host/local-host.service.spec.ts`

**Interfaces:**
- Produces:
  - `LocalRateLimit` 字段：`dailyDate?: Date`、`dailySeasonPointTotal?: number`、`dailyMemberPointTotal?: number`、`dailyOrderCount?: number`，`lastRequestAt` / `lastRequestMatchId` 改为可选
  - `LocalHostService` 内部：`interface DailyCounters { seasonPointTotal: number; memberPointTotal: number; orderCount: number }`、模块级 `getDailyCounters(current, today)`、私有 `saveRateLimit(steamId, current, patch)` —— Task 4 / 5 直接复用

- [ ] **Step 1: 写失败的跨日归零测试**

`api/src/local-host/local-host.service.spec.ts` 追加：

```ts
  it('跨日结算时三个当日计数一起归零', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-02T03:00:00.000Z'));
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: new Date('2026-09-01T00:00:00.000Z'),
        dailySeasonPointTotal: 1900,
        dailyMemberPointTotal: 900,
        dailyOrderCount: 9,
      });

      await service.settle(createGameEndDto());

      const saved = store.get('1');
      expect(saved?.dailySeasonPointTotal).toBe(200);
      expect(saved?.dailyMemberPointTotal).toBe(0);
      expect(saved?.dailyOrderCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
```

同时把文件中已有的 `dailyPointsDate` 全部改名为 `dailyDate`、`dailyPointsTotal` 改名为 `dailySeasonPointTotal`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npm run test -- local-host`
Expected: FAIL，编译报错找不到 `dailyDate` 等字段

- [ ] **Step 3: 改实体**

`api/src/local-host/entities/local-rate-limit.entity.ts` 整体替换为：

```ts
import { Collection } from 'fireorm';

// id = steamId
@Collection()
export class LocalRateLimit {
  id: string;
  // 结算之外的限额入口不写这两个字段，所以可选
  lastRequestAt?: Date;
  lastRequestMatchId?: string;
  // 以下三个计数共用 dailyDate，日期对不上时一起归零
  dailyDate?: Date;
  dailySeasonPointTotal?: number;
  dailyMemberPointTotal?: number;
  dailyOrderCount?: number;
}
```

- [ ] **Step 4: 改服务的读写入口**

`api/src/local-host/local-host.service.ts`：

`PlayerCheck` 的 `dailyPointsSoFar: number` 改成 `counters: DailyCounters`，并在 `getUtcMidnight` 下方新增：

```ts
interface DailyCounters {
  seasonPointTotal: number;
  memberPointTotal: number;
  orderCount: number;
}

// 三个计数共用 dailyDate，日期对不上时必须一起归零：只更新其中一个并把日期
// 改成今天，会把另外两个昨天的数字算进今天
function getDailyCounters(current: LocalRateLimit | null, today: Date): DailyCounters {
  if (!current?.dailyDate || current.dailyDate.getTime() !== today.getTime()) {
    return { seasonPointTotal: 0, memberPointTotal: 0, orderCount: 0 };
  }
  return {
    seasonPointTotal: current.dailySeasonPointTotal ?? 0,
    memberPointTotal: current.dailyMemberPointTotal ?? 0,
    orderCount: current.dailyOrderCount ?? 0,
  };
}
```

`checkPlayerLimit` 中，`reject` 的返回值把 `dailyPointsSoFar: 0` 换成 `counters: { seasonPointTotal: 0, memberPointTotal: 0, orderCount: 0 }`；冷却判断加上字段存在性守卫；当日上限判断改成读 `counters`：

```ts
    if (current?.lastRequestAt) {
      const elapsedMs = Date.now() - current.lastRequestAt.getTime();
      if (elapsedMs < COOLDOWN_MS) {
        return reject('cooldown');
      }
    }

    const counters = getDailyCounters(current, getUtcMidnight(new Date()));
    if (counters.seasonPointTotal + battlePoints > DAILY_POINT_CAP) {
      return reject('daily cap exceeded');
    }

    return { steamId, battlePoints, ok: true, current, counters };
```

新增私有写入口，并让 `commitPlayerSettlement` 改用它：

```ts
  private async saveRateLimit(
    steamId: number,
    current: LocalRateLimit | null,
    patch: Partial<LocalRateLimit>,
  ): Promise<void> {
    const next = { ...(current ?? { id: steamId.toString() }), ...patch } as LocalRateLimit;
    if (current) {
      await this.rateLimitRepository.update(next);
    } else {
      await this.rateLimitRepository.create(next);
    }
  }

  private async commitPlayerSettlement(check: PlayerCheck, gameEnd: GameEndDto): Promise<void> {
    const today = getUtcMidnight(new Date());
    await this.saveRateLimit(check.steamId, check.current, {
      lastRequestAt: new Date(),
      lastRequestMatchId: gameEnd.matchId,
      dailyDate: today,
      dailySeasonPointTotal: check.counters.seasonPointTotal + check.battlePoints,
      dailyMemberPointTotal: check.counters.memberPointTotal,
      dailyOrderCount: check.counters.orderCount,
    });

    await this.playerService.addLocalSeasonPoints(check.steamId, check.battlePoints);
    logger.info('game/end/local: settled', {
      matchId: gameEnd.matchId,
      steamId: check.steamId,
      battlePoints: check.battlePoints,
      version: gameEnd.version,
      serverType: 'LOCAL',
    });
  }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd api && npm run test -- local-host`
Expected: PASS，含新增的跨日归零用例

- [ ] **Step 6: 跑 e2e 确认本地结算行为不变**

Run: `cd api && npm run test:e2e -- game-end-local`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add api/src/local-host api/test
git commit -m "$(cat <<'EOF'
Share one daily date across local rate limit counters

Renames dailyPointsDate/dailyPointsTotal and adds the member point and
order counters, all zeroed together when the date rolls over.

Refs #1105

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 会员积分消耗限额

**Files:**
- Modify: `api/src/local-host/local-host.service.ts`
- Modify: `api/src/local-host/local-host.service.spec.ts`
- Modify: `api/src/player-info/player-info.controller.ts`
- Modify: `api/src/player-info/player-info.module.ts`
- Create: `api/test/local-host-member-point-limit.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `getDailyCounters`、`saveRateLimit`
- Produces:
  - `LocalHostService.assertMemberPointWithinLimit(steamId: number, memberPoint: number): Promise<void>` — 超限抛 `BadRequestException`
  - `LocalHostService.recordMemberPointUsage(steamId: number, memberPoint: number, reason: string): Promise<void>`

- [ ] **Step 1: 写失败的限额单元测试**

`api/src/local-host/local-host.service.spec.ts` 追加：

```ts
  describe('会员积分限额', () => {
    it('单笔超过 50 拒绝', async () => {
      const { service } = createService();

      await expect(service.assertMemberPointWithinLimit(1, 51)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('单笔等于 50 通过', async () => {
      const { service } = createService();

      await expect(service.assertMemberPointWithinLimit(1, 50)).resolves.toBeUndefined();
    });

    it('当日累计超过 1000 拒绝', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyMemberPointTotal: 980,
      });

      await expect(service.assertMemberPointWithinLimit(1, 50)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('记账累加当日消耗，不动其他计数', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailySeasonPointTotal: 300,
        dailyMemberPointTotal: 100,
        dailyOrderCount: 2,
      });

      await service.recordMemberPointUsage(1, 20, 'lottery');

      const saved = store.get('1');
      expect(saved?.dailyMemberPointTotal).toBe(120);
      expect(saved?.dailySeasonPointTotal).toBe(300);
      expect(saved?.dailyOrderCount).toBe(2);
    });
  });
```

文件顶部补上 import 与测试用的日期工具：

```ts
import { BadRequestException } from '@nestjs/common';

function getUtcMidnightForTest(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npm run test -- local-host`
Expected: FAIL，`assertMemberPointWithinLimit is not a function`

- [ ] **Step 3: 实现两个限额方法**

`api/src/local-host/local-host.service.ts` 顶部常量区追加：

```ts
const LOCAL_MEMBER_POINT_SINGLE_CAP = 50;
const LOCAL_MEMBER_POINT_DAILY_CAP = 1000;
```

类中追加两个公开方法：

```ts
  /** 本地来源消耗会员积分前的限额检查，超限抛 400。 */
  async assertMemberPointWithinLimit(steamId: number, memberPoint: number): Promise<void> {
    if (memberPoint > LOCAL_MEMBER_POINT_SINGLE_CAP) {
      logger.warn('local: member point rejected', { steamId, memberPoint, reason: 'single cap' });
      throw new BadRequestException();
    }

    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, getUtcMidnight(new Date()));
    if (counters.memberPointTotal + memberPoint > LOCAL_MEMBER_POINT_DAILY_CAP) {
      logger.warn('local: member point rejected', { steamId, memberPoint, reason: 'daily cap' });
      throw new BadRequestException();
    }
  }

  /** 本地来源消耗会员积分成功后累加当日计数。 */
  async recordMemberPointUsage(steamId: number, memberPoint: number, reason: string): Promise<void> {
    const today = getUtcMidnight(new Date());
    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, today);
    await this.saveRateLimit(steamId, current, {
      dailyDate: today,
      dailySeasonPointTotal: counters.seasonPointTotal,
      dailyMemberPointTotal: counters.memberPointTotal + memberPoint,
      dailyOrderCount: counters.orderCount,
    });

    logger.info('local: member point used', { steamId, memberPoint, reason });
  }
```

顶部 import 加 `BadRequestException`：

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && npm run test -- local-host`
Expected: PASS

- [ ] **Step 5: 写失败的限额 e2e**

新建 `api/test/local-host-member-point-limit.e2e-spec.ts`：

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { getLocalApiKey, getTestApiKey, initTest } from './util/util-http';
import { createPlayer } from './util/util-player';

const useUrl = '/api/player/member-points/use';
const STEAM_IDS = {
  SINGLE_CAP: 310020001,
  DAILY_CAP: 310020002,
  OFFICIAL_NOT_LIMITED: 310020003,
} as const;

describe('本地 key 会员积分限额 (e2e)', () => {
  let app: INestApplication;
  const localKey = getLocalApiKey();

  beforeAll(async () => {
    app = await initTest();
    for (const steamId of Object.values(STEAM_IDS)) {
      await createPlayer(app, { steamId, memberPointTotal: 5000 });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('单笔 51 被拒', async () => {
    const res = await request(app.getHttpServer())
      .post(useUrl)
      .set('x-api-key', localKey)
      .send({ steamId: STEAM_IDS.SINGLE_CAP, memberPoint: 51, reason: 'lottery' });

    expect(res.status).toBe(400);
  });

  it('当日累计到 1000 后再消耗被拒', async () => {
    const steamId = STEAM_IDS.DAILY_CAP;
    for (let i = 0; i < 20; i++) {
      const ok = await request(app.getHttpServer())
        .post(useUrl)
        .set('x-api-key', localKey)
        .send({ steamId, memberPoint: 50, reason: 'lottery' });
      expect(ok.status).toBe(201);
    }

    const rejected = await request(app.getHttpServer())
      .post(useUrl)
      .set('x-api-key', localKey)
      .send({ steamId, memberPoint: 1, reason: 'lottery' });

    expect(rejected.status).toBe(400);
  });

  it('官方 key 不受限额约束', async () => {
    const res = await request(app.getHttpServer())
      .post(useUrl)
      .set('x-api-key', getTestApiKey())
      .send({ steamId: STEAM_IDS.OFFICIAL_NOT_LIMITED, memberPoint: 200, reason: 'lottery' });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 6: 跑 e2e 确认失败**

Run: `cd api && npm run test:e2e -- local-host-member-point-limit`
Expected: FAIL，本地 key 目前打这个接口是 401

- [ ] **Step 7: 接线到 controller**

`api/src/player-info/player-info.controller.ts` 的 `useMemberPoint` 改成：

```ts
  @AllowLocal()
  @Post('/member-points/use')
  @ApiOperation({ summary: 'Use available member points' })
  async useMemberPoint(
    @Body() dto: UsePlayerMemberPointsDto,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<PlayerInfoDto> {
    const isLocal = serverType === SERVER_TYPE.LOCAL;
    if (isLocal) {
      await this.localHostService.assertMemberPointWithinLimit(dto.steamId, dto.memberPoint);
    }

    await this.playerService.useMemberPoint(dto);

    // 扣分失败会先抛出，所以记账放在成功之后，失败不占额度
    if (isLocal) {
      await this.localHostService.recordMemberPointUsage(dto.steamId, dto.memberPoint, dto.reason);
    }

    return this.playerInfoService.findPlayerInfoBySteamId(dto.steamId, []);
  }
```

构造函数追加 `private readonly localHostService: LocalHostService,`，并补 import：

```ts
import { LocalHostService } from '../local-host/local-host.service';
import { AllowLocal } from '../util/auth/allow-local.decorator';
import { CurrentServerType } from '../util/auth/server-type.decorator';
import { SERVER_TYPE } from '../util/secret/secret.service';
```

`api/src/player-info/player-info.module.ts` 的 `imports` 追加 `LocalHostModule`：

```ts
import { LocalHostModule } from '../local-host/local-host.module';
```

- [ ] **Step 8: 跑 e2e 确认通过**

Run: `cd api && npm run test:e2e -- local-host-member-point-limit`
Expected: PASS

- [ ] **Step 9: 跑全量校验**

Run: `cd api && npm run test && npm run lint && npm run test:e2e`
Expected: 全部通过

- [ ] **Step 10: 提交**

```bash
git add api/src api/test
git commit -m "$(cat <<'EOF'
Cap member point spending from the local key

Rejects a single spend above 50 and a daily total above 1000 per steamId
when the request comes from the local host key.

Refs #1105

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 支付宝下单限流

**Files:**
- Modify: `api/src/local-host/local-host.service.ts`
- Modify: `api/src/local-host/local-host.service.spec.ts`
- Modify: `api/src/alipay/alipay.controller.ts`
- Modify: `api/src/alipay/alipay.service.ts`
- Modify: `api/src/alipay/alipay.module.ts`
- Modify: `api/test/alipay.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `getDailyCounters`、`saveRateLimit`
- Produces:
  - `LocalHostService.assertOrderWithinLimit(steamId: number): Promise<void>` — 超限抛 `BadRequestException`
  - `LocalHostService.recordOrder(steamId: number): Promise<void>`
  - `LocalHostService.resetOrderCount(steamId: number): Promise<void>`

- [ ] **Step 1: 写失败的下单限流单元测试**

`api/src/local-host/local-host.service.spec.ts` 追加：

```ts
  describe('支付宝下单限流', () => {
    it('当日第 11 次下单被拒', async () => {
      const { service, store } = createService();
      store.set('1', { id: '1', dailyDate: getUtcMidnightForTest(), dailyOrderCount: 10 });

      await expect(service.assertOrderWithinLimit(1)).rejects.toThrow(BadRequestException);
    });

    it('当日第 10 次下单通过', async () => {
      const { service, store } = createService();
      store.set('1', { id: '1', dailyDate: getUtcMidnightForTest(), dailyOrderCount: 9 });

      await expect(service.assertOrderWithinLimit(1)).resolves.toBeUndefined();
    });

    it('记账累加下单次数', async () => {
      const { service, store } = createService();

      await service.recordOrder(1);

      expect(store.get('1')?.dailyOrderCount).toBe(1);
    });

    it('支付成功清零下单次数，不动积分计数', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyMemberPointTotal: 100,
        dailyOrderCount: 10,
      });

      await service.resetOrderCount(1);

      const saved = store.get('1');
      expect(saved?.dailyOrderCount).toBe(0);
      expect(saved?.dailyMemberPointTotal).toBe(100);
    });

    it('没有限流记录时清零是空操作', async () => {
      const { service, store } = createService();

      await service.resetOrderCount(1);

      expect(store.get('1')).toBeUndefined();
    });
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npm run test -- local-host`
Expected: FAIL，`assertOrderWithinLimit is not a function`

- [ ] **Step 3: 实现三个方法**

`api/src/local-host/local-host.service.ts` 常量区追加：

```ts
const LOCAL_DAILY_ORDER_CAP = 10;
```

类中追加：

```ts
  /** 本地来源创建支付宝订单前的次数检查，超限抛 400。 */
  async assertOrderWithinLimit(steamId: number): Promise<void> {
    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, getUtcMidnight(new Date()));
    if (counters.orderCount >= LOCAL_DAILY_ORDER_CAP) {
      logger.warn('local: alipay order rejected', { steamId, reason: 'daily order cap' });
      throw new BadRequestException();
    }
  }

  /** 本地来源创建支付宝订单成功后累加当日次数。 */
  async recordOrder(steamId: number): Promise<void> {
    const today = getUtcMidnight(new Date());
    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, today);
    await this.saveRateLimit(steamId, current, {
      dailyDate: today,
      dailySeasonPointTotal: counters.seasonPointTotal,
      dailyMemberPointTotal: counters.memberPointTotal,
      dailyOrderCount: counters.orderCount + 1,
    });
  }

  /** 支付成功后清零当日下单次数，让付过钱的玩家可以继续购买。 */
  async resetOrderCount(steamId: number): Promise<void> {
    const current = await this.rateLimitRepository.findById(steamId.toString());
    if (!current) {
      return;
    }

    const today = getUtcMidnight(new Date());
    const counters = getDailyCounters(current, today);
    await this.saveRateLimit(steamId, current, {
      dailyDate: today,
      dailySeasonPointTotal: counters.seasonPointTotal,
      dailyMemberPointTotal: counters.memberPointTotal,
      dailyOrderCount: 0,
    });
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && npm run test -- local-host`
Expected: PASS

- [ ] **Step 5: 写失败的下单限流 e2e**

`api/test/alipay.e2e-spec.ts` 的 `STEAM_IDS` 追加两个：

```ts
  LOCAL_ORDER_CAP: 300010013,
  LOCAL_ORDER_RESET: 300010014,
```

import 追加 `getLocalApiKey`：

```ts
import { getLocalApiKey } from './util/util-http';
```

在既有 `createOrder` helper 下方追加一个走本地 key 的版本：

```ts
  const createOrderWithLocalKey = async (steamId: number) =>
    request(app.getHttpServer())
      .post(`${prefixPath}/order/create`)
      .set('x-api-key', getLocalApiKey())
      .send({ steamId, productCode: AlipayProductCode.MEMBER_PREMIUM });
```

文件末尾、最后一个 describe 之后追加：

```ts
  describe('本地 key 下单限流', () => {
    it('当日第 11 次下单被拒', async () => {
      const steamId = STEAM_IDS.LOCAL_ORDER_CAP;
      for (let i = 0; i < 10; i++) {
        const ok = await createOrderWithLocalKey(steamId);
        expect(ok.status).toBe(201);
      }

      const rejected = await createOrderWithLocalKey(steamId);

      expect(rejected.status).toBe(400);
    });
  });
```

- [ ] **Step 6: 跑 e2e 确认失败**

Run: `cd api && npm run test:e2e -- alipay`
Expected: FAIL，本地 key 目前打下单接口是 401

- [ ] **Step 7: 接线到 controller 与 webhook**

`api/src/alipay/alipay.controller.ts`：

```ts
  @AllowLocal()
  @Post('/order/create')
  async createOrder(
    @Body() dto: CreateAlipayOrderDto,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<CreateAlipayOrderResponseDto> {
    const isLocal = serverType === SERVER_TYPE.LOCAL;
    if (isLocal) {
      await this.localHostService.assertOrderWithinLimit(dto.steamId);
    }

    logger.info('Alipay create order', { steamId: dto.steamId, productCode: dto.productCode });
    const response = await this.alipayService.createOrder(dto);

    if (isLocal) {
      await this.localHostService.recordOrder(dto.steamId);
    }

    return response;
  }

  @AllowLocal()
  @Get('/order/query')
```

构造函数追加 `private readonly localHostService: LocalHostService,`，并补 `AllowLocal`、`CurrentServerType`、`SERVER_TYPE`、`LocalHostService` 四个 import。

`api/src/alipay/alipay.service.ts` 的 `handleWebhook`，在 `await this.analyticsPurchaseService.alipayPurchase(order);` 之前插入：

```ts
    // 付过钱的玩家不该再被下单次数挡住
    await this.localHostService.resetOrderCount(order.steamId);
```

构造函数追加 `private readonly localHostService: LocalHostService,` 与对应 import。

`api/src/alipay/alipay.module.ts` 的 `imports` 追加 `LocalHostModule` 与 import 语句。

- [ ] **Step 8: 补支付成功后可继续下单的 e2e**

在 Step 5 新增的 describe 里追加。`buildNotify` 默认金额就是会员商品的 28.00，直接用即可：

```ts
    it('支付成功后下单次数清零', async () => {
      const steamId = STEAM_IDS.LOCAL_ORDER_RESET;
      let lastOutTradeNo = '';
      for (let i = 0; i < 10; i++) {
        const ok = await createOrderWithLocalKey(steamId);
        expect(ok.status).toBe(201);
        lastOutTradeNo = ok.body.outTradeNo;
      }

      const paid = await postWebhook(buildNotify({ out_trade_no: lastOutTradeNo }));
      expect(paid.text).toBe('success');

      const afterPaid = await createOrderWithLocalKey(steamId);

      expect(afterPaid.status).toBe(201);
    });
```

- [ ] **Step 9: 跑 e2e 确认通过**

Run: `cd api && npm run test:e2e -- alipay`
Expected: PASS

- [ ] **Step 10: 跑全量校验**

Run: `cd api && npm run test && npm run lint && npm run test:e2e`
Expected: 全部通过

- [ ] **Step 11: 提交**

```bash
git add api/src api/test
git commit -m "$(cat <<'EOF'
Throttle Alipay order creation from the local key

Caps order creation at 10 per steamId per day and clears the counter once
a payment succeeds.

Refs #1105

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 开局接口对本地 key 下发 GA4 配置

**Files:**
- Modify: `api/src/game/game.service.ts`
- Modify: `api/src/game/game.service.spec.ts`

**Interfaces:**
- Consumes: `GameService.getGA4Config(serverType: SERVER_TYPE): GA4ConfigDto | undefined`（已存在）

- [ ] **Step 1: 改测试期望**

`api/src/game/game.service.spec.ts` 中 `getGA4Config` 那个 describe，把 `should return undefined for LOCAL server` 改写为：

```ts
    it('should return GA4 config for LOCAL server', () => {
      const result = service.getGA4Config(SERVER_TYPE.LOCAL);

      expect(result).toEqual({
        measurementId: mockMeasurementId,
        apiSecret: mockApiSecret,
        serverType: SERVER_TYPE.LOCAL,
      });
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
    });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npm run test -- game.service`
Expected: FAIL，返回 undefined

- [ ] **Step 3: 放开本地来源**

`api/src/game/game.service.ts` 的 `getGA4Config` 排除条件去掉本地：

```ts
    // 来源不明的服务器不下发；本地主机下发，接受混入假数据
    if (serverType === SERVER_TYPE.UNKNOWN) {
      return undefined;
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && npm run test -- game.service`
Expected: PASS

- [ ] **Step 5: 跑全量校验**

Run: `cd api && npm run test && npm run lint && npm run test:e2e`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add api/src/game
git commit -m "$(cat <<'EOF'
Send GA4 config to local hosts

Refs #1105

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 收尾

- [ ] 全量校验：`cd api && npm run test && npm run lint && npm run test:e2e`
- [ ] `git push -u origin feature/1105-local-host-phase1-backend`
- [ ] `gh pr create`，base 为 `develop`，标题英文，body 用 `## Summary` + `## Test plan`
- [ ] PR body 里注明：`GET /api/game/start` 对未知 key 从 200 空数据改为 401；本次未新增顶层路由前缀，`api/index.ts` 的路径白名单不用改
