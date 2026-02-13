# AI 英雄推荐系统

## 文档索引

本目录包含 AI 英雄推荐系统的完整技术文档。

### 📋 核心文档

| 文档                                                     | 描述                            | 状态      |
| -------------------------------------------------------- | ------------------------------- | --------- |
| [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md)                 | BigQuery 建表与数据导入（必读） | ✅ v1.0   |
| [BIGQUERY_REPOSITORY.md](./BIGQUERY_REPOSITORY.md)       | BigQuery 代码库管理方案         | ✅ v1.0   |
| [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md) | 分阶段实施计划（推荐）          | ✅ v2.1   |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                     | 系统架构设计文档                | ✅ v1.0   |
| [GITHUB_ISSUES.md](./GITHUB_ISSUES.md)                   | GitHub Issues 模板              | 📝 待更新 |

### 🎯 项目目标

根据 Radiant（人类方）阵容，为 Dire（Bot 方）推荐最优英雄选择，目标将 Dire 胜率从 20%提升至 25%+。

### 🏗️ 技术栈

- **后端 API**: NestJS + Firebase Cloud Functions
- **数据存储**: Google BigQuery
- **模型训练**: Python + XGBoost
- **推理服务**: Python + FastAPI
- **部署平台**: Google Cloud Run

### ✅ 游戏规则（已确认）

- **Radiant（玩家方）**：1-10 个玩家，人数可变，可以重复选择英雄
- **Dire（Bot 方）**：固定 10 个英雄，不可重复
- **选择顺序**：Radiant 先选完，Dire 再选
- **数据来源**：已有大量历史对局数据在 GA4 BigQuery 中

### 📊 实施策略

#### Phase 1: 快速实验验证（约 3 周）

建立专有数据表，导入历史数据，快速训练并验证方案

- [x] **准备**: BigQuery 建表+数据导入（Issue #P1-0，2-3 小时）← **先做这个！**
- [ ] **Week 1**: 环境准备（Issues #P1-1 ~ #P1-3）
- [ ] **Week 2**: 模型训练（Issues #P1-4, #P1-5）
- [ ] **Week 3**: 推理服务部署（Issues #P1-6, #P1-7, #P1-8）
- [ ] **Week 4**: 灰度测试（Issue #P1-9）

#### Phase 2: 持续优化（Phase 1 后，长期）

模型优化和自动化重训练

- [ ] **模型优化**（Issue #P2-1）
- [ ] **自动化重训练**（Issue #P2-2）
- [ ] **监控 Dashboard**（Issue #P2-3）

### 🚀 快速开始

#### 步骤 0：⚡ 建表并导入数据（必须先做！）

```bash
# 1. 阅读BigQuery设置指南
cat docs/ai-recommendation/BIGQUERY_SETUP.md

# 2. 在BigQuery控制台创建表并导入GA4历史数据
# 详见 BIGQUERY_SETUP.md 中的完整步骤
```

✅ **完成后你将拥有**：包含 50k+历史对局的专有数据表

---

#### 步骤 1：阅读实施计划

```bash
cat docs/ai-recommendation/IMPLEMENTATION_PLAN_V2.md
```

#### 步骤 2：准备开发环境

- [ ] 安装 Python 3.11+
- [ ] 配置 GCP 认证
- [ ] 验证可以查询 BigQuery 数据表

#### 步骤 3：开始训练

从 Issue #P1-1 开始：创建 Python 训练项目结构

### 📈 预期成果

- **短期**（1 个月）：数据收集上线，首个模型训练完成
- **中期**（2-3 个月）：推理服务上线，灰度测试
- **长期**（6 个月）：胜率提升至 25%+，建立自动化重训练流程

### 📞 联系方式

如有疑问，请在对应的 GitHub Issue 中讨论。

---

**最后更新**: 2026-01-14
**版本**: v0.1
**状态**: 待确认并开始实施
