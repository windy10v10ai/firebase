# AI英雄推荐系统

## 文档索引

本目录包含AI英雄推荐系统的完整技术文档。

### 📋 核心文档

| 文档 | 描述 | 状态 |
|------|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构设计文档 | ✅ v0.1 |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | 分步实施计划 | ✅ v0.1 |

### 🎯 项目目标

根据Radiant（人类方）阵容，为Dire（Bot方）推荐最优英雄选择，目标将Dire胜率从20%提升至25%+。

### 🏗️ 技术栈

- **后端API**: NestJS + Firebase Cloud Functions
- **数据存储**: Google BigQuery
- **模型训练**: Python + XGBoost
- **推理服务**: Python + FastAPI
- **部署平台**: Google Cloud Run

### 📊 实施进度

- [ ] **阶段1**: 数据收集基础设施（Issues #1-#4）
- [ ] **阶段2**: 训练环境搭建（Issues #5-#8）
- [ ] **阶段3**: 模型训练与评估（Issues #9-#11）
- [ ] **阶段4**: 推理服务部署（Issues #12-#15）
- [ ] **阶段5**: 集成与上线（Issues #16-#18）
- [ ] **阶段6**: 监控与迭代（Issues #19-#20）

### 🚀 快速开始

#### 1. 阅读架构文档
```bash
cat docs/ai-recommendation/ARCHITECTURE.md
```

#### 2. 查看实施计划
```bash
cat docs/ai-recommendation/IMPLEMENTATION_PLAN.md
```

#### 3. 查看GitHub Issues
访问 [Issues页面](https://github.com/windy10v10ai/firebase/issues?q=is%3Aissue+label%3Aai-recommendation)

### ⚠️ 待确认问题

在开始实施前，需要确认以下游戏规则细节：

1. **Radiant方人数**：是否固定10人？还是1-10人可变？
2. **英雄重复规则**：是否只有Radiant可以重复，Dire不能重复？
3. **推荐时机**：Dire是否在Radiant全部选完后一次性选10个？
4. **现有数据**：是否已有历史对局数据可以导入？

**请在开始Issue #1之前确认这些问题。**

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
