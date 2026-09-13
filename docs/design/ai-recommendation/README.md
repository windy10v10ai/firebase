# AI英雄推荐系统

根据Radiant（人类方）阵容，为Dire（Bot方）推荐最优英雄选择，目标将Dire胜率从20%提升至25%+。

## 文档索引

| 文档 | 描述 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构设计 |
| [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md) | BigQuery建表与数据导入 |

## 技术栈

- **后端API**: NestJS + Firebase Cloud Functions
- **数据存储**: Google BigQuery
- **模型训练**: Python + XGBoost
- **推理服务**: Python + FastAPI
- **部署平台**: Google Cloud Run

## 游戏规则（已确认）

- **Radiant（玩家方）**：1-10个玩家，人数可变，可以重复选择英雄
- **Dire（Bot方）**：固定10个英雄，不可重复
- **选择顺序**：Radiant先选完，Dire再选
- **数据来源**：已有大量历史对局数据在GA4 BigQuery中
