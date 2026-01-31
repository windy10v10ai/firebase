# 模块重构文档

## 概述

本文档描述了 Game/Player/Member 模块依赖关系的重构方案，采用两阶段实施策略。

## 文档索引

- [架构设计](./ARCHITECTURE.md) - 整体架构和依赖关系
- [第一阶段：重构结构](./PHASE1_REFACTOR.md) - 保持 Game API 兼容的结构重构
- [第二阶段：PlayerInfoDto API](./PHASE2_PLAYERINFO.md) - 新增 PlayerInfoDto API
- [迁移指南](./MIGRATION_GUIDE.md) - 迁移步骤和注意事项

## 重构目标

1. **职责清晰**：将 DTO 构建逻辑从 GameService 中分离
2. **依赖简化**：减少 GameModule 的直接依赖
3. **向后兼容**：第一阶段保证 Game API 完全不变
4. **向前扩展**：第二阶段提供新的 PlayerInfoDto API

## 两阶段实施

### 第一阶段：重构结构（保持兼容）

- 创建 PlayerInfoModule 和 PlayerInfoService
- 迁移 GameService 中的 DTO 构建逻辑
- **保证 Game API 接口完全不变**

### 第二阶段：新增 PlayerInfoDto API

- 创建 PlayerInfoDto（全新设计）
- 创建 PlayerInfoController
- 新增 `GET /player/:steamId/info` 端点

## 关键决策

- **模块命名**：使用 `PlayerInfoModule`（而不是 PlayerDtoModule）
- **Controller 位置**：PlayerInfoController 在 PlayerInfoModule 中（避免循环依赖）
- **兼容性**：保留 GameController 中的兼容端点 `GET /game/player/steamId/:steamId`
