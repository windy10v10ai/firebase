# 迁移指南

## 概述

本文档提供从当前架构迁移到新架构的详细步骤和注意事项。

## 迁移前准备

### 1. 备份代码

```bash
git checkout -b refactor/player-info-module
git commit -am "Backup before refactor"
```

### 2. 运行测试

确保所有现有测试通过：

```bash
npm test
```

### 3. 记录当前 API 响应

记录当前 `GET /game/player/steamId/:steamId` 的响应格式，用于验证兼容性。

## 第一阶段迁移步骤

### 步骤 1：创建 PlayerInfoModule 目录

```bash
mkdir -p api/src/player-info/dto
```

### 步骤 2：创建 PlayerInfoModule

创建 `api/src/player-info/player-info.module.ts`（参考 PHASE1_REFACTOR.md）

### 步骤 3：创建 PlayerInfoService

创建 `api/src/player-info/player-info.service.ts`，迁移 `GameService.findPlayerDtoBySteamIds` 的逻辑。

**关键点**：
- 完整复制 `findPlayerDtoBySteamIds` 的逻辑
- 保持方法签名一致
- 确保计算结果完全相同

### 步骤 4：更新 GameService

1. 移除 `findPlayerDtoBySteamIds` 和 `findPlayerDtoBySteamId` 方法
2. 移除 PlayerPropertyService 和 PlayerSettingService 的依赖注入
3. 添加 PlayerInfoService 的依赖注入
4. 更新 `resetPlayerProperty` 方法中的调用

### 步骤 5：更新 GameModule

1. 导入 PlayerInfoModule
2. 移除 PlayerPropertyModule 的直接导入

### 步骤 6：更新 GameController

1. 添加 PlayerInfoService 的依赖注入
2. 更新 `getPlayerInfo` 方法，使用 PlayerInfoService

### 步骤 7：验证

```bash
# 运行测试
npm test

# 测试 API 端点
curl http://localhost:3000/game/player/steamId/123456789

# 验证响应格式与之前完全一致
```

## 第二阶段迁移步骤

### 步骤 1：创建 PlayerInfoDto

创建 `api/src/player-info/dto/player-info.dto.ts`（参考 PHASE2_PLAYERINFO.md）

### 步骤 2：扩展 PlayerInfoService

添加 `findPlayerInfoBySteamId` 和 `findPlayerInfoBySteamIds` 方法。

### 步骤 3：创建 PlayerInfoController

创建 `api/src/player-info/player-info.controller.ts`

### 步骤 4：更新 PlayerInfoModule

添加 PlayerInfoController 到 controllers

### 步骤 5：验证

```bash
# 运行测试
npm test

# 测试新 API 端点
curl http://localhost:3000/player/123456789/info

# 验证响应格式正确
```

## 常见问题

### Q1: 如果迁移后测试失败怎么办？

**A**: 检查以下几点：
1. PlayerInfoService 的逻辑是否与 GameService 完全一致
2. 依赖注入是否正确
3. 模块导入顺序是否正确

### Q2: 如何验证 API 兼容性？

**A**: 
1. 使用 Postman 或 curl 测试 `GET /game/player/steamId/:steamId`
2. 对比迁移前后的响应 JSON
3. 确保所有字段都存在且值相同

### Q3: 迁移后性能是否有影响？

**A**: 
- 理论上性能应该相同或更好（代码更清晰）
- 如果发现性能问题，检查 PlayerInfoService 的实现是否有优化空间

## 回滚步骤

如果迁移出现问题，可以按以下步骤回滚：

### 第一阶段回滚

1. 恢复 GameService 中的 `findPlayerDtoBySteamIds` 和 `findPlayerDtoBySteamId` 方法
2. 恢复 GameService 的依赖注入
3. 恢复 GameModule 的导入
4. 恢复 GameController 的调用

### 第二阶段回滚

1. 移除 PlayerInfoController
2. 移除 PlayerInfoDto
3. 移除 PlayerInfoService 中的新方法
4. 更新 PlayerInfoModule，移除 Controller

## 迁移检查清单

### 第一阶段

- [ ] PlayerInfoModule 创建完成
- [ ] PlayerInfoService 创建完成，逻辑迁移完成
- [ ] GameService 重构完成
- [ ] GameModule 更新完成
- [ ] GameController 更新完成
- [ ] 所有测试通过
- [ ] API 兼容性验证通过

### 第二阶段

- [ ] PlayerInfoDto 创建完成
- [ ] PlayerInfoService 扩展完成
- [ ] PlayerInfoController 创建完成
- [ ] PlayerInfoModule 更新完成
- [ ] 新 API 端点测试通过
- [ ] API 文档更新完成
