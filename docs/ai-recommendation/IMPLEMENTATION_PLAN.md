# AI英雄推荐系统 - 实施计划

## 概览

本文档将实施工作分解为可独立完成的小任务，每个任务对应一个GitHub Issue。

---

## 阶段1：数据收集基础设施（预计1周）

### Issue #1: 创建BigQuery数据集和表结构
**优先级**：P0（阻塞其他任务）
**预计工时**：2小时

**任务描述**：
- [ ] 在GCP控制台创建`dota2` dataset
- [ ] 创建`matches`表（见ARCHITECTURE.md中的表结构）
- [ ] 配置分区策略（按日期）
- [ ] 验证表创建成功

**验收标准**：
- BigQuery中存在`windy10v10ai.dota2.matches`表
- 表结构包含所有必需字段
- 可以手动插入测试数据

**相关文档**：`docs/ai-recommendation/ARCHITECTURE.md#bigquery表结构`

---

### Issue #2: 实现BigQueryService
**优先级**：P0
**预计工时**：4小时
**依赖**：#1

**任务描述**：
- [ ] 安装`@google-cloud/bigquery`依赖
- [ ] 创建`api/src/bigquery/bigquery.module.ts`
- [ ] 实现`api/src/bigquery/bigquery.service.ts`
- [ ] 实现`saveMatch()`方法
- [ ] 添加单元测试
- [ ] 添加错误处理（网络失败、配额超限）

**验收标准**：
- 单元测试通过率100%
- 可以成功写入测试数据到BigQuery
- 错误情况有适当日志

**技术细节**：
```typescript
// api/src/bigquery/bigquery.service.ts
import { BigQuery } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';
import { GameEndMatchDto } from '../analytics/dto/game-end-dto';

@Injectable()
export class BigQueryService {
  private readonly logger = new Logger(BigQueryService.name);
  private bigquery = new BigQuery();
  private dataset = this.bigquery.dataset('dota2');
  private table = this.dataset.table('matches');

  async saveMatch(gameEnd: GameEndMatchDto): Promise<void> {
    // 实现逻辑见ARCHITECTURE.md
  }
}
```

---

### Issue #3: 在Analytics服务中集成BigQuery写入
**优先级**：P0
**预计工时**：2小时
**依赖**：#2

**任务描述**：
- [ ] 在`app.module.ts`中导入`BigQueryModule`
- [ ] 在`analytics.service.ts`中注入`BigQueryService`
- [ ] 在`gameEndMatch()`方法中调用`bigQueryService.saveMatch()`
- [ ] 添加feature flag控制是否启用（方便回滚）
- [ ] 更新e2e测试

**验收标准**：
- 本地emulator测试通过
- e2e测试通过
- 有feature flag可以关闭BigQuery写入

**代码示例**：
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
      // 不抛出异常，避免影响GA4流程
    }
  }
}
```

---

### Issue #4: 部署并验证数据收集
**优先级**：P0
**预计工时**：2小时
**依赖**：#3

**任务描述**：
- [ ] 设置环境变量`ENABLE_BIGQUERY_EXPORT=true`
- [ ] 部署到Firebase Functions
- [ ] 运行测试对局
- [ ] 在BigQuery控制台验证数据
- [ ] 编写SQL查询示例文档

**验收标准**：
- 至少有10条测试对局数据写入BigQuery
- 数据格式正确（数组长度、英雄ID有效）
- 有查询示例文档

**SQL验证查询**：
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

---

## 阶段2：训练环境搭建（预计1周）

### Issue #5: 创建Python训练项目结构
**优先级**：P1
**预计工时**：3小时

**任务描述**：
- [ ] 创建`ml/training/`目录结构
- [ ] 创建`requirements.txt`
- [ ] 创建`README.md`（环境设置指南）
- [ ] 添加`.gitignore`（忽略模型文件、数据文件）

**目录结构**：
```
ml/
├── training/
│   ├── README.md           # 训练指南
│   ├── requirements.txt    # Python依赖
│   ├── data_loader.py      # BigQuery数据加载
│   ├── feature_engineering.py  # 特征工程
│   ├── train.py            # 训练脚本
│   ├── evaluate.py         # 评估脚本
│   └── config.yaml         # 训练配置
└── inference/
    └── (后续阶段)
```

**requirements.txt**：
```
google-cloud-bigquery==3.14.0
pandas==2.1.4
numpy==1.26.2
xgboost==2.0.3
scikit-learn==1.3.2
pyyaml==6.0.1
```

---

### Issue #6: 实现数据加载器
**优先级**：P1
**预计工时**：4小时
**依赖**：#4, #5

**任务描述**：
- [ ] 实现`data_loader.py`
- [ ] 支持按时间范围查询
- [ ] 支持数据过滤（过滤异常对局）
- [ ] 添加数据统计功能
- [ ] 本地测试（需要GCP认证）

**验收标准**：
- 可以成功从BigQuery加载数据
- DataFrame格式正确
- 有数据质量检查（例如：英雄ID是否在1-130范围）

**代码框架**：
```python
# ml/training/data_loader.py
from google.cloud import bigquery
import pandas as pd

class MatchDataLoader:
    def __init__(self, project_id='windy10v10ai'):
        self.client = bigquery.Client(project=project_id)

    def load_recent_matches(self, days=60, min_radiant=1, min_dire=10):
        """加载最近N天的对局数据"""
        query = f"""
        SELECT *
        FROM `windy10v10ai.dota2.matches`
        WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
          AND array_length(radiant_heroes) >= {min_radiant}
          AND array_length(dire_heroes) = {min_dire}
        """
        df = self.client.query(query).to_dataframe()
        return df

    def get_data_stats(self, df):
        """打印数据统计信息"""
        print(f"总对局数: {len(df)}")
        print(f"Dire胜率: {(df['winner'] == 3).mean():.2%}")
        # 更多统计...
```

---

### Issue #7: 实现特征工程模块
**优先级**：P1
**预计工时**：6小时
**依赖**：#6

**任务描述**：
- [ ] 实现`encode_radiant()`函数
- [ ] 实现`encode_dire()`函数
- [ ] 实现样本生成逻辑
- [ ] 添加单元测试
- [ ] 验证特征维度正确（260维）

**验收标准**：
- 单元测试覆盖所有边界情况
- 可以从1条对局数据生成10个训练样本
- 特征向量维度正确

**代码框架**：
```python
# ml/training/feature_engineering.py
import numpy as np

HERO_COUNT = 130

def encode_radiant(hero_ids: list) -> np.ndarray:
    """计数向量编码（可重复）"""
    vector = np.zeros(HERO_COUNT, dtype=np.int32)
    for hero_id in hero_ids:
        if 1 <= hero_id <= HERO_COUNT:
            vector[hero_id - 1] += 1
    return vector

def encode_dire(hero_ids: list) -> np.ndarray:
    """Multi-hot编码（不可重复）"""
    vector = np.zeros(HERO_COUNT, dtype=np.int32)
    for hero_id in hero_ids:
        if 1 <= hero_id <= HERO_COUNT:
            vector[hero_id - 1] = 1
    return vector

def generate_training_samples(match_row):
    """从一场对局生成10个训练样本"""
    # 实现见ARCHITECTURE.md
    pass
```

---

### Issue #8: 实现XGBoost训练脚本
**优先级**：P1
**预计工时**：6小时
**依赖**：#7

**任务描述**：
- [ ] 实现`train.py`主脚本
- [ ] 支持配置文件（`config.yaml`）
- [ ] 实现训练/验证集划分
- [ ] 实现早停（early stopping）
- [ ] 保存训练日志和模型文件
- [ ] 添加命令行参数支持

**验收标准**：
- 可以在真实数据上训练模型
- 训练过程有进度输出
- 模型文件保存为`model.json`
- 有训练日志

**配置文件示例**：
```yaml
# ml/training/config.yaml
data:
  days: 60
  train_ratio: 0.8

model:
  max_depth: 8
  learning_rate: 0.1
  n_estimators: 200
  subsample: 0.8
  colsample_bytree: 0.8
  scale_pos_weight: 4

training:
  early_stopping_rounds: 20
  eval_metric: mlogloss
```

---

## 阶段3：模型训练与评估（预计1-2周）

### Issue #9: 收集训练数据并进行首次训练
**优先级**：P1
**预计工时**：4小时
**依赖**：#4, #8

**任务描述**：
- [ ] 等待收集足够数据（建议至少1周）
- [ ] 运行数据加载和统计
- [ ] 执行首次模型训练
- [ ] 记录训练结果（loss曲线、准确率）

**验收标准**：
- 至少有1000场对局数据
- 训练成功完成
- 验证集准确率 > 随机猜测（1/130 ≈ 0.77%）

**命令**：
```bash
cd ml/training
python train.py --config config.yaml --output models/v0.1.0
```

---

### Issue #10: 实现离线评估脚本
**优先级**：P2
**预计工时**：4小时
**依赖**：#9

**任务描述**：
- [ ] 实现`evaluate.py`脚本
- [ ] 评估指标：Top-1/Top-3/Top-5准确率
- [ ] 模拟推荐流程并计算胜率提升
- [ ] 生成评估报告

**验收标准**：
- 可以评估任意模型文件
- 输出详细的指标报告
- 有可视化图表（可选）

**评估指标**：
```
Top-1准确率：推荐的第1个英雄是否是实际选择
Top-3准确率：推荐的前3个是否包含实际选择
模拟胜率：使用推荐阵容的历史胜率
```

---

### Issue #11: 模型调参优化
**优先级**：P2
**预计工时**：8小时
**依赖**：#10

**任务描述**：
- [ ] 尝试不同的超参数组合
- [ ] 使用GridSearch或随机搜索
- [ ] 分析特征重要性
- [ ] 记录实验结果

**验收标准**：
- 至少尝试3组不同参数
- 找到比baseline更好的配置
- 有实验记录文档

---

## 阶段4：推理服务部署（预计1周）

### Issue #12: 创建FastAPI推理服务
**优先级**：P1
**预计工时**：6小时
**依赖**：#9

**任务描述**：
- [ ] 创建`ml/inference/`目录
- [ ] 实现`main.py`（FastAPI应用）
- [ ] 实现`/recommend` endpoint
- [ ] 实现`/health` endpoint
- [ ] 实现特征编码逻辑（复用训练代码）
- [ ] 本地测试

**目录结构**：
```
ml/inference/
├── main.py
├── feature_engineering.py  # 从training/复制
├── requirements.txt
├── Dockerfile
├── model.json              # 训练好的模型
└── README.md
```

**验收标准**：
- FastAPI服务可以在本地启动
- `/recommend` endpoint返回正确格式
- `/health` endpoint正常
- 推理延迟 < 100ms

---

### Issue #13: 编写Dockerfile并本地测试
**优先级**：P1
**预计工时**：3小时
**依赖**：#12

**任务描述**：
- [ ] 创建`Dockerfile`
- [ ] 优化镜像大小（使用slim基础镜像）
- [ ] 本地构建并运行容器
- [ ] 测试容器内的API

**Dockerfile**：
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码和模型
COPY main.py feature_engineering.py ./
COPY model.json .

# 健康检查
HEALTHCHECK CMD curl --fail http://localhost:8080/health || exit 1

# 启动服务
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**验收标准**：
- Docker镜像可以成功构建
- 容器可以正常启动
- 通过curl测试API正常

---

### Issue #14: 部署到Cloud Run
**优先级**：P1
**预计工时**：4小时
**依赖**：#13

**任务描述**：
- [ ] 创建部署脚本`deploy.sh`
- [ ] 配置Cloud Run参数（内存、CPU、region）
- [ ] 部署服务
- [ ] 配置IAM权限（是否允许未认证访问）
- [ ] 测试生产环境API

**部署脚本**：
```bash
#!/bin/bash
# ml/inference/deploy.sh

PROJECT_ID="windy10v10ai"
SERVICE_NAME="hero-recommendation"
REGION="asia-northeast1"

# 构建镜像
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${SERVICE_NAME}

# 部署到Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0
```

**验收标准**：
- Cloud Run服务成功部署
- 获得公网URL
- 延迟测试 < 200ms
- 并发测试通过（10个并发请求）

---

### Issue #15: （可选）在NestJS中添加推荐API转发层
**优先级**：P3
**预计工时**：3小时
**依赖**：#14

**任务描述**：
- [ ] 创建`hero-recommendation`模块
- [ ] 实现controller转发到Cloud Run服务
- [ ] 添加错误处理和超时控制
- [ ] 添加API文档（Swagger）

**验收标准**：
- NestJS API可以成功调用Python服务
- 有适当的错误处理
- Swagger文档更新

---

## 阶段5：集成与上线（预计1周）

### Issue #16: 游戏Bot集成推荐API
**优先级**：P0
**预计工时**：6小时
**依赖**：#14

**任务描述**：
- [ ] 在Bot代码中添加HTTP请求逻辑
- [ ] 在BP阶段调用推荐API
- [ ] 添加fallback机制（API失败时使用默认逻辑）
- [ ] 添加feature flag控制

**验收标准**：
- Bot可以成功调用推荐API
- API失败时不影响游戏进行
- 有日志记录推荐结果

---

### Issue #17: 灰度测试与监控
**优先级**：P1
**预计工时**：4小时
**依赖**：#16

**任务描述**：
- [ ] 配置10%流量使用AI推荐
- [ ] 记录推荐结果和实际胜率
- [ ] 创建BigQuery查询统计胜率
- [ ] 观察1周数据

**SQL监控查询**：
```sql
-- 统计AI推荐的胜率
SELECT
  COUNT(*) as total_matches,
  SUM(CASE WHEN winner = 3 THEN 1 ELSE 0 END) as dire_wins,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate
FROM `windy10v10ai.dota2.matches`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND server_type = 'ai_recommendation';
```

**验收标准**：
- 至少运行100场AI推荐对局
- 有胜率统计数据
- 无严重Bug

---

### Issue #18: 全量上线
**优先级**：P1
**预计工时**：2小时
**依赖**：#17

**任务描述**：
- [ ] 分析灰度测试结果
- [ ] 将流量调整为100%
- [ ] 更新文档和公告

**验收标准**：
- AI推荐成为默认选项
- 胜率有提升（目标：从20%提升到25%+）

---

## 阶段6：监控与迭代（持续）

### Issue #19: 设置自动化重训练
**优先级**：P2
**预计工时**：6小时
**依赖**：#18

**任务描述**：
- [ ] 创建Cloud Functions触发训练
- [ ] 配置Cloud Scheduler（每周执行）
- [ ] 自动部署新模型到Cloud Run
- [ ] 发送训练结果通知

**架构**：
```
Cloud Scheduler (每周日凌晨)
    ↓
Cloud Functions (触发训练任务)
    ↓
Cloud Run Jobs (执行训练脚本)
    ↓
上传模型到GCS → 触发重新部署推理服务
```

**验收标准**：
- 每周自动训练成功
- 新模型自动部署
- 有邮件/Slack通知

---

### Issue #20: 创建监控Dashboard
**优先级**：P2
**预计工时**：4小时
**依赖**：#18

**任务描述**：
- [ ] 创建BigQuery视图（胜率、推荐分布）
- [ ] 在Looker Studio创建Dashboard
- [ ] 添加告警（胜率异常下降）

**关键指标**：
- 每日对局数
- Dire胜率趋势
- 推荐英雄分布（是否过于集中）
- API延迟P50/P95/P99

**验收标准**：
- Dashboard可访问
- 数据每日更新
- 有胜率下降告警

---

## 总结

### 关键路径（必须按顺序完成）
```
#1 → #2 → #3 → #4 → #9 → #12 → #13 → #14 → #16 → #17 → #18
```

### 总预计工时
- 阶段1：10小时
- 阶段2：19小时
- 阶段3：16小时
- 阶段4：16小时
- 阶段5：12小时
- 阶段6：10小时
- **总计**：83小时 ≈ 10-12个工作日

### 里程碑
- ✅ M1: 数据收集上线（完成#1-#4）
- ✅ M2: 首个模型训练完成（完成#9）
- ✅ M3: 推理服务上线（完成#14）
- ✅ M4: 集成完成并全量上线（完成#18）

### 风险提示
- ⚠️ 数据收集至少需要1周，不能跳过
- ⚠️ 如果首次训练效果不好，需要额外时间调参
- ⚠️ 游戏Bot集成可能遇到技术栈差异问题

---

**下一步**：创建GitHub Issues并开始执行阶段1任务。
