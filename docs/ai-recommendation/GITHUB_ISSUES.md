# GitHub Issues创建清单

本文档基于 [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md) 的策略，采用细粒度任务拆分。

**关键策略**：先导入GA4历史数据，立即可以开始训练，无需等待新数据收集。

---

## Phase 1: 快速实验验证

### Phase 1.0: 数据基础设施（先决条件）

#### Issue #1: 创建BigQuery数据集和表结构

**标签**: `ai-recommendation`, `infrastructure`, `p0`  
**优先级**: P0（阻塞所有后续任务）  
**预计工时**: 1小时

**描述**:
```markdown
## 任务描述

为AI英雄推荐系统创建BigQuery数据集和对局数据表。

## 子任务

- [ ] 在GCP控制台创建`dota2` dataset
- [ ] 创建`matches`表（见下方SQL）
- [ ] 配置分区策略（按日期）
- [ ] 配置聚类策略（按winner和difficulty）
- [ ] 验证表创建成功

## 表结构SQL

```sql
CREATE TABLE `windy10v10ai.dota2.matches` (
  match_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  winner INT64 NOT NULL,
  radiant_heroes ARRAY<INT64> NOT NULL,
  dire_heroes ARRAY<INT64> NOT NULL,
  duration_msec INT64,
  game_version STRING,
  difficulty INT64,
  server_type STRING,
  radiant_player_count INT64,
  dire_player_count INT64
)
PARTITION BY DATE(timestamp)
CLUSTER BY winner, difficulty
OPTIONS(
  description = "Dota2 10v10 match records for hero recommendation training"
);
```

## 验收标准

- [ ] BigQuery中存在`windy10v10ai.dota2.matches`表
- [ ] 表结构包含所有必需字段
- [ ] 分区和聚类配置正确
- [ ] 可以手动插入测试数据

## 参考文档

- [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md)
```

---

#### Issue #2: 从GA4导入历史数据到专有表

**标签**: `ai-recommendation`, `data`, `p0`  
**优先级**: P0（阻塞所有后续任务）  
**依赖**: #1  
**预计工时**: 2-3小时

**描述**:
```markdown
## 任务描述

从GA4历史数据导入到专有表，这是关键步骤，完成后可以立即开始训练。

## 子任务

- [ ] 确认GA4 Property ID
- [ ] 编写从GA4导入历史数据的SQL（见BIGQUERY_SETUP.md）
- [ ] 先dry-run验证数据量
- [ ] 执行数据导入（最近6个月数据）
- [ ] 验证数据质量和数量

## 关键SQL

参考 [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md) 中的完整导入SQL。

## 验收标准

- [ ] 至少导入50,000场历史对局数据
- [ ] Dire胜率约20%
- [ ] Radiant平均人数在1-10范围内
- [ ] Dire固定10个英雄
- [ ] 数据时间范围覆盖最近6个月

## 为什么先做这一步？

✅ 统一数据源，后续所有训练都用同一张表  
✅ 利用现有GA4历史数据，无需等待新数据收集  
✅ 数据导入一次性完成，训练时直接查询

## 参考文档

- [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md)
- [sql/import_data.sql](../sql/import_data.sql)
```

---

#### Issue #3: 验证历史数据质量和数量

**标签**: `ai-recommendation`, `data`, `p0`  
**优先级**: P0  
**依赖**: #2  
**预计工时**: 0.5小时

**描述**:
```markdown
## 任务描述

验证导入的历史数据质量和数量，确保满足训练要求。

## 子任务

- [ ] 执行数据质量检查SQL
- [ ] 验证数据完整性（无NULL值）
- [ ] 验证数据分布（胜率、人数分布）
- [ ] 记录数据统计报告

## SQL验证查询

```sql
-- 数据统计
SELECT
  COUNT(*) as total_matches,
  COUNT(DISTINCT DATE(timestamp)) as days,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate,
  AVG(radiant_player_count) as avg_radiant_players,
  AVG(dire_player_count) as avg_dire_players
FROM `windy10v10ai.dota2.matches`;

-- 数据质量检查
SELECT
  COUNT(*) as total,
  COUNTIF(radiant_player_count >= 1 AND radiant_player_count <= 10) as valid_radiant,
  COUNTIF(dire_player_count = 10) as valid_dire,
  COUNTIF(ARRAY_LENGTH(radiant_heroes) = radiant_player_count) as valid_radiant_heroes,
  COUNTIF(ARRAY_LENGTH(dire_heroes) = 10) as valid_dire_heroes
FROM `windy10v10ai.dota2.matches`;
```

## 验收标准

- [ ] 总对局数 ≥ 50,000
- [ ] 数据质量检查通过率 > 95%
- [ ] 有完整的数据统计报告
```

---

#### Issue #4: 实现BigQueryService（持续数据写入）

**标签**: `ai-recommendation`, `backend`, `p1`  
**优先级**: P1（在#2完成后执行）  
**依赖**: #1  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

在NestJS后端实现BigQuery写入服务，用于持续写入新对局数据。

## 子任务

- [ ] 安装`@google-cloud/bigquery`依赖
- [ ] 创建`api/src/bigquery/bigquery.module.ts`
- [ ] 实现`api/src/bigquery/bigquery.service.ts`
- [ ] 实现`saveMatch()`方法
- [ ] 添加数据验证逻辑（过滤无效数据）
- [ ] 添加单元测试
- [ ] 添加错误处理（网络失败、配额超限）

## 代码框架

```typescript
// api/src/bigquery/bigquery.service.ts
import { BigQuery } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BigQueryService {
  private readonly logger = new Logger(BigQueryService.name);
  private bigquery = new BigQuery();
  private dataset = this.bigquery.dataset('dota2');
  private table = this.dataset.table('matches');

  async saveMatch(gameEnd: GameEndMatchDto): Promise<void> {
    // 数据验证
    if (!this.isValidMatch(gameEnd)) {
      this.logger.warn('Invalid match data, skipping BigQuery write');
      return;
    }

    // 写入逻辑
    await this.table.insert([{
      match_id: gameEnd.matchId,
      timestamp: new Date(),
      winner: gameEnd.winner,
      radiant_heroes: gameEnd.radiantHeroes,
      dire_heroes: gameEnd.direHeroes,
      // ... 其他字段
    }]);
  }

  private isValidMatch(gameEnd: GameEndMatchDto): boolean {
    // 验证逻辑
    return gameEnd.direHeroes?.length === 10 &&
           gameEnd.radiantHeroes?.length >= 1 &&
           gameEnd.radiantHeroes?.length <= 10;
  }
}
```

## 验收标准

- [ ] 单元测试通过率100%
- [ ] 可以成功写入测试数据到BigQuery
- [ ] 数据验证逻辑正确（过滤无效数据）
- [ ] 错误情况有适当日志

## 参考文档

- [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md) - Issue #P1-0.1
```

---

#### Issue #5: 在Analytics服务中集成BigQuery写入

**标签**: `ai-recommendation`, `backend`, `p1`  
**优先级**: P1  
**依赖**: #4  
**预计工时**: 2小时

**描述**:
```markdown
## 任务描述

在现有的Analytics服务中集成BigQuery写入逻辑。

## 子任务

- [ ] 在`app.module.ts`中导入`BigQueryModule`
- [ ] 在`analytics.service.ts`中注入`BigQueryService`
- [ ] 在`gameEndMatch()`方法中调用`bigQueryService.saveMatch()`
- [ ] 添加feature flag控制是否启用（`ENABLE_BIGQUERY_EXPORT`）
- [ ] 更新e2e测试

## 代码示例

```typescript
// api/src/analytics/analytics.service.ts
async gameEndMatch(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
  // 现有GA4逻辑
  await this.sendToGA4(gameEnd);

  // 新增BigQuery写入（通过环境变量控制）
  if (process.env.ENABLE_BIGQUERY_EXPORT === 'true') {
    try {
      await this.bigQueryService.saveMatch(gameEnd);
    } catch (error) {
      this.logger.error('Failed to save match to BigQuery', error);
      // 不阻塞主流程
    }
  }
}
```

## 验收标准

- [ ] 本地emulator测试通过
- [ ] e2e测试通过
- [ ] 有feature flag可以关闭BigQuery写入
- [ ] BigQuery写入失败不影响GA4逻辑
```

---

#### Issue #6: 部署并验证持续数据写入

**标签**: `ai-recommendation`, `deployment`, `p1`  
**优先级**: P1  
**依赖**: #5  
**预计工时**: 1小时

**描述**:
```markdown
## 任务描述

部署BigQuery集成并验证新对局数据能正确写入。

## 子任务

- [ ] 设置环境变量`ENABLE_BIGQUERY_EXPORT=true`
- [ ] 部署到Firebase Functions
- [ ] 运行测试对局
- [ ] 在BigQuery控制台验证数据
- [ ] 编写SQL查询示例文档

## SQL验证查询

```sql
-- 验证最近24小时的对局数据
SELECT
  match_id,
  timestamp,
  winner,
  array_length(radiant_heroes) as radiant_count,
  array_length(dire_heroes) as dire_count
FROM `windy10v10ai.dota2.matches`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
ORDER BY timestamp DESC
LIMIT 10;
```

## 验收标准

- [ ] 至少有10条测试对局数据写入BigQuery
- [ ] 数据格式正确（数组长度、英雄ID有效）
- [ ] 有查询示例文档
```

---

### Phase 1.1: 训练环境搭建

#### Issue #7: 创建Python训练项目结构

**标签**: `ai-recommendation`, `ml`, `p0`  
**优先级**: P0  
**预计工时**: 2小时

**描述**:
```markdown
## 任务描述

创建Python训练项目的基础结构。

## 子任务

- [ ] 创建`ml/training/`目录结构
- [ ] 创建`requirements.txt`
- [ ] 创建`README.md`（环境设置指南）
- [ ] 添加`.gitignore`

## 目录结构

```
ml/
├── training/
│   ├── README.md                  # 环境设置指南
│   ├── requirements.txt           # Python依赖
│   ├── data_loader.py             # 专有表数据加载器
│   ├── feature_engineering.py     # 特征工程
│   ├── train.py                   # 训练脚本
│   ├── evaluate.py                # 评估脚本
│   └── config.yaml                # 训练配置
└── inference/
    ├── main.py                    # FastAPI应用
    ├── feature_engineering.py     # 特征编码（复用）
    ├── requirements.txt
    ├── Dockerfile
    ├── model.json                 # 训练好的模型
    └── README.md
```

## requirements.txt

```
google-cloud-bigquery==3.14.0
pandas==2.1.4
numpy==1.26.2
xgboost==2.0.3
scikit-learn==1.3.2
pyyaml==6.0.1
```

## 验收标准

- [ ] 目录结构创建完成
- [ ] requirements.txt可以成功安装
- [ ] README包含环境设置说明
```

---

#### Issue #8: 实现数据加载器

**标签**: `ai-recommendation`, `ml`, `p0`  
**优先级**: P0  
**依赖**: #2, #7  
**预计工时**: 2小时

**描述**:
```markdown
## 任务描述

实现从BigQuery专有表加载训练数据的模块。

## 子任务

- [ ] 实现`data_loader.py`从专有表加载数据
- [ ] 支持按时间范围查询
- [ ] 添加数据过滤（过滤异常对局）
- [ ] 添加数据统计功能
- [ ] 本地测试（需要GCP认证）

## 代码框架

```python
# ml/training/data_loader.py
from google.cloud import bigquery
import pandas as pd
from collections import Counter

class MatchDataLoader:
    def __init__(self, project_id='windy10v10ai'):
        self.client = bigquery.Client(project=project_id)

    def load_recent_matches(self, days=90):
        """从专有表加载对局数据"""
        query = f"""
        SELECT
          match_id,
          timestamp,
          winner,
          radiant_heroes,
          dire_heroes,
          duration_msec,
          game_version,
          difficulty,
          server_type,
          radiant_player_count,
          dire_player_count
        FROM `windy10v10ai.dota2.matches`
        WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
          AND radiant_player_count >= 1
          AND radiant_player_count <= 10
          AND dire_player_count = 10
        ORDER BY timestamp DESC
        """
        df = self.client.query(query).to_dataframe()
        return df

    def get_data_stats(self, df):
        """打印数据统计"""
        print(f"📊 数据统计:")
        print(f"   总对局数: {len(df):,}")
        print(f"   时间范围: {df['timestamp'].min()} ~ {df['timestamp'].max()}")
        print(f"   Dire胜率: {(df['winner'] == 3).mean():.2%}")
        print(f"   Radiant平均人数: {df['radiant_player_count'].mean():.1f}")
        return {
            'total': len(df),
            'dire_win_rate': (df['winner'] == 3).mean(),
            'avg_radiant_players': df['radiant_player_count'].mean()
        }
```

## 验收标准

- [ ] 可以成功从专有表加载数据
- [ ] DataFrame包含所有必需字段
- [ ] 数据量 > 50,000场对局（使用导入的历史数据）
- [ ] 有详细的数据质量统计输出
- [ ] 查询速度 < 5秒
```

---

#### Issue #9: 实现特征工程模块

**标签**: `ai-recommendation`, `ml`, `p0`  
**优先级**: P0  
**依赖**: #8  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

实现特征工程模块，包括编码函数和样本生成。

## 子任务

- [ ] 实现`encode_radiant()`函数（计数向量）
- [ ] 实现`encode_dire()`函数（Multi-hot）
- [ ] 实现样本生成逻辑（每场对局10个样本）
- [ ] 添加单元测试
- [ ] 验证特征维度（260维）

## 代码框架

参考 [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md) - Issue #P1-3 中的完整代码。

## 验收标准

- [ ] 单元测试通过率100%
- [ ] 可以从测试数据生成正确的样本
- [ ] 特征向量维度=260
- [ ] 标签范围在[0, 129]
```

---

### Phase 1.2: 模型训练

#### Issue #10: 实现XGBoost训练脚本

**标签**: `ai-recommendation`, `ml`, `p0`  
**优先级**: P0  
**依赖**: #9  
**预计工时**: 6小时

**描述**:
```markdown
## 任务描述

实现完整的XGBoost训练脚本。

## 子任务

- [ ] 实现`train.py`主脚本
- [ ] 支持配置文件（`config.yaml`）
- [ ] 实现训练/验证集划分
- [ ] 实现早停（early stopping）
- [ ] 保存训练日志和模型文件
- [ ] 添加命令行参数支持

## 配置文件

```yaml
data:
  days: 90 # 使用最近N天的数据
  train_ratio: 0.8 # 训练集比例

model:
  max_depth: 8
  learning_rate: 0.1
  n_estimators: 200
  subsample: 0.8
  colsample_bytree: 0.8
  scale_pos_weight: 4 # 处理20%胜率不平衡

training:
  early_stopping_rounds: 20
  eval_metric: mlogloss
  verbose_eval: 10

output:
  model_path: models/hero_recommendation_v1.json
  log_path: logs/training.log
```

## 验收标准

- [ ] 可以成功训练模型
- [ ] 训练过程有进度输出
- [ ] 模型保存为JSON格式
- [ ] 验证集loss下降
- [ ] 有训练日志记录
```

---

#### Issue #11: 首次模型训练和评估

**标签**: `ai-recommendation`, `ml`, `p0`  
**优先级**: P0  
**依赖**: #10  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

运行首次模型训练（使用导入的历史数据）并进行评估。

## 子任务

- [ ] 运行首次训练（使用真实GA4历史数据）
- [ ] 实现简单的评估脚本（`evaluate.py`）
- [ ] 记录Top-1/Top-3/Top-5准确率
- [ ] 分析特征重要性
- [ ] 记录训练结果和参数

## 评估脚本

```python
# ml/training/evaluate.py
import xgboost as xgb
import numpy as np

def evaluate_model(model, X_val, y_val):
    """评估模型"""
    dval = xgb.DMatrix(X_val)
    probs = model.predict(dval)  # (n_samples, 130)

    # Top-K准确率
    top1_acc = (np.argmax(probs, axis=1) == y_val).mean()
    top3_acc = np.mean([y in np.argsort(p)[-3:] for p, y in zip(probs, y_val)])
    top5_acc = np.mean([y in np.argsort(p)[-5:] for p, y in zip(probs, y_val)])

    print(f"Top-1准确率: {top1_acc:.2%}")
    print(f"Top-3准确率: {top3_acc:.2%}")
    print(f"Top-5准确率: {top5_acc:.2%}")

    return {
        'top1': top1_acc,
        'top3': top3_acc,
        'top5': top5_acc
    }
```

## 验收标准

- [ ] 模型训练成功完成
- [ ] Top-1准确率 > 2%（随机猜测为0.77%）
- [ ] Top-3准确率 > 5%
- [ ] 有特征重要性分析
- [ ] 有完整的实验记录
```

---

### Phase 1.3: 推理服务部署

#### Issue #12: 创建FastAPI推理服务

**标签**: `ai-recommendation`, `ml`, `backend`, `p0`  
**优先级**: P0  
**依赖**: #11  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

创建Python FastAPI推理服务。

## 子任务

- [ ] 创建`ml/inference/`目录
- [ ] 实现`main.py`（FastAPI应用）
- [ ] 实现`/recommend` endpoint
- [ ] 实现`/health` endpoint
- [ ] 复制`feature_engineering.py`到inference目录
- [ ] 本地测试

## 代码框架

参考 [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md) - Issue #P1-6 中的完整代码。

## 验收标准

- [ ] FastAPI服务可以本地启动
- [ ] `/recommend`返回10个英雄ID
- [ ] `/health`正常响应
- [ ] 推理延迟 < 100ms
```

---

#### Issue #13: 编写Dockerfile并本地测试

**标签**: `ai-recommendation`, `deployment`, `p0`  
**优先级**: P0  
**依赖**: #12  
**预计工时**: 2小时

**描述**:
```markdown
## 任务描述

为推理服务创建Dockerfile并本地测试。

## 子任务

- [ ] 创建`Dockerfile`
- [ ] 优化镜像大小
- [ ] 本地构建并运行
- [ ] 测试容器内API

## Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py feature_engineering.py model.json ./

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## 验收标准

- [ ] Docker镜像成功构建
- [ ] 容器可以正常启动
- [ ] API测试通过
```

---

#### Issue #14: 部署到Cloud Run

**标签**: `ai-recommendation`, `deployment`, `p0`  
**优先级**: P0  
**依赖**: #13  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

将推理服务部署到Google Cloud Run。

## 子任务

- [ ] 创建部署脚本`deploy.sh`
- [ ] 配置Cloud Run参数
- [ ] 部署服务
- [ ] 配置IAM权限
- [ ] 测试生产环境API
- [ ] 进行压力测试

## deploy.sh

```bash
#!/bin/bash
PROJECT_ID="windy10v10ai"
SERVICE_NAME="hero-recommendation"
REGION="asia-northeast1"

# 构建镜像
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${SERVICE_NAME}

# 部署
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 1
```

## 验收标准

- [ ] Cloud Run服务成功部署
- [ ] 获得公网URL
- [ ] 延迟 < 200ms（P95）
- [ ] 可以处理10并发请求
```

---

#### Issue #15: 游戏Bot集成推荐API

**标签**: `ai-recommendation`, `game-bot`, `p0`  
**优先级**: P0  
**依赖**: #14  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

在游戏Bot中集成AI推荐API。

## 子任务

- [ ] 在Bot代码中添加HTTP请求
- [ ] BP阶段调用推荐API
- [ ] 添加fallback机制（API失败时使用默认逻辑）
- [ ] 添加feature flag控制
- [ ] 添加日志记录

## 验收标准

- [ ] Bot可以成功调用Cloud Run API
- [ ] API失败时不影响游戏
- [ ] 有日志记录推荐结果
- [ ] 可以通过配置开关启用/禁用
```

---

### Phase 1.4: 灰度测试

#### Issue #16: 灰度测试和效果评估

**标签**: `ai-recommendation`, `testing`, `p1`  
**优先级**: P1  
**依赖**: #15  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

进行灰度测试并评估AI推荐效果。

## 子任务

- [ ] 配置10%流量使用AI推荐
- [ ] 收集至少100场对局数据
- [ ] 统计AI推荐的Dire胜率
- [ ] 与历史基线对比
- [ ] 分析效果并决定是否全量

## SQL监控查询

```sql
-- 统计不同推荐策略的胜率对比
-- 注意：需要在game_end_match事件中添加recommendation_strategy参数
SELECT
  recommendation_strategy,
  COUNT(*) as total_matches,
  SUM(CASE WHEN winner = 3 THEN 1 ELSE 0 END) as dire_wins,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate
FROM `windy10v10ai.dota2.matches`
WHERE recommendation_strategy IS NOT NULL
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY recommendation_strategy
ORDER BY dire_win_rate DESC;
```

## 验收标准

- [ ] 至少运行100场AI推荐对局
- [ ] 有胜率统计数据
- [ ] 无严重Bug或崩溃
- [ ] 决策：是否全量上线
```

---

## Phase 2: 持续优化

### Phase 2.1: 模型优化

#### Issue #17: 模型调参优化

**标签**: `ai-recommendation`, `ml`, `p2`  
**优先级**: P2  
**依赖**: #11  
**预计工时**: 10小时

**描述**:
```markdown
## 任务描述

通过调参优化模型效果。

## 子任务

- [ ] 尝试不同超参数组合
- [ ] 实验不同的特征工程方法
- [ ] 分析特征重要性
- [ ] 记录实验结果

## 验收标准

- [ ] 至少尝试5组不同参数
- [ ] 找到比baseline更好的配置
- [ ] 有详细的实验记录
```

---

### Phase 2.2: 自动化

#### Issue #18: 设置每周自动重训练

**标签**: `ai-recommendation`, `automation`, `p2`  
**优先级**: P2  
**依赖**: #11  
**预计工时**: 6小时

**描述**:
```markdown
## 任务描述

设置每周自动化重训练流程。

## 子任务

- [ ] 创建Cloud Functions触发训练
- [ ] 配置Cloud Scheduler（每周日凌晨执行）
- [ ] 自动部署新模型到Cloud Run
- [ ] 设置邮件/Slack通知

## 验收标准

- [ ] 每周自动训练成功
- [ ] 新模型自动部署
- [ ] 有邮件/Slack通知
```

---

#### Issue #19: 创建监控Dashboard

**标签**: `ai-recommendation`, `monitoring`, `p2`  
**优先级**: P2  
**依赖**: #1  
**预计工时**: 4小时

**描述**:
```markdown
## 任务描述

创建监控Dashboard跟踪关键指标。

## 子任务

- [ ] 创建BigQuery视图
- [ ] 在Looker Studio创建Dashboard
- [ ] 添加胜率下降告警

## 关键指标

- 每日对局数
- Dire胜率趋势
- 推荐英雄分布
- API延迟P50/P95/P99

## 验收标准

- [ ] Dashboard可访问
- [ ] 数据每日更新
- [ ] 有告警机制
```

---

## 里程碑建议

建议创建以下Milestones来组织issues：

1. **M1: 数据基础设施完成** - Issues #1-#3（历史数据导入）
2. **M2: 持续数据收集上线** - Issues #4-#6（持续写入）
3. **M3: 训练环境就绪** - Issues #7-#9
4. **M4: 首个模型训练完成** - Issues #10-#11
5. **M5: 推理服务上线** - Issues #12-#14
6. **M6: 灰度测试完成** - Issues #15-#16
7. **M7: 持续优化** - Issues #17-#19

---

## 创建说明

### 方式1: 使用脚本批量创建标签

```bash
#!/bin/bash
# 需要先安装gh CLI: https://cli.github.com/

# 创建标签
gh label create "ai-recommendation" --color "0E8A16" --description "AI hero recommendation system" || true
gh label create "infrastructure" --color "D93F0B" || true
gh label create "ml" --color "5319E7" --description "Machine learning" || true
gh label create "data" --color "0052CC" --description "Data related" || true
gh label create "backend" --color "FBCA04" || true
gh label create "deployment" --color "D4C5F9" || true
gh label create "game-bot" --color "1D76DB" || true
gh label create "testing" --color "0E8A16" || true
gh label create "automation" --color "5319E7" || true
gh label create "monitoring" --color "B60205" || true
gh label create "p0" --color "D73A4A" --description "Highest priority" || true
gh label create "p1" --color "FBCA04" --description "High priority" || true
gh label create "p2" --color "0075CA" --description "Medium priority" || true
gh label create "p3" --color "7057FF" --description "Low priority" || true

echo "标签创建完成，请访问 https://github.com/windy10v10ai/firebase/issues/new 手动创建issues"
```

### 方式2: 手动创建

访问 https://github.com/windy10v10ai/firebase/issues/new 逐个创建上述issues。

---

## 关键差异说明

相比旧的Issues方案，本方案的关键改进：

1. ✅ **先导入历史数据**（Issue #2）：立即有≥50,000场对局可训练，无需等待
2. ✅ **细粒度任务拆分**：每个Issue职责单一，便于跟踪和并行开发
3. ✅ **清晰的依赖关系**：明确标注依赖，避免阻塞
4. ✅ **优先级明确**：P0任务必须优先完成，P1/P2可以并行

---

**版本**: v3.0（融合V2策略+细粒度拆分）  
**更新日期**: 2026-01-14  
**参考文档**: [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md)
