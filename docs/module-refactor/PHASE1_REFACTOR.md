# 第一阶段：重构结构（保持 Game API 兼容）

## 目标

- 创建 PlayerInfoModule 和 PlayerInfoService
- 迁移 GameService 中的 DTO 构建逻辑
- **保证 Game API 接口完全不变**

## 关键原则

1. **不创建 PlayerInfoDto**（第二阶段）
2. **不创建 PlayerInfoController**（第二阶段）
3. **GameController 的端点保持不变**
4. **只重构内部结构，对外接口不变**

## 实施步骤

### 步骤 1：创建 PlayerInfoModule

**文件**: `api/src/player-info/player-info.module.ts` (新建)

```typescript
import { Module } from '@nestjs/common';

import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { PlayerInfoService } from './player-info.service';

@Module({
  imports: [
    PlayerModule,
    MembersModule,
    PlayerPropertyModule,
  ],
  controllers: [],  // 第一阶段：无 Controller
  providers: [PlayerInfoService],
  exports: [PlayerInfoService],
})
export class PlayerInfoModule {}
```

### 步骤 2：创建 PlayerInfoService

**文件**: `api/src/player-info/player-info.service.ts` (新建)

**职责**：
- 迁移 `GameService.findPlayerDtoBySteamIds` 的完整逻辑
- 提供 PlayerDto 构建方法（兼容方法）

**方法**：
- `findPlayerDtoBySteamId(steamId: number): Promise<PlayerDto>`
- `findPlayerDtoBySteamIds(steamIds: string[]): Promise<PlayerDto[]>`

**依赖注入**：
- PlayerService (来自 PlayerModule)
- PlayerPropertyService (来自 PlayerPropertyModule)
- PlayerSettingService (来自 PlayerModule)
- MembersService (来自 MembersModule) - 第一阶段暂不使用，第二阶段使用

### 步骤 3：重构 GameService

**文件**: `api/src/game/game.service.ts`

**变更**：

1. **移除方法**：
   - `findPlayerDtoBySteamIds`
   - `findPlayerDtoBySteamId`

2. **移除依赖注入**：
   - PlayerPropertyService
   - PlayerSettingService

3. **添加依赖注入**：
   - PlayerInfoService

4. **更新方法调用**：
   - `resetPlayerProperty` 中使用 `playerInfoService.findPlayerDtoBySteamId`

**代码示例**：

```typescript
// 变更前
constructor(
  private readonly playerService: PlayerService,
  private readonly membersService: MembersService,
  private readonly eventRewardsService: EventRewardsService,
  private readonly playerPropertyService: PlayerPropertyService,  // 移除
  private readonly playerSettingService: PlayerSettingService,    // 移除
  private readonly secretService: SecretService,
) {}

// 变更后
constructor(
  private readonly playerService: PlayerService,
  private readonly membersService: MembersService,
  private readonly eventRewardsService: EventRewardsService,
  private readonly playerInfoService: PlayerInfoService,        // 新增
  private readonly secretService: SecretService,
) {}
```

### 步骤 4：更新 GameModule

**文件**: `api/src/game/game.module.ts`

**变更**：
- 导入 PlayerInfoModule
- 移除 PlayerPropertyModule 的直接导入

```typescript
@Module({
  imports: [
    MembersModule,
    PlayerModule,
    PlayerInfoModule,        // 新增，替代 PlayerPropertyModule
    EventRewardsModule,
    AnalyticsModule,
  ],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
```

### 步骤 5：更新 GameController

**文件**: `api/src/game/game.controller.ts`

**变更**：
- 移除 PlayerPropertyService 的直接注入
- 添加 PlayerInfoService 的依赖注入
- 使用 PlayerInfoService 替代 GameService 的方法调用
- **保持端点不变**

```typescript
// 变更前
constructor(
  private readonly gameService: GameService,
  // ...
) {}

@Get('player/steamId/:steamId')
async getPlayerInfo(@Param('steamId') steamId: number): Promise<PlayerDto> {
  return await this.gameService.findPlayerDtoBySteamId(steamId);
}

// 变更后
constructor(
  private readonly gameService: GameService,
  private readonly playerInfoService: PlayerInfoService,  // 新增
  // ...
) {}

@Get('player/steamId/:steamId')
async getPlayerInfo(@Param('steamId') steamId: number): Promise<PlayerDto> {
  return await this.playerInfoService.findPlayerDtoBySteamId(steamId);  // 使用 PlayerInfoService
}
```

## 验证清单

### 功能验证

- [ ] `GET /game/player/steamId/:steamId` 返回的 PlayerDto 结构完全一致
- [ ] `GameService.resetPlayerProperty` 功能正常
- [ ] `GameService.findPlayerDtoBySteamIds` 的调用已全部替换为 `PlayerInfoService.findPlayerDtoBySteamIds`
- [ ] 所有测试通过

### 代码质量

- [ ] GameService 不再直接依赖 PlayerPropertyService 和 PlayerSettingService
- [ ] PlayerInfoService 包含完整的 DTO 构建逻辑
- [ ] 无循环依赖
- [ ] 代码编译通过

## 回滚计划

如果第一阶段出现问题，可以：

1. 恢复 GameService 中的 `findPlayerDtoBySteamIds` 和 `findPlayerDtoBySteamId` 方法
2. 恢复 GameService 的依赖注入
3. 恢复 GameModule 的导入
4. 恢复 GameController 的调用

**注意**：PlayerInfoModule 可以保留，不影响回滚。
