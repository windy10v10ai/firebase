# AI英雄推荐系统 - 分阶段实施计划 v2

## 概览

本文档将实施工作分为两个阶段：
- **Phase 1**: 快速实验验证（使用现有GA4数据）
- **Phase 2**: 持续优化（建立专用数据流水线）

Phase 2的数据采集可以与Phase 1并行启动。

---

## Phase 1: 快速实验验证（2-3周）

**目标**：利用现有GA4数据快速训练模型并验证方案可行性

### Phase 1.1: 环境准备（第1周，10小时）

#### Issue #P1-1: 创建Python训练项目结构
**优先级**：P0
**预计工时**：3小时

**任务描述**：
- [ ] 创建`ml/training/`目录结构
- [ ] 创建`requirements.txt`
- [ ] 创建`README.md`（环境设置指南）
- [ ] 添加`.gitignore`

**目录结构**：
```
ml/
├── training/
│   ├── README.md
│   ├── requirements.txt
│   ├── load_ga4_data.sql          # GA4数据提取SQL
│   ├── data_loader_ga4.py         # Phase 1: GA4数据加载器
│   ├── data_loader.py             # Phase 2: 专用表数据加载器
│   ├── feature_engineering.py     # 特征工程
│   ├── train.py                   # 训练脚本
│   ├── evaluate.py                # 评估脚本
│   └── config.yaml                # 训练配置
└── inference/
    ├── main.py
    ├── feature_engineering.py
    ├── requirements.txt
    ├── Dockerfile
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
- [ ] requirements.txt可以成功安装
- [ ] README包含环境设置说明

---

#### Issue #P1-2: 实现GA4数据加载器
**优先级**：P0
**预计工时**：6小时
**依赖**：#P1-1

**任务描述**：
- [ ] 编写`load_ga4_data.sql`提取GA4事件数据
- [ ] 实现`data_loader_ga4.py`
- [ ] 支持按时间范围查询
- [ ] 添加数据验证和统计
- [ ] 本地测试（需要GCP认证）

**关键代码**：

```python
# ml/training/data_loader_ga4.py
from google.cloud import bigquery
import pandas as pd
import json

class GA4MatchDataLoader:
    def __init__(self, project_id='windy10v10ai', property_id='<your_property_id>'):
        self.client = bigquery.Client(project=project_id)
        self.property_id = property_id

    def load_recent_matches(self, days=90):
        """从GA4事件表加载对局数据"""
        # 读取SQL文件
        with open('load_ga4_data.sql', 'r') as f:
            query_template = f.read()

        # 替换参数
        query = query_template.replace('<property_id>', self.property_id)
        query = query.replace('<days>', str(days))

        # 执行查询
        df = self.client.query(query).to_dataframe()

        # 数据验证
        print(f"原始数据: {len(df)} 场对局")

        # 过滤异常数据
        df = df[
            (df['match_id'].notna()) &
            (df['winner'].isin([2, 3])) &
            (df['radiant_heroes'].apply(lambda x: len(x) >= 1 and len(x) <= 10)) &
            (df['dire_heroes'].apply(lambda x: len(x) == 10))
        ]

        print(f"过滤后: {len(df)} 场对局")
        print(f"Dire胜率: {(df['winner'] == 3).mean():.2%}")
        print(f"Radiant平均人数: {df['radiant_heroes'].apply(len).mean():.1f}")

        return df

    def get_hero_distribution(self, df):
        """统计英雄选择分布"""
        from collections import Counter

        radiant_counter = Counter()
        dire_counter = Counter()

        for heroes in df['radiant_heroes']:
            radiant_counter.update(heroes)

        for heroes in df['dire_heroes']:
            dire_counter.update(heroes)

        return radiant_counter, dire_counter
```

**验收标准**：
- [ ] 可以成功从BigQuery加载GA4数据
- [ ] DataFrame包含必需字段（match_id, winner, radiant_heroes, dire_heroes）
- [ ] 数据量 > 1000场对局
- [ ] 有数据质量统计输出

---

#### Issue #P1-3: 实现特征工程模块
**优先级**：P0
**预计工时**：4小时
**依赖**：#P1-2

**任务描述**：
- [ ] 实现`encode_radiant()`函数（计数向量）
- [ ] 实现`encode_dire()`函数（Multi-hot）
- [ ] 实现样本生成逻辑（每场对局10个样本）
- [ ] 添加单元测试
- [ ] 验证特征维度（260维）

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
- [ ] 单元测试通过率100%
- [ ] 可以从测试数据生成正确的样本
- [ ] 特征向量维度=260
- [ ] 标签范围在[0, 129]

---

### Phase 1.2: 模型训练（第2周，12小时）

#### Issue #P1-4: 实现XGBoost训练脚本
**优先级**：P0
**预计工时**：6小时
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
  source: ga4  # ga4 或 dedicated_table
  property_id: "<your_property_id>"
  days: 90
  train_ratio: 0.8

model:
  max_depth: 8
  learning_rate: 0.1
  n_estimators: 200
  subsample: 0.8
  colsample_bytree: 0.8
  scale_pos_weight: 4  # 处理20%胜率不平衡

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

from data_loader_ga4 import GA4MatchDataLoader
from feature_engineering import prepare_dataset

def train_model(config):
    # 加载数据
    print("加载数据...")
    loader = GA4MatchDataLoader(
        project_id='windy10v10ai',
        property_id=config['data']['property_id']
    )
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
- [ ] 模型保存为JSON格式
- [ ] 验证集loss下降
- [ ] 有训练日志记录

---

#### Issue #P1-5: 首次模型训练和评估
**优先级**：P0
**预计工时**：6小时
**依赖**：#P1-4

**任务描述**：
- [ ] 运行首次训练（使用真实GA4数据）
- [ ] 实现简单的评估脚本
- [ ] 记录Top-1/Top-3/Top-5准确率
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
- [ ] Top-1准确率 > 2%（随机猜测为0.77%）
- [ ] Top-3准确率 > 5%
- [ ] 有特征重要性分析
- [ ] 有完整的实验记录

---

### Phase 1.3: 推理服务部署（第3周，16小时）

#### Issue #P1-6: 创建FastAPI推理服务
**优先级**：P0
**预计工时**：6小时
**依赖**：#P1-5

**任务描述**：
- [ ] 创建`ml/inference/`目录
- [ ] 实现`main.py`（FastAPI应用）
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
- [ ] FastAPI可以本地启动
- [ ] `/recommend`返回10个英雄ID
- [ ] `/health`正常响应
- [ ] 推理延迟 < 100ms

---

#### Issue #P1-7: 创建Dockerfile并部署到Cloud Run
**优先级**：P0
**预计工时**：6小时
**依赖**：#P1-6

**任务描述**：
- [ ] 编写`Dockerfile`
- [ ] 优化镜像大小
- [ ] 本地测试容器
- [ ] 创建`deploy.sh`脚本
- [ ] 部署到Cloud Run
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
- [ ] Cloud Run服务成功部署
- [ ] 获得公网URL
- [ ] 延迟 < 200ms（P95）
- [ ] 可以处理10并发请求

---

#### Issue #P1-8: 游戏Bot集成推荐API
**优先级**：P0
**预计工时**：4小时
**依赖**：#P1-7

**任务描述**：
- [ ] 在Bot代码中添加HTTP请求
- [ ] BP阶段调用推荐API
- [ ] 添加fallback机制（API失败时使用默认逻辑）
- [ ] 添加feature flag控制
- [ ] 添加日志记录

**验收标准**：
- [ ] Bot可以成功调用Cloud Run API
- [ ] API失败时不影响游戏
- [ ] 有日志记录推荐结果
- [ ] 可以通过配置开关启用/禁用

---

### Phase 1.4: 灰度测试（持续1周，4小时）

#### Issue #P1-9: 灰度测试和效果评估
**优先级**：P1
**预计工时**：4小时
**依赖**：#P1-8

**任务描述**：
- [ ] 配置10%流量使用AI推荐
- [ ] 收集至少100场对局数据
- [ ] 统计AI推荐的Dire胜率
- [ ] 与历史基线对比
- [ ] 分析效果并决定是否全量

**SQL监控查询**：
```sql
-- 统计AI推荐的胜率
SELECT
  COUNT(*) as total_matches,
  SUM(CASE WHEN winner = 3 THEN 1 ELSE 0 END) as dire_wins,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate
FROM (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'match_id') as match_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'winner_team_id') as winner,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'server_type') as server_type
  FROM `windy10v10ai.analytics_<property_id>.events_*`
  WHERE event_name = 'game_end_match'
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
)
WHERE server_type = 'ai_recommendation';
```

**验收标准**：
- [ ] 至少运行100场AI推荐对局
- [ ] 有胜率统计数据
- [ ] 无严重Bug或崩溃
- [ ] 决策：是否全量上线

---

### Phase 1总结

**预计总工时**：52小时 ≈ 6-7个工作日
**预计日历时间**：2-3周（包括数据观察和调优）

**关键里程碑**：
- ✅ M1.1: 训练环境就绪（第1周）
- ✅ M1.2: 首个模型训练完成（第2周）
- ✅ M1.3: 推理服务上线（第3周）
- ✅ M1.4: 灰度测试完成并决策（第3-4周）

---

## Phase 2: 持续优化（并行启动，长期运行）

**目标**：建立专用数据流水线和自动化重训练机制

Phase 2可以在Phase 1的Issue #P1-4之后并行启动。

### Phase 2.1: 数据基础设施（与Phase 1并行，10小时）

#### Issue #P2-1: 创建BigQuery专用表
**优先级**：P1
**预计工时**：2小时
**可并行启动**：Phase 1完成#P1-3后即可开始

**任务描述**：
- [ ] 在GCP控制台创建`dota2` dataset
- [ ] 创建`matches`表
- [ ] 配置分区策略（按日期）
- [ ] 验证表创建成功

**SQL**：
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
  description = "Dota2 10v10 match records for hero recommendation training (Phase 2)"
);
```

**验收标准**：
- [ ] 表创建成功
- [ ] 可以手动插入测试数据

---

#### Issue #P2-2: 实现BigQueryService
**优先级**：P1
**预计工时**：4小时
**依赖**：#P2-1

**任务描述**：
- [ ] 安装`@google-cloud/bigquery`依赖
- [ ] 创建`api/src/bigquery/bigquery.module.ts`
- [ ] 实现`api/src/bigquery/bigquery.service.ts`
- [ ] 实现`saveMatch()`方法
- [ ] 添加单元测试
- [ ] 添加错误处理

**验收标准**：
- [ ] 单元测试通过
- [ ] 可以成功写入数据
- [ ] 有适当的错误日志

---

#### Issue #P2-3: 在Analytics服务中集成BigQuery写入
**优先级**：P1
**预计工时**：2小时
**依赖**：#P2-2

**任务描述**：
- [ ] 在`analytics.service.ts`中注入`BigQueryService`
- [ ] 在`gameEndMatch()`中调用写入
- [ ] 添加feature flag控制
- [ ] 更新e2e测试

**验收标准**：
- [ ] e2e测试通过
- [ ] 可以通过环境变量控制开关
- [ ] 错误不影响GA4流程

---

#### Issue #P2-4: 部署并验证数据写入
**优先级**：P1
**预计工时**：2小时
**依赖**：#P2-3

**任务描述**：
- [ ] 设置环境变量启用BigQuery写入
- [ ] 部署到Firebase Functions
- [ ] 运行测试对局
- [ ] 验证数据写入正确

**验收标准**：
- [ ] 至少有10条数据写入
- [ ] 数据格式正确
- [ ] 有查询示例文档

---

### Phase 2.2: 模型优化（持续，12小时）

#### Issue #P2-5: 实现专用表数据加载器
**优先级**：P2
**预计工时**：2小时
**依赖**：#P2-4

**任务描述**：
- [ ] 更新`data_loader.py`支持专用表
- [ ] 在`config.yaml`中添加数据源切换
- [ ] 测试从专用表加载数据

**验收标准**：
- [ ] 可以从两种数据源加载（GA4或专用表）
- [ ] 配置文件可以切换数据源

---

#### Issue #P2-6: 模型调参优化
**优先级**：P2
**预计工时**：10小时
**依赖**：#P1-5

**任务描述**：
- [ ] 尝试不同超参数组合
- [ ] 实验不同的特征工程方法
- [ ] 分析特征重要性
- [ ] 记录实验结果

**验收标准**：
- [ ] 至少尝试5组不同参数
- [ ] 找到比baseline更好的配置
- [ ] 有详细的实验记录

---

### Phase 2.3: 自动化（长期，10小时）

#### Issue #P2-7: 设置每周自动重训练
**优先级**：P2
**预计工时**：6小时
**依赖**：#P2-5

**任务描述**：
- [ ] 创建Cloud Functions触发训练
- [ ] 配置Cloud Scheduler（每周日凌晨执行）
- [ ] 自动部署新模型到Cloud Run
- [ ] 设置邮件通知

**验收标准**：
- [ ] 每周自动训练成功
- [ ] 新模型自动部署
- [ ] 有邮件/Slack通知

---

#### Issue #P2-8: 创建监控Dashboard
**优先级**：P2
**预计工时**：4小时
**依赖**：#P2-4

**任务描述**：
- [ ] 创建BigQuery视图
- [ ] 在Looker Studio创建Dashboard
- [ ] 添加胜率下降告警

**关键指标**：
- 每日对局数
- Dire胜率趋势
- 推荐英雄分布
- API延迟P50/P95/P99

**验收标准**：
- [ ] Dashboard可访问
- [ ] 数据每日更新
- [ ] 有告警机制

---

## 实施时间线

### 并行执行策略

```
周 | Phase 1                        | Phase 2
---+--------------------------------+-------------------------
1  | #P1-1, #P1-2, #P1-3           | -
2  | #P1-4, #P1-5                  | #P2-1, #P2-2, #P2-3, #P2-4 (并行启动)
3  | #P1-6, #P1-7, #P1-8           | #P2-5, #P2-6 (开始调参)
4  | #P1-9 (灰度测试)              | #P2-7 (自动化训练)
5+ | -                             | #P2-8 (监控)，持续优化
```

### 关键里程碑

- **Week 1**: Phase 1环境就绪
- **Week 2**: 首个模型训练完成 + Phase 2数据采集上线
- **Week 3**: 推理服务上线
- **Week 4**: 灰度测试 + 自动化重训练
- **Week 5+**: 全量上线 + 持续监控优化

---

## 总预计工时

- **Phase 1**: 52小时
- **Phase 2**: 32小时
- **总计**: 84小时

由于Phase 2大部分任务可以并行执行，实际日历时间约**3-4周**即可完成Phase 1和Phase 2的核心功能。

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| GA4数据质量问题 | Phase 1延迟 | 提前验证数据，编写清洗脚本 |
| 首次训练效果差 | 方案可行性受质疑 | 设定合理预期（Top-1 > 2%即可），强调迭代优化 |
| Cloud Run冷启动慢 | 用户体验差 | 配置min_instances=1 |
| 模型过拟合 | 泛化能力差 | 交叉验证、正则化 |

---

## 下一步

1. **立即开始**：创建Issue #P1-1（Python项目结构）
2. **确认GA4 Property ID**：需要知道具体的property_id以提取数据
3. **准备GCP权限**：确保有BigQuery和Cloud Run的访问权限
4. **沟通游戏Bot集成**：了解Bot侧的技术栈和HTTP调用方式

---

**版本**: v2.0
**更新日期**: 2026-01-14
**状态**: 已确认游戏规则，可以开始实施
