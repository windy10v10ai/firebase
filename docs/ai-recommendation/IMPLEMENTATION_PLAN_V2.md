# AI 英雄推荐系统 - 分阶段实施计划 v2

## 概览

本文档将实施工作分为两个阶段：

- **Phase 1**: 快速实验验证（建立专有表，导入历史数据，训练并部署模型）
- **Phase 2**: 持续优化（模型调参、自动重训练、监控）

**关键策略**：先建专有 BigQuery 表并导入 GA4 历史数据，之后所有训练都用这一张表。

---

## Phase 1: 快速实验验证（2-3 周）

**目标**：建立专有数据表，导入历史数据，快速训练模型并验证方案可行性

### Phase 1.0: 数据基础设施（先决条件，2-3 小时）

#### Issue #P1-0: 创建 BigQuery 专有表并导入历史数据

**优先级**：P0（阻塞所有后续任务）
**预计工时**：2-3 小时

**任务描述**：

- [ ] 创建`dota2.matches`专有表
- [ ] 编写从 GA4 导入历史数据的 SQL
- [ ] 执行数据导入（最近 6 个月数据）
- [ ] 验证数据质量和数量

**详细步骤**：见 [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md)

**关键 SQL**：

```sql
-- 1. 建表
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
CLUSTER BY winner, difficulty;

-- 2. 导入数据（见BIGQUERY_SETUP.md中的完整SQL）
INSERT INTO `windy10v10ai.dota2.matches` ...
```

**验收标准**：

- [ ] 专有表创建成功
- [ ] 至少导入 50,000 场历史对局数据
- [ ] Dire 胜率约 20%
- [ ] Radiant 平均人数在 1-10 范围内
- [ ] Dire 固定 10 个英雄

**注意**：持续数据写入功能已拆分到 [Issue #P1-0.1](./ISSUE_P1-0.1.md)，在 P1-0 完成后执行

**为什么先做这一步？**
✅ 统一数据源，后续所有训练都用同一张表
✅ 利用现有 GA4 历史数据，无需等待新数据收集
✅ 数据导入一次性完成，训练时直接查询

---

#### Issue #P1-0.1: 配置持续数据写入（新对局自动写入）

**优先级**：P1（在 P1-0 之后执行）
**预计工时**：4-6 小时
**依赖**：#P1-0

**任务描述**：

- [ ] 实现 BigQueryService（写入服务）
- [ ] 集成到 AnalyticsService（通过环境变量控制）
- [ ] 添加单元测试和错误处理
- [ ] 部署并验证数据写入

**详细步骤**：见 [ISSUE_P1-0.1.md](./ISSUE_P1-0.1.md)

**验收标准**：

- [ ] BigQueryService 可以成功写入测试数据
- [ ] 数据验证逻辑正确（过滤无效数据）
- [ ] 可以通过环境变量`ENABLE_BIGQUERY_EXPORT`控制启用/禁用
- [ ] 部署后新对局数据能正确写入 BigQuery 表

**为什么在 P1-0 之后？**
✅ 表必须先创建，才能写入数据
✅ 历史数据导入是阻塞项，必须优先完成
✅ 持续写入可以在验证历史数据后再配置

---

### Phase 1.1: 环境准备（第 1 周，7 小时）

#### Issue #P1-1: 创建 Python 训练项目结构

**优先级**：P0
**预计工时**：3 小时

**任务描述**：

- [ ] 创建`ml/training/`目录结构
- [ ] 创建`requirements.txt`
- [ ] 创建`README.md`（环境设置指南）
- [ ] 添加`.gitignore`

**目录结构**：

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

**requirements.txt**：

```
google-cloud-bigquery==3.14.0
pandas==2.1.4
numpy==1.26.2
xgboost==2.0.3
scikit-learn==1.3.2
pyyaml==6.0.1
```

**验收标准**：

- [ ] 目录结构完整
- [ ] requirements.txt 可以成功安装
- [ ] README 包含环境设置说明

---

#### Issue #P1-2: 实现专有表数据加载器

**优先级**：P0
**预计工时**：2 小时
**依赖**：#P1-0, #P1-1

**任务描述**：

- [ ] 实现`data_loader.py`从专有表加载数据
- [ ] 支持按时间范围查询
- [ ] 添加数据统计功能
- [ ] 本地测试（需要 GCP 认证）

**关键代码**：

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

        # 英雄选择频率
        all_radiant = [h for heroes in df['radiant_heroes'] for h in heroes]
        all_dire = [h for heroes in df['dire_heroes'] for h in heroes]

        print(f"\n🎯 最常选英雄:")
        print(f"   Radiant: {Counter(all_radiant).most_common(5)}")
        print(f"   Dire: {Counter(all_dire).most_common(5)}")

        return {
            'total': len(df),
            'dire_win_rate': (df['winner'] == 3).mean(),
            'avg_radiant_players': df['radiant_player_count'].mean()
        }

# 测试
if __name__ == '__main__':
    loader = MatchDataLoader()
    df = loader.load_recent_matches(days=90)
    stats = loader.get_data_stats(df)
```

**验收标准**：

- [ ] 可以成功从专有表加载数据
- [ ] DataFrame 包含所有必需字段
- [ ] 数据量 > 50,000 场对局（取决于导入的历史数据）
- [ ] 有详细的数据质量统计输出
- [ ] 查询速度 < 5 秒

---

#### Issue #P1-3: 实现特征工程模块

**优先级**：P0
**预计工时**：4 小时
**依赖**：#P1-2

**任务描述**：

- [ ] 实现`encode_radiant()`函数（计数向量）
- [ ] 实现`encode_dire()`函数（Multi-hot）
- [ ] 实现样本生成逻辑（每场对局 10 个样本）
- [ ] 添加单元测试
- [ ] 验证特征维度（260 维）

**代码框架**：

```python
# ml/training/feature_engineering.py
import numpy as np

HERO_COUNT = 130

def encode_radiant(hero_ids: list) -> np.ndarray:
    """
    计数向量编码（可重复）
    输入：[3, 3, 7, 7, 7] （Radiant有5个玩家）
    输出：130维向量，索引2有2个，索引6有3个
    """
    vector = np.zeros(HERO_COUNT, dtype=np.int32)
    for hero_id in hero_ids:
        if 1 <= hero_id <= HERO_COUNT:
            vector[hero_id - 1] += 1
    return vector

def encode_dire(hero_ids: list) -> np.ndarray:
    """
    Multi-hot编码（不可重复）
    输入：[3, 7, 12]
    输出：130维向量，索引2、6、11为1，其余为0
    """
    vector = np.zeros(HERO_COUNT, dtype=np.int32)
    for hero_id in hero_ids:
        if 1 <= hero_id <= HERO_COUNT:
            vector[hero_id - 1] = 1
    return vector

def generate_training_samples(match_row):
    """
    从一场对局生成10个训练样本

    返回：
    - X: (10, 260) 特征矩阵
    - y: (10, 130) 标签矩阵（one-hot）
    - weights: (10,) 样本权重
    """
    radiant_vec = encode_radiant(match_row['radiant_heroes'])
    dire_heroes = match_row['dire_heroes']
    is_dire_win = (match_row['winner'] == 3)

    X_list = []
    y_list = []
    weights = []

    for i in range(10):
        # 输入：radiant + dire前i个英雄
        dire_picked = dire_heroes[:i]
        dire_vec = encode_dire(dire_picked)
        X = np.concatenate([radiant_vec, dire_vec])

        # 标签：第i+1个英雄（one-hot）
        y_hero = dire_heroes[i]
        y = np.zeros(HERO_COUNT)
        y[y_hero - 1] = 1

        # 权重：Dire赢了，给更高权重
        weight = 1.0 if is_dire_win else 0.25

        X_list.append(X)
        y_list.append(y)
        weights.append(weight)

    return np.array(X_list), np.array(y_list), np.array(weights)

def prepare_dataset(df):
    """将所有对局转换为训练数据"""
    all_X = []
    all_y = []
    all_weights = []

    for _, row in df.iterrows():
        X, y, weights = generate_training_samples(row)
        all_X.append(X)
        all_y.append(y)
        all_weights.append(weights)

    X = np.vstack(all_X)
    y = np.vstack(all_y)
    weights = np.concatenate(all_weights)

    # 转换为类别标签（而非one-hot）
    y_labels = np.argmax(y, axis=1)

    print(f"总样本数: {len(X)}")
    print(f"特征维度: {X.shape[1]}")
    print(f"类别数: {len(np.unique(y_labels))}")

    return X, y_labels, weights
```

**验收标准**：

- [ ] 单元测试通过率 100%
- [ ] 可以从测试数据生成正确的样本
- [ ] 特征向量维度=260
- [ ] 标签范围在[0, 129]

---

### Phase 1.2: 模型训练（第 2 周，12 小时）

#### Issue #P1-4: 实现 XGBoost 训练脚本

**优先级**：P0
**预计工时**：6 小时
**依赖**：#P1-3

**任务描述**：

- [ ] 实现`train.py`主脚本
- [ ] 支持配置文件（`config.yaml`）
- [ ] 实现训练/验证集划分
- [ ] 实现早停（early stopping）
- [ ] 保存训练日志和模型文件
- [ ] 添加命令行参数支持

**config.yaml**：

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

**train.py**：

```python
# ml/training/train.py
import xgboost as xgb
from sklearn.model_selection import train_test_split
import yaml
import argparse
from datetime import datetime

from data_loader import MatchDataLoader
from feature_engineering import prepare_dataset

def train_model(config):
    # 加载数据
    print("加载数据...")
    loader = MatchDataLoader(project_id='windy10v10ai')
    df = loader.load_recent_matches(days=config['data']['days'])

    # 特征工程
    print("生成训练样本...")
    X, y, weights = prepare_dataset(df)

    # 划分训练/验证集
    X_train, X_val, y_train, y_val, w_train, w_val = train_test_split(
        X, y, weights,
        test_size=1-config['data']['train_ratio'],
        random_state=42
    )

    # 创建DMatrix
    dtrain = xgb.DMatrix(X_train, label=y_train, weight=w_train)
    dval = xgb.DMatrix(X_val, label=y_val, weight=w_val)

    # 训练参数
    params = {
        'objective': 'multi:softprob',
        'num_class': 130,
        **config['model']
    }

    # 训练
    print("开始训练...")
    evals = [(dtrain, 'train'), (dval, 'val')]
    model = xgb.train(
        params,
        dtrain,
        num_boost_round=config['model']['n_estimators'],
        evals=evals,
        early_stopping_rounds=config['training']['early_stopping_rounds'],
        verbose_eval=config['training']['verbose_eval']
    )

    # 保存模型
    model_path = config['output']['model_path']
    model.save_model(model_path)
    print(f"模型已保存到: {model_path}")

    return model

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='config.yaml')
    args = parser.parse_args()

    with open(args.config, 'r') as f:
        config = yaml.safe_load(f)

    train_model(config)
```

**验收标准**：

- [ ] 可以成功训练模型
- [ ] 训练过程有进度输出
- [ ] 模型保存为 JSON 格式
- [ ] 验证集 loss 下降
- [ ] 有训练日志记录

---

#### Issue #P1-5: 首次模型训练和评估

**优先级**：P0
**预计工时**：6 小时
**依赖**：#P1-4

**任务描述**：

- [ ] 运行首次训练（使用真实 GA4 数据）
- [ ] 实现简单的评估脚本
- [ ] 记录 Top-1/Top-3/Top-5 准确率
- [ ] 分析特征重要性
- [ ] 记录训练结果和参数

**evaluate.py**：

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

**验收标准**：

- [ ] 模型训练成功完成
- [ ] Top-1 准确率 > 2%（随机猜测为 0.77%）
- [ ] Top-3 准确率 > 5%
- [ ] 有特征重要性分析
- [ ] 有完整的实验记录

---

### Phase 1.3: 推理服务部署（第 3 周，16 小时）

#### Issue #P1-6: 创建 FastAPI 推理服务

**优先级**：P0
**预计工时**：6 小时
**依赖**：#P1-5

**任务描述**：

- [ ] 创建`ml/inference/`目录
- [ ] 实现`main.py`（FastAPI 应用）
- [ ] 实现`/recommend` endpoint
- [ ] 实现`/health` endpoint
- [ ] 复制`feature_engineering.py`
- [ ] 本地测试

**main.py**：

```python
# ml/inference/main.py
from fastapi import FastAPI
import xgboost as xgb
import numpy as np
from feature_engineering import encode_radiant, encode_dire

app = FastAPI(title="Dota2 Hero Recommendation API")

# 加载模型
model = xgb.Booster()
model.load_model("model.json")

@app.post("/recommend")
def recommend(request: dict):
    """
    推荐10个Dire英雄

    请求：{"radiant_heroes": [3, 3, 7, 12, 15]}
    响应：{"picks": [52, 89, 14, ...]}
    """
    radiant_heroes = request["radiant_heroes"]
    radiant_vec = encode_radiant(radiant_heroes)

    dire_picked = []
    recommendations = []

    for _ in range(10):
        # 构造特征
        dire_vec = encode_dire(dire_picked)
        feature = np.concatenate([radiant_vec, dire_vec])

        # 预测
        dmatrix = xgb.DMatrix([feature])
        scores = model.predict(dmatrix)[0]

        # 屏蔽已选英雄
        for hero_id in dire_picked:
            scores[hero_id - 1] = -999

        # 选择最高分
        best_hero = int(np.argmax(scores) + 1)
        recommendations.append(best_hero)
        dire_picked.append(best_hero)

    return {"picks": recommendations}

@app.get("/health")
def health():
    return {"status": "healthy", "model": "hero_recommendation_v1"}
```

**验收标准**：

- [ ] FastAPI 可以本地启动
- [ ] `/recommend`返回 10 个英雄 ID
- [ ] `/health`正常响应
- [ ] 推理延迟 < 100ms

---

#### Issue #P1-7: 创建 Dockerfile 并部署到 Cloud Run

**优先级**：P0
**预计工时**：6 小时
**依赖**：#P1-6

**任务描述**：

- [ ] 编写`Dockerfile`
- [ ] 优化镜像大小
- [ ] 本地测试容器
- [ ] 创建`deploy.sh`脚本
- [ ] 部署到 Cloud Run
- [ ] 配置环境变量
- [ ] 进行压力测试

**Dockerfile**：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py feature_engineering.py model.json ./

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**deploy.sh**：

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

**验收标准**：

- [ ] Cloud Run 服务成功部署
- [ ] 获得公网 URL
- [ ] 延迟 < 200ms（P95）
- [ ] 可以处理 10 并发请求

---

#### Issue #P1-8: 游戏 Bot 集成推荐 API

**优先级**：P0
**预计工时**：4 小时
**依赖**：#P1-7

**任务描述**：

- [ ] 在 Bot 代码中添加 HTTP 请求
- [ ] BP 阶段调用推荐 API
- [ ] 添加 fallback 机制（API 失败时使用默认逻辑）
- [ ] 添加 feature flag 控制
- [ ] 添加日志记录

**验收标准**：

- [ ] Bot 可以成功调用 Cloud Run API
- [ ] API 失败时不影响游戏
- [ ] 有日志记录推荐结果
- [ ] 可以通过配置开关启用/禁用

---

### Phase 1.4: 灰度测试（持续 1 周，4 小时）

#### Issue #P1-9: 灰度测试和效果评估

**优先级**：P1
**预计工时**：4 小时
**依赖**：#P1-8

**任务描述**：

- [ ] 配置 10%流量使用 AI 推荐
- [ ] 收集至少 100 场对局数据
- [ ] 统计 AI 推荐的 Dire 胜率
- [ ] 与历史基线对比
- [ ] 分析效果并决定是否全量

**SQL 监控查询**：

```sql
-- 统计不同推荐策略的胜率对比
-- 注意：需要在game_end_match事件中添加recommendation_strategy参数
-- 可能的值: 'baseline', 'xgboost_v1', 'xgboost_v2', 'random' 等
SELECT
  recommendation_strategy,
  COUNT(*) as total_matches,
  SUM(CASE WHEN winner = 3 THEN 1 ELSE 0 END) as dire_wins,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate
FROM (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'match_id') as match_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'winner_team_id') as winner,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'recommendation_strategy') as recommendation_strategy
  FROM `windy10v10ai.analytics_<property_id>.events_*`
  WHERE event_name = 'game_end_match'
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
)
WHERE recommendation_strategy IS NOT NULL
GROUP BY recommendation_strategy
ORDER BY dire_win_rate DESC;
```

**验收标准**：

- [ ] 至少运行 100 场 AI 推荐对局
- [ ] 有胜率统计数据
- [ ] 无严重 Bug 或崩溃
- [ ] 决策：是否全量上线

---

### Phase 1 总结

**预计总工时**：52 小时 ≈ 6-7 个工作日
**预计日历时间**：2-3 周（包括数据观察和调优）

**关键里程碑**：

- ✅ M1.1: 训练环境就绪（第 1 周）
- ✅ M1.2: 首个模型训练完成（第 2 周）
- ✅ M1.3: 推理服务上线（第 3 周）
- ✅ M1.4: 灰度测试完成并决策（第 3-4 周）

---

## Phase 2: 持续优化（Phase 1 完成后，长期运行）

**目标**：模型优化和自动化重训练机制

⚠️ **注意**：数据基础设施已在 Phase 1.0 中完成（Issue #P1-0），Phase 2 专注于模型和流程优化。

### Phase 2.1: 模型优化（持续，10 小时）

#### Issue #P2-1: 模型调参优化

**优先级**：P2
**预计工时**：10 小时
**依赖**：#P1-5

**任务描述**：

- [ ] 尝试不同超参数组合
- [ ] 实验不同的特征工程方法
- [ ] 分析特征重要性
- [ ] 记录实验结果

**验收标准**：

- [ ] 至少尝试 5 组不同参数
- [ ] 找到比 baseline 更好的配置
- [ ] 有详细的实验记录

---

### Phase 2.2: 自动化（长期，10 小时）

#### Issue #P2-2: 设置每周自动重训练

**优先级**：P2
**预计工时**：6 小时
**依赖**：#P1-5

**任务描述**：

- [ ] 创建 Cloud Functions 触发训练
- [ ] 配置 Cloud Scheduler（每周日凌晨执行）
- [ ] 自动部署新模型到 Cloud Run
- [ ] 设置邮件通知

**验收标准**：

- [ ] 每周自动训练成功
- [ ] 新模型自动部署
- [ ] 有邮件/Slack 通知

---

#### Issue #P2-3: 创建监控 Dashboard

**优先级**：P2
**预计工时**：4 小时
**依赖**：#P1-0

**任务描述**：

- [ ] 创建 BigQuery 视图
- [ ] 在 Looker Studio 创建 Dashboard
- [ ] 添加胜率下降告警

**关键指标**：

- 每日对局数
- Dire 胜率趋势
- 推荐英雄分布
- API 延迟 P50/P95/P99

**验收标准**：

- [ ] Dashboard 可访问
- [ ] 数据每日更新
- [ ] 有告警机制

---

## 实施时间线

### 执行策略

```
周 | Phase 1                                  | Phase 2
---+------------------------------------------+-------------------------
准备 | #P1-0 (BigQuery建表+数据导入, 2-3h)      | -
1  | #P1-1, #P1-2, #P1-3 (环境+数据加载, 7h)  | -
2  | #P1-4, #P1-5 (训练+评估, 12h)            | -
3  | #P1-6, #P1-7, #P1-8 (推理服务, 16h)      | #P2-1 (开始调参)
4  | #P1-9 (灰度测试, 4h)                     | #P2-2, #P2-3 (自动化+监控)
5+ | 全量上线                                  | 持续优化
```

### 关键里程碑

- **准备阶段**: 建表并导入历史数据（2-3 小时）← 关键！
- **Week 1**: Python 环境就绪，可以加载数据
- **Week 2**: 首个模型训练完成
- **Week 3**: 推理服务上线
- **Week 4**: 灰度测试并决策
- **Week 5+**: 全量上线 + 持续监控优化

---

## 总预计工时

- **Phase 1（核心）**: 41-42 小时
  - P1-0: 2-3 小时（建表+导入数据）
  - P1-1 to P1-9: 39 小时
- **Phase 2（优化）**: 20 小时
  - P2-1: 10 小时（调参）
  - P2-2: 6 小时（自动化）
  - P2-3: 4 小时（监控）
- **总计**: 61-62 小时

**实际日历时间**：约**3 周**完成 Phase 1 核心功能，Phase 2 可以持续迭代。

---

## 风险与缓解

| 风险               | 影响             | 缓解措施                                     |
| ------------------ | ---------------- | -------------------------------------------- |
| 历史数据量不足     | 模型效果差       | 确认至少有 50k 对局后再开始训练              |
| 数据导入失败       | 阻塞所有后续工作 | 先 dry-run 验证，分批导入                    |
| 首次训练效果差     | 方案可行性受质疑 | 设定合理预期（Top-1 > 2%即可），强调迭代优化 |
| Cloud Run 冷启动慢 | 用户体验差       | 配置 min_instances=1                         |
| 模型过拟合         | 泛化能力差       | 交叉验证、正则化                             |

---

## 下一步

### 立即执行（Issue #P1-0）

1. **确认 GA4 Property ID**

   ```bash
   # 在BigQuery控制台查找analytics_开头的数据集
   # 格式：analytics_<property_id>
   ```

2. **创建 BigQuery 专有表**

   - 复制 `BIGQUERY_SETUP.md` 中的建表 SQL
   - 在 BigQuery 控制台执行

3. **导入历史数据**

   - 选择方式 A（SQL 直接导入）或方式 B（Python 脚本）
   - 先 dry-run 验证数据量
   - 确认 ≥ 50,000 场对局

4. **配置持续写入**
   - 实现`BigQueryService`
   - 集成到`analytics.service.ts`
   - 设置`ENABLE_BIGQUERY_EXPORT=true`并部署

**预计时间**：2-3 小时（完成后可以开始训练！）

### 后续步骤

- Issue #P1-1: 创建 Python 训练项目结构
- Issue #P1-2: 实现数据加载器
- ...

---

**版本**: v2.0
**更新日期**: 2026-01-14
**状态**: 已确认游戏规则，可以开始实施
