# GitHub Issues创建清单

以下是需要创建的20个GitHub Issues。请访问 https://github.com/windy10v10ai/firebase/issues/new 逐个创建。

---

## 阶段1：数据收集基础设施

### Issue #1: 创建BigQuery数据集和表结构

**标签**: `ai-recommendation`, `infrastructure`, `p0`
**优先级**: P0

**描述**:
```markdown
## 任务描述

为AI英雄推荐系统创建BigQuery数据集和对局数据表。

## 子任务

- [ ] 在GCP控制台创建`dota2` dataset
- [ ] 创建`matches`表（见下方SQL）
- [ ] 配置分区策略（按日期）
- [ ] 验证表创建成功

## 表结构SQL

```sql
CREATE TABLE `windy10v10ai.dota2.matches` (
  match_id STRING NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  winner INT64,
  radiant_heroes ARRAY<INT64>,
  dire_heroes ARRAY<INT64>,
  duration_msec INT64,
  game_version STRING,
  difficulty INT64,
  server_type STRING,
  radiant_player_count INT64,
  dire_player_count INT64
)
PARTITION BY DATE(timestamp)
OPTIONS(
  description = "Dota2 10v10 match records for hero recommendation training"
);
```

## 验收标准

- [ ] BigQuery中存在`windy10v10ai.dota2.matches`表
- [ ] 表结构包含所有必需字段
- [ ] 可以手动插入测试数据

## 参考文档

- [ARCHITECTURE.md](../blob/claude/integrate-hero-recommendation-OnsYk/docs/ai-recommendation/ARCHITECTURE.md)

**预计工时**: 2小时

---

### Issue #2: 实现BigQueryService

**标签**: `ai-recommendation`, `backend`, `p0`
**依赖**: #1

**描述**:
```markdown
## 任务描述

在NestJS后端实现BigQuery写入服务。

## 子任务

- [ ] 安装`@google-cloud/bigquery`依赖
- [ ] 创建`api/src/bigquery/bigquery.module.ts`
- [ ] 实现`api/src/bigquery/bigquery.service.ts`
- [ ] 实现`saveMatch()`方法
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
    // 实现逻辑
  }
}
```

## 验收标准

- [ ] 单元测试通过率100%
- [ ] 可以成功写入测试数据到BigQuery
- [ ] 错误情况有适当日志

**预计工时**: 4小时
**依赖**: Issue #1

---

### Issue #3: 在Analytics服务中集成BigQuery写入

**标签**: `ai-recommendation`, `backend`, `p0`
**依赖**: #2

**描述**:
```markdown
## 任务描述

在现有的Analytics服务中集成BigQuery写入逻辑。

## 子任务

- [ ] 在`app.module.ts`中导入`BigQueryModule`
- [ ] 在`analytics.service.ts`中注入`BigQueryService`
- [ ] 在`gameEndMatch()`方法中调用`bigQueryService.saveMatch()`
- [ ] 添加feature flag控制是否启用
- [ ] 更新e2e测试

## 代码示例

```typescript
// api/src/analytics/analytics.service.ts
async gameEndMatch(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
  // 现有GA4逻辑
  await this.sendToGA4(gameEnd);

  // 新增BigQuery写入
  if (process.env.ENABLE_BIGQUERY_EXPORT === 'true') {
    try {
      await this.bigQueryService.saveMatch(gameEnd);
    } catch (error) {
      this.logger.error('Failed to save match to BigQuery', error);
    }
  }
}
```

## 验收标准

- [ ] 本地emulator测试通过
- [ ] e2e测试通过
- [ ] 有feature flag可以关闭BigQuery写入

**预计工时**: 2小时
**依赖**: Issue #2

---

### Issue #4: 部署并验证数据收集

**标签**: `ai-recommendation`, `deployment`, `p0`
**依赖**: #3

**描述**:
```markdown
## 任务描述

部署BigQuery集成并验证数据收集正常工作。

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

**预计工时**: 2小时
**依赖**: Issue #3

---

## 阶段2：训练环境搭建

### Issue #5: 创建Python训练项目结构

**标签**: `ai-recommendation`, `ml`, `p1`

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
│   ├── README.md
│   ├── requirements.txt
│   ├── data_loader.py
│   ├── feature_engineering.py
│   ├── train.py
│   ├── evaluate.py
│   └── config.yaml
└── inference/
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

**预计工时**: 3小时

---

### Issue #6: 实现数据加载器

**标签**: `ai-recommendation`, `ml`, `p1`
**依赖**: #4, #5

**描述**:
```markdown
## 任务描述

实现从BigQuery加载训练数据的模块。

## 子任务

- [ ] 实现`data_loader.py`
- [ ] 支持按时间范围查询
- [ ] 支持数据过滤（过滤异常对局）
- [ ] 添加数据统计功能
- [ ] 本地测试（需要GCP认证）

## 代码框架

```python
from google.cloud import bigquery
import pandas as pd

class MatchDataLoader:
    def load_recent_matches(self, days=60):
        """加载最近N天的对局数据"""
        pass

    def get_data_stats(self, df):
        """打印数据统计信息"""
        pass
```

## 验收标准

- [ ] 可以成功从BigQuery加载数据
- [ ] DataFrame格式正确
- [ ] 有数据质量检查

**预计工时**: 4小时
**依赖**: Issue #4, #5

---

### Issue #7: 实现特征工程模块

**标签**: `ai-recommendation`, `ml`, `p1`
**依赖**: #6

**描述**:
```markdown
## 任务描述

实现特征工程模块，包括编码函数和样本生成。

## 子任务

- [ ] 实现`encode_radiant()`函数
- [ ] 实现`encode_dire()`函数
- [ ] 实现样本生成逻辑
- [ ] 添加单元测试
- [ ] 验证特征维度（260维）

## 验收标准

- [ ] 单元测试覆盖所有边界情况
- [ ] 可以从1条对局生成10个样本
- [ ] 特征向量维度正确

**预计工时**: 6小时
**依赖**: Issue #6

---

### Issue #8: 实现XGBoost训练脚本

**标签**: `ai-recommendation`, `ml`, `p1`
**依赖**: #7

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

## 配置文件

```yaml
data:
  days: 60
  train_ratio: 0.8

model:
  max_depth: 8
  learning_rate: 0.1
  n_estimators: 200
```

## 验收标准

- [ ] 可以在真实数据上训练
- [ ] 训练过程有进度输出
- [ ] 模型保存为`model.json`

**预计工时**: 6小时
**依赖**: Issue #7

---

## 阶段3：模型训练与评估

### Issue #9: 收集训练数据并进行首次训练

**标签**: `ai-recommendation`, `ml`, `p1`
**依赖**: #4, #8

**描述**:
```markdown
## 任务描述

等待收集足够数据后进行首次模型训练。

## 子任务

- [ ] 确认至少有1000场对局数据
- [ ] 运行数据加载和统计
- [ ] 执行首次模型训练
- [ ] 记录训练结果

## 验收标准

- [ ] 至少1000场对局数据
- [ ] 训练成功完成
- [ ] 验证集准确率 > 1%

**预计工时**: 4小时
**依赖**: Issue #4, #8

---

### Issue #10: 实现离线评估脚本

**标签**: `ai-recommendation`, `ml`, `p2`
**依赖**: #9

**描述**:
```markdown
## 任务描述

实现模型离线评估脚本。

## 子任务

- [ ] 实现`evaluate.py`
- [ ] 评估Top-1/Top-3/Top-5准确率
- [ ] 模拟推荐流程计算胜率
- [ ] 生成评估报告

## 验收标准

- [ ] 可以评估任意模型文件
- [ ] 输出详细指标报告

**预计工时**: 4小时
**依赖**: Issue #9

---

### Issue #11: 模型调参优化

**标签**: `ai-recommendation`, `ml`, `p2`
**依赖**: #10

**描述**:
```markdown
## 任务描述

通过调参优化模型效果。

## 子任务

- [ ] 尝试不同超参数组合
- [ ] 分析特征重要性
- [ ] 记录实验结果

## 验收标准

- [ ] 至少尝试3组参数
- [ ] 找到比baseline更好的配置

**预计工时**: 8小时
**依赖**: Issue #10

---

## 阶段4：推理服务部署

### Issue #12: 创建FastAPI推理服务

**标签**: `ai-recommendation`, `ml`, `backend`, `p1`
**依赖**: #9

**描述**:
```markdown
## 任务描述

创建Python FastAPI推理服务。

## 子任务

- [ ] 创建`ml/inference/`目录
- [ ] 实现`main.py`（FastAPI应用）
- [ ] 实现`/recommend` endpoint
- [ ] 实现`/health` endpoint
- [ ] 本地测试

## 验收标准

- [ ] FastAPI服务可以本地启动
- [ ] `/recommend`返回正确格式
- [ ] 推理延迟 < 100ms

**预计工时**: 6小时
**依赖**: Issue #9

---

### Issue #13: 编写Dockerfile并本地测试

**标签**: `ai-recommendation`, `deployment`, `p1`
**依赖**: #12

**描述**:
```markdown
## 任务描述

为推理服务创建Dockerfile并测试。

## 子任务

- [ ] 创建`Dockerfile`
- [ ] 优化镜像大小
- [ ] 本地构建并运行
- [ ] 测试容器内API

## 验收标准

- [ ] Docker镜像成功构建
- [ ] 容器可以正常启动
- [ ] API测试通过

**预计工时**: 3小时
**依赖**: Issue #12

---

### Issue #14: 部署到Cloud Run

**标签**: `ai-recommendation`, `deployment`, `p1`
**依赖**: #13

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

## 验收标准

- [ ] Cloud Run服务成功部署
- [ ] 获得公网URL
- [ ] 延迟 < 200ms

**预计工时**: 4小时
**依赖**: Issue #13

---

### Issue #15: (可选) 在NestJS中添加推荐API转发层

**标签**: `ai-recommendation`, `backend`, `p3`, `optional`
**依赖**: #14

**描述**:
```markdown
## 任务描述

在NestJS中添加API转发层（可选）。

## 子任务

- [ ] 创建`hero-recommendation`模块
- [ ] 实现controller转发
- [ ] 添加错误处理
- [ ] 更新Swagger文档

## 验收标准

- [ ] NestJS可以调用Python服务
- [ ] 有适当错误处理

**预计工时**: 3小时
**依赖**: Issue #14

---

## 阶段5：集成与上线

### Issue #16: 游戏Bot集成推荐API

**标签**: `ai-recommendation`, `game-bot`, `p0`
**依赖**: #14

**描述**:
```markdown
## 任务描述

在游戏Bot中集成AI推荐API。

## 子任务

- [ ] 在Bot代码中添加HTTP请求
- [ ] BP阶段调用推荐API
- [ ] 添加fallback机制
- [ ] 添加feature flag

## 验收标准

- [ ] Bot可以成功调用API
- [ ] API失败时不影响游戏
- [ ] 有日志记录

**预计工时**: 6小时
**依赖**: Issue #14

---

### Issue #17: 灰度测试与监控

**标签**: `ai-recommendation`, `testing`, `p1`
**依赖**: #16

**描述**:
```markdown
## 任务描述

进行灰度测试并监控效果。

## 子任务

- [ ] 配置10%流量使用AI推荐
- [ ] 记录推荐结果和胜率
- [ ] 创建BigQuery统计查询
- [ ] 观察1周数据

## 验收标准

- [ ] 至少100场AI推荐对局
- [ ] 有胜率统计数据
- [ ] 无严重Bug

**预计工时**: 4小时
**依赖**: Issue #16

---

### Issue #18: 全量上线

**标签**: `ai-recommendation`, `deployment`, `p1`
**依赖**: #17

**描述**:
```markdown
## 任务描述

分析灰度测试结果并全量上线。

## 子任务

- [ ] 分析灰度测试结果
- [ ] 将流量调整为100%
- [ ] 更新文档和公告

## 验收标准

- [ ] AI推荐成为默认选项
- [ ] 胜率有提升（目标25%+）

**预计工时**: 2小时
**依赖**: Issue #17

---

## 阶段6：监控与迭代

### Issue #19: 设置自动化重训练

**标签**: `ai-recommendation`, `automation`, `p2`
**依赖**: #18

**描述**:
```markdown
## 任务描述

设置每周自动化重训练流程。

## 子任务

- [ ] 创建Cloud Functions触发训练
- [ ] 配置Cloud Scheduler
- [ ] 自动部署新模型
- [ ] 设置通知

## 验收标准

- [ ] 每周自动训练成功
- [ ] 新模型自动部署
- [ ] 有邮件通知

**预计工时**: 6小时
**依赖**: Issue #18

---

### Issue #20: 创建监控Dashboard

**标签**: `ai-recommendation`, `monitoring`, `p2`
**依赖**: #18

**描述**:
```markdown
## 任务描述

创建监控Dashboard跟踪关键指标。

## 子任务

- [ ] 创建BigQuery视图
- [ ] 在Looker Studio创建Dashboard
- [ ] 添加告警

## 关键指标

- 每日对局数
- Dire胜率趋势
- 推荐英雄分布
- API延迟

## 验收标准

- [ ] Dashboard可访问
- [ ] 数据每日更新
- [ ] 有胜率下降告警

**预计工时**: 4小时
**依赖**: Issue #18

---

## 创建说明

### 方式1: 使用脚本批量创建（推荐）

将以下内容保存为`create_issues.sh`并执行：

```bash
#!/bin/bash
# 需要先安装gh CLI: https://cli.github.com/

# 创建标签
gh label create "ai-recommendation" --color "0E8A16" --description "AI hero recommendation system" || true
gh label create "infrastructure" --color "D93F0B" || true
gh label create "ml" --color "5319E7" --description "Machine learning" || true
gh label create "p0" --color "D73A4A" --description "Highest priority" || true
gh label create "p1" --color "FBCA04" --description "High priority" || true
gh label create "p2" --color "0075CA" --description "Medium priority" || true
gh label create "p3" --color "7057FF" --description "Low priority" || true

# 然后手动创建每个issue（因为body太长，建议手动创建）
echo "标签创建完成，请访问 https://github.com/windy10v10ai/firebase/issues/new 手动创建issues"
```

### 方式2: 手动创建

访问 https://github.com/windy10v10ai/firebase/issues/new 逐个创建上述issues。

---

## 里程碑建议

建议创建以下Milestones来组织issues：

1. **M1: 数据收集上线** - Issues #1-#4
2. **M2: 首个模型训练** - Issues #5-#9
3. **M3: 推理服务上线** - Issues #10-#14
4. **M4: 全量上线** - Issues #15-#18
5. **M5: 持续优化** - Issues #19-#20
