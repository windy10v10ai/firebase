# 第二阶段：新增 PlayerInfoDto API

## 目标

- 创建 PlayerInfoDto（全新设计）
- 创建 PlayerInfoController
- 新增 `GET /player/:steamId/info` 端点

## 关键原则

1. **PlayerInfoDto 是全新设计**，不包含赛季等级历史数据
2. **不影响现有 API**，只是新增端点
3. **PlayerDto 保持完全兼容**

## PlayerInfoDto 设计

### 结构定义

**文件**: `api/src/player-info/dto/player-info.dto.ts` (新建)

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MemberLevel } from '../../members/entities/members.entity';
import { PlayerProperty } from '../../player-property/entities/player-property.entity';
import { PlayerSetting } from '../../player/entities/player-setting.entity';

export class PlayerInfoDto {
  // ========== 基础信息 ==========
  @ApiProperty()
  id: string;
  
  @ApiProperty()
  steamId: number;
  
  // ========== 游戏统计 ==========
  @ApiProperty()
  matchCount: number;
  
  @ApiProperty()
  winCount: number;
  
  @ApiProperty()
  disconnectCount: number;
  
  @ApiProperty()
  conductPoint: number;
  
  @ApiProperty()
  lastMatchTime: Date | null;
  
  // ========== 积分系统 ==========
  @ApiProperty()
  seasonPoint: {
    total: number;               // seasonPointTotal
    level: number;                // seasonLevel
    currentLevelPoint: number;    // seasonCurrrentLevelPoint
    nextLevelPoint: number;       // seasonNextLevelPoint
  };
  
  @ApiProperty()
  memberPoint: {
    total: number;               // memberPointTotal
    level: number;                // memberLevel
    currentLevelPoint: number;    // memberCurrentLevelPoint
    nextLevelPoint: number;       // memberNextLevelPoint
  };
  
  @ApiProperty()
  totalLevel: number;
  
  @ApiProperty()
  useableLevel: number;
  
  // ========== 玩家属性 ==========
  @ApiPropertyOptional()
  properties?: PlayerProperty[];
  
  // ========== 玩家设置 ==========
  @ApiProperty()
  setting: PlayerSetting;
  
  // ========== 会员信息 ==========
  @ApiPropertyOptional()
  member?: {
    enabled: boolean;
    level: MemberLevel;
    expireDate: string;          // ISO string
    expireDateString: string;    // YYYY-MM-DD
    lastDailyDate?: Date;
  };
}
```

### 设计说明

1. **嵌套结构**：积分信息分组到 `seasonPoint` 和 `memberPoint` 对象中
2. **会员信息**：包含完整的会员信息（如果玩家是会员）
3. **不包含赛季等级历史数据**：`firstSeasonLevel`, `secondSeasonLevel`, `thirdSeasonLevel` 不包含在 PlayerInfoDto 中

## 实施步骤

### 步骤 1：创建 PlayerInfoDto

**文件**: `api/src/player-info/dto/player-info.dto.ts` (新建)

按照上面的结构定义创建文件。

### 步骤 2：扩展 PlayerInfoService

**文件**: `api/src/player-info/player-info.service.ts`

**新增方法**：

```typescript
async findPlayerInfoBySteamId(steamId: number): Promise<PlayerInfoDto> {
  const playerDto = await this.findPlayerDtoBySteamId(steamId);
  const member = await this.membersService.findOne(steamId);
  
  // 构建 PlayerInfoDto
  const playerInfo: PlayerInfoDto = {
    id: playerDto.id,
    steamId: +playerDto.id,
    matchCount: playerDto.matchCount,
    winCount: playerDto.winCount,
    disconnectCount: playerDto.disconnectCount,
    conductPoint: playerDto.conductPoint,
    lastMatchTime: playerDto.lastMatchTime,
    seasonPoint: {
      total: playerDto.seasonPointTotal,
      level: playerDto.seasonLevel,
      currentLevelPoint: playerDto.seasonCurrrentLevelPoint,
      nextLevelPoint: playerDto.seasonNextLevelPoint,
    },
    memberPoint: {
      total: playerDto.memberPointTotal,
      level: playerDto.memberLevel,
      currentLevelPoint: playerDto.memberCurrentLevelPoint,
      nextLevelPoint: playerDto.memberNextLevelPoint,
    },
    totalLevel: playerDto.totalLevel,
    useableLevel: playerDto.useableLevel,
    properties: playerDto.properties,
    setting: playerDto.playerSetting,
  };
  
  // 添加会员信息
  if (member) {
    const memberDto = new MemberDto(member);
    playerInfo.member = {
      enabled: memberDto.enable,
      level: memberDto.level,
      expireDate: member.expireDate.toISOString(),
      expireDateString: memberDto.expireDateString,
      lastDailyDate: member.lastDailyDate,
    };
  }
  
  return playerInfo;
}

async findPlayerInfoBySteamIds(steamIds: number[]): Promise<PlayerInfoDto[]> {
  return Promise.all(steamIds.map(id => this.findPlayerInfoBySteamId(id)));
}
```

### 步骤 3：创建 PlayerInfoController

**文件**: `api/src/player-info/player-info.controller.ts` (新建)

```typescript
import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../util/auth/public.decorator';

import { PlayerInfoDto } from './dto/player-info.dto';
import { PlayerInfoService } from './player-info.service';

@ApiTags('Player')
@Controller('player')
export class PlayerInfoController {
  constructor(
    private readonly playerInfoService: PlayerInfoService,
  ) {}

  @Public()
  @Get(':steamId/info')
  @ApiOperation({ summary: 'Get player info with member data' })
  async getPlayerInfo(
    @Param('steamId', ParseIntPipe) steamId: number,
  ): Promise<PlayerInfoDto> {
    return this.playerInfoService.findPlayerInfoBySteamId(steamId);
  }
}
```

### 步骤 4：更新 PlayerInfoModule

**文件**: `api/src/player-info/player-info.module.ts`

**变更**：
- 添加 PlayerInfoController 到 controllers

```typescript
@Module({
  imports: [
    PlayerModule,
    MembersModule,
    PlayerPropertyModule,
  ],
  controllers: [PlayerInfoController],  // 第二阶段：添加 Controller
  providers: [PlayerInfoService],
  exports: [PlayerInfoService],
})
export class PlayerInfoModule {}
```

## API 端点

### 新增端点

- `GET /player/:steamId/info` - 返回 PlayerInfoDto

**示例请求**：
```
GET /player/123456789/info
```

**示例响应**：
```json
{
  "id": "123456789",
  "steamId": 123456789,
  "matchCount": 100,
  "winCount": 60,
  "disconnectCount": 2,
  "conductPoint": 95,
  "lastMatchTime": "2024-01-15T10:30:00.000Z",
  "seasonPoint": {
    "total": 5000,
    "level": 10,
    "currentLevelPoint": 500,
    "nextLevelPoint": 1000
  },
  "memberPoint": {
    "total": 2000,
    "level": 5,
    "currentLevelPoint": 200,
    "nextLevelPoint": 300
  },
  "totalLevel": 15,
  "useableLevel": 10,
  "properties": [...],
  "setting": {...},
  "member": {
    "enabled": true,
    "level": 2,
    "expireDate": "2024-12-31T00:00:00.000Z",
    "expireDateString": "2024-12-31",
    "lastDailyDate": "2024-01-15T00:00:00.000Z"
  }
}
```

## 验证清单

- [ ] PlayerInfoDto 结构正确，不包含赛季等级历史数据
- [ ] `GET /player/:steamId/info` 端点正常工作
- [ ] 返回的 PlayerInfoDto 包含完整的玩家和会员信息
- [ ] 如果玩家不是会员，member 字段为 undefined
- [ ] 所有测试通过
- [ ] API 文档（Swagger）正确显示
