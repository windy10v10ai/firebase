# AI英雄推荐系统

## 文档索引

本目录包含AI英雄推荐系统的完整技术文档。

### 📋 核心文档

| 文档 | 描述 | 状态 |
|------|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构设计文档 | ✅ v1.0 |
| [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md) | 分阶段实施计划（推荐） | ✅ v2.0 |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | 原始实施计划（参考） | 📦 v0.1 |
| [GITHUB_ISSUES.md](./GITHUB_ISSUES.md) | GitHub Issues模板 | 📝 待更新 |

### 🎯 项目目标

根据Radiant（人类方）阵容，为Dire（Bot方）推荐最优英雄选择，目标将Dire胜率从20%提升至25%+。

### 🏗️ 技术栈

- **后端API**: NestJS + Firebase Cloud Functions
- **数据存储**: Google BigQuery
- **模型训练**: Python + XGBoost
- **推理服务**: Python + FastAPI
- **部署平台**: Google Cloud Run

### ✅ 游戏规则（已确认）

- **Radiant（玩家方）**：1-10个玩家，人数可变，可以重复选择英雄
- **Dire（Bot方）**：固定10个英雄，不可重复
- **选择顺序**：Radiant先选完，Dire再选
- **数据来源**：已有大量历史对局数据在GA4 BigQuery中

### 📊 实施策略

#### Phase 1: 快速实验验证（2-3周）
利用现有GA4数据快速训练模型并验证方案可行性

- [ ] **Week 1**: 环境准备（Issues #P1-1 ~ #P1-3）
- [ ] **Week 2**: 模型训练（Issues #P1-4, #P1-5）
- [ ] **Week 3**: 推理服务部署（Issues #P1-6, #P1-7, #P1-8）
- [ ] **Week 4**: 灰度测试（Issue #P1-9）

#### Phase 2: 持续优化（并行启动，长期）
建立专用数据流水线和自动化重训练机制

- [ ] **数据基础设施**（Issues #P2-1 ~ #P2-4）- 可在Week 2并行启动
- [ ] **模型优化**（Issues #P2-5, #P2-6）
- [ ] **自动化**（Issues #P2-7, #P2-8）

### 🚀 快速开始

#### 1. 阅读架构文档
```bash
cat docs/ai-recommendation/ARCHITECTURE.md
```

#### 2. 查看分阶段实施计划（推荐）
```bash
cat docs/ai-recommendation/IMPLEMENTATION_PLAN_V2.md
```

#### 3. 准备环境
- [ ] 确认GA4 Property ID
- [ ] 配置GCP权限（BigQuery + Cloud Run）
- [ ] 安装Python 3.11+

#### 4. 开始Phase 1
从Issue #P1-1开始：创建Python训练项目结构

### 📈 预期成果

- **短期**（1个月）：数据收集上线，首个模型训练完成
- **中期**（2-3个月）：推理服务上线，灰度测试
- **长期**（6个月）：胜率提升至25%+，建立自动化重训练流程

### 📞 联系方式

如有疑问，请在对应的GitHub Issue中讨论。

---

**最后更新**: 2026-01-14
**版本**: v0.1
**状态**: 待确认并开始实施
