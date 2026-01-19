# Dota2 自定义游戏 - AI英雄推荐系统

## 文档状态

✅ **已确认**：游戏规则已确认，分Phase 1（快速实验）和Phase 2（持续优化）实施。

## 项目概述

为Dota2自定义游戏的Bot方（Dire）提供基于机器学习的英雄选择推荐。

### 游戏规则（已确认）

- **Radiant（人类方）**：1-10个玩家（人数可变），可以重复选择英雄
- **Dire（Bot方）**：固定10个英雄，不可重复
- **选择顺序**：Radiant先选完，Dire再选
- **当前Dire胜率**：约20%
- **目标**：根据Radiant阵容，为Dire推荐最优英雄选择，提升胜率至25%+

### 实施策略

**Phase 1: 快速实验验证（约3周）**
1. 建立专有BigQuery表
2. 从GA4导入历史数据（一次性）
3. 快速训练并部署初版模型
4. 灰度测试并验证效果

**Phase 2: 持续优化（长期运行）**
1. 模型调参优化
2. 建立每周自动重训练
3. 持续监控胜率和模型效果

**关键优势**：统一数据源，历史数据和新数据都在同一张表中。

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────┐
│  Dota2 Game Bot (Lua/TypeScript)                 │
│  └── BP阶段调用推荐API                           │
└─────────────────────────────────────────────────┘
                    ↓ HTTP
┌─────────────────────────────────────────────────┐
│  NestJS API (Firebase Cloud Functions)           │
│  ├── /api/analytics/game-end                     │
│  │   └── 接收对局数据                            │
│  ├── /api/hero-recommendation (新增)             │
│  │   └── 直接请求Python服务                      │
│  └── BigQueryService (新增)                      │
│      └── 直接写入对局数据到BigQuery              │
└─────────────────────────────────────────────────┘
                    ↓
         ┌──────────┴──────────┐
         ↓                     ↓
┌────────────────┐    ┌────────────────────────────┐
│  BigQuery      │    │  Cloud Run (Python FastAPI)│
│  dota2.matches │    │  ├── POST /recommend        │
│                │    │  ├── GET /health            │
│                │    │  └── XGBoost模型            │
└────────────────┘    └────────────────────────────┘
         ↓
┌────────────────────────────────────────────────┐
│  训练流程（离线）                                │
│  BigQuery → Python脚本 → XGBoost → 模型文件    │
└────────────────────────────────────────────────┘
```

### 与现有系统的整合

#### 现有组件
1. ✅ **NestJS后端**：`api/src/analytics/analytics.service.ts`
2. ✅ **GameEndDto**：已有对局数据结构
3. ✅ **英雄映射**：`api/src/analytics/data/hero-data.ts`（130个英雄）
4. ✅ **BigQuery扩展**：已配置用于players和members

#### 新增组件
1. 🆕 **BigQuery写入服务**：`api/src/bigquery/bigquery.service.ts`
2. 🆕 **对局数据表**：`dota2.matches`
3. 🆕 **Python训练脚本**：`ml/training/`
4. 🆕 **Python推理服务**：`ml/inference/`
5. 🆕 **推荐API Controller**：`api/src/hero-recommendation/`

---

## 数据流设计

### 1. 数据收集（游戏结束）

```typescript
// 现有流程：api/src/analytics/analytics.controller.ts
POST /api/analytics/game-end
{
  "matchId": "12345",
  "winnerTeamId": 2,  // 2=Radiant, 3=Dire
  "gameTimeMsec": 1800000,
  "players": [
    {
      "steamId": 76561198012345678,
      "teamId": 2,
      "heroName": "npc_dota_hero_axe",
      "level": 25,
      "kills": 10,
      "deaths": 5,
      "assists": 15
    },
    // ... 更多玩家
  ]
}
```

**新增处理**：
```typescript
// api/src/analytics/analytics.service.ts
async gameEndMatch(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
  // 现有：发送到GA4
  await this.sendToGA4(gameEnd);

  // 新增：写入BigQuery
  await this.bigQueryService.saveMatch(gameEnd);
}
```

### 2. 专有BigQuery数据表

**设计思路**：统一数据源，历史数据和新数据都存储在同一张专有表中。

#### 表结构

```sql
CREATE TABLE `windy10v10ai.dota2.matches` (
  -- 核心字段
  match_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  winner INT64 NOT NULL,              -- 2=Radiant, 3=Dire

  -- 英雄阵容（ML核心特征）
  radiant_heroes ARRAY<INT64> NOT NULL,  -- 1-10个，可重复
  dire_heroes ARRAY<INT64> NOT NULL,     -- 固定10个，不重复

  -- 对局元数据
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
  description = "Dota2 10v10 match records for AI hero recommendation"
);
```

**优化特性**：
- ✅ **分区**：按日期分区，查询最近N天数据时只扫描相关分区
- ✅ **聚簇**：按winner和difficulty聚簇，加速胜率分析
- ✅ **数组类型**：直接存储英雄ID数组，无需JOIN

#### 数据导入（一次性）

从GA4历史数据导入到专有表：

```sql
-- 详见 BIGQUERY_SETUP.md 中的完整导入SQL
INSERT INTO `windy10v10ai.dota2.matches`
SELECT ... FROM `analytics_<property_id>.events_*`
WHERE event_name = 'game_end_match' ...
```

**导入方式**：
- 方式A：直接执行SQL（BigQuery控制台）
- 方式B：Python脚本（更灵活，支持dry-run）

**详细步骤**：见 [BIGQUERY_SETUP.md](./BIGQUERY_SETUP.md)

#### 持续数据写入

新对局自动写入专有表：

```typescript
// api/src/bigquery/bigquery.service.ts
@Injectable()
export class BigQueryService {
  private bigquery = new BigQuery();
  private table = this.bigquery.dataset('dota2').table('matches');

  async saveMatch(gameEnd: GameEndMatchDto): Promise<void> {
    const row = {
      match_id: gameEnd.matchId,
      timestamp: new Date().toISOString(),
      winner: gameEnd.winnerTeamId,
      radiant_heroes: gameEnd.players
        .filter(p => p.teamId === 2)
        .map(p => GetHeroId(p.heroName)),
      dire_heroes: gameEnd.players
        .filter(p => p.teamId === 3)
        .map(p => GetHeroId(p.heroName)),
      duration_msec: gameEnd.gameTimeMsec,
      game_version: gameEnd.version,
      difficulty: gameEnd.difficulty,
      server_type: 'production',
      radiant_player_count: radiantHeroes.length,
      dire_player_count: direHeroes.length
    };

    await this.table.insert([row]);
  }
}

// api/src/analytics/analytics.service.ts
async gameEndMatch(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
  // 现有：发送到GA4
  await this.sendToGA4(gameEnd);

  // 新增：写入专有表
  if (process.env.ENABLE_BIGQUERY_EXPORT === 'true') {
    await this.bigQueryService.saveMatch(gameEnd);
  }
}
```

### 3. 训练数据加载

Python数据加载器（统一接口，适用于所有训练）：

```python
# ml/training/data_loader.py
from google.cloud import bigquery
import pandas as pd

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
        print(f"加载 {len(df):,} 场对局")
        print(f"Dire胜率: {(df['winner'] == 3).mean():.2%}")

        return df
```

### 4. 推理API

```python
# ml/inference/main.py
from fastapi import FastAPI
import xgboost as xgb

app = FastAPI()
model = xgb.Booster()
model.load_model("model.json")

@app.post("/recommend")
def recommend(request: dict):
    """
    请求格式：
    {
      "radiant_heroes": [3, 3, 7, 7, 7, 12, 15, 15, 20, 20]
    }

    响应格式：
    {
      "picks": [52, 89, 14, 67, 33, 71, 28, 45, 91, 8]
    }
    """
    radiant_vec = encode_radiant(request["radiant_heroes"])

    dire_picked = []
    recommendations = []

    for _ in range(10):
        dire_vec = encode_dire(dire_picked)
        feature = np.concatenate([radiant_vec, dire_vec])

        # 预测所有英雄的得分
        scores = model.predict(xgb.DMatrix([feature]))[0]

        # 屏蔽已选英雄
        for hero_id in dire_picked:
            scores[hero_id - 1] = -999  # 英雄ID从1开始

        # 选择最高分英雄
        best_hero = np.argmax(scores) + 1
        recommendations.append(int(best_hero))
        dire_picked.append(best_hero)

    return {"picks": recommendations}
```

---

## 特征工程

### 输入特征（260维）

| 特征组 | 维度 | 编码方式 | 说明 |
|--------|------|----------|------|
| Radiant阵容 | 130 | 计数向量 | 每个英雄出现次数（0-10） |
| Dire已选 | 130 | Multi-hot | 0或1，表示是否已选 |

#### Radiant计数向量示例

```python
def encode_radiant(hero_ids: list) -> np.ndarray:
    """
    输入：[3, 3, 7, 7, 7, 12, 15, 15, 20, 20]
    输出：[0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 2, ...]
           索引3有2个，索引7有3个，索引12有1个...
    """
    vector = np.zeros(130, dtype=int)
    for hero_id in hero_ids:
        vector[hero_id - 1] += 1  # 英雄ID从1开始
    return vector
```

#### Dire Multi-hot向量示例

```python
def encode_dire(hero_ids: list) -> np.ndarray:
    """
    输入：[3, 7, 12]
    输出：[0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...]
           索引3、7、12为1，其余为0
    """
    vector = np.zeros(130, dtype=int)
    for hero_id in hero_ids:
        vector[hero_id - 1] = 1
    return vector
```

### 输出标签

130维向量，每个位置对应该英雄的推荐概率/得分。

### 样本构造

每场对局生成10个训练样本（无论输赢）：

```python
def generate_samples(match_row):
    samples = []
    radiant_vec = encode_radiant(match_row['radiant_heroes'])
    dire_heroes = match_row['dire_heroes']
    is_dire_win = (match_row['winner'] == 3)

    for i in range(10):
        # 输入：radiant + dire前i个英雄
        dire_picked = dire_heroes[:i]
        dire_vec = encode_dire(dire_picked)
        X = np.concatenate([radiant_vec, dire_vec])

        # 标签：第i+1个英雄（one-hot） + 胜负权重
        y_hero = dire_heroes[i]
        y = np.zeros(130)
        y[y_hero - 1] = 1

        # 如果Dire赢了，给这个样本更高权重
        weight = 1.0 if is_dire_win else 0.25

        samples.append((X, y, weight))

    return samples
```

---

## 模型训练

### 模型选择：XGBoost

**原因**：
- ✅ 训练速度快（CPU几分钟）
- ✅ 对表格数据效果好
- ✅ 内置特征重要性分析
- ✅ 模型文件小（几MB）
- ✅ 调参相对简单

**训练代码**：

```python
# ml/training/train.py
import xgboost as xgb
from sklearn.model_selection import train_test_split

def train_model(X, y, sample_weights):
    X_train, X_val, y_train, y_val, w_train, w_val = train_test_split(
        X, y, sample_weights, test_size=0.2, random_state=42
    )

    dtrain = xgb.DMatrix(X_train, label=y_train, weight=w_train)
    dval = xgb.DMatrix(X_val, label=y_val, weight=w_val)

    params = {
        'objective': 'multi:softprob',  # 多分类概率
        'num_class': 130,
        'max_depth': 8,
        'eta': 0.1,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'eval_metric': 'mlogloss',
        'scale_pos_weight': 4,  # 处理20%胜率不平衡
    }

    model = xgb.train(
        params,
        dtrain,
        num_boost_round=200,
        evals=[(dtrain, 'train'), (dval, 'val')],
        early_stopping_rounds=20,
        verbose_eval=10
    )

    return model
```

### 模型漂移处理

游戏版本更新、平衡性调整会导致模型效果下降。

**策略**：
- 📅 **定期重训练**：每周一次
- 📊 **数据窗口**：最近1-2个月数据
- 🤖 **自动化**：Cloud Scheduler + Cloud Functions触发训练
- 📈 **监控指标**：推荐英雄的实际胜率

---

## API接口设计

### NestJS转发层（可选）

```typescript
// api/src/hero-recommendation/hero-recommendation.controller.ts
@Controller('api/hero-recommendation')
export class HeroRecommendationController {
  constructor(private readonly httpService: HttpService) {}

  @Post('recommend')
  async recommend(@Body() dto: RecommendRequestDto) {
    const pythonServiceUrl = process.env.HERO_RECOMMENDATION_SERVICE_URL;

    const response = await this.httpService.post(
      `${pythonServiceUrl}/recommend`,
      { radiant_heroes: dto.radiantHeroes }
    ).toPromise();

    return response.data;
  }
}
```

**或者**：游戏Bot直接调用Python服务（减少延迟）

### Python服务端点

#### 1. 英雄推荐

```
POST /recommend
Content-Type: application/json

{
  "radiant_heroes": [3, 3, 7, 7, 7, 12, 15, 15, 20, 20]
}
```

**响应**：
```json
{
  "picks": [52, 89, 14, 67, 33, 71, 28, 45, 91, 8],
  "inference_time_ms": 45
}
```

#### 2. 健康检查

```
GET /health

响应：
{
  "status": "healthy",
  "model_version": "v1.2.3",
  "model_trained_at": "2026-01-10T12:00:00Z"
}
```

### 延迟分析

| 方案 | 延迟 |
|------|------|
| 游戏 → NestJS → Python | 100-200ms |
| 游戏 → Python（直连） | 50-100ms |

**建议**：生产环境直连Python服务以减少延迟。

---

## 部署架构

### Python推理服务（Cloud Run）

```dockerfile
# ml/inference/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**部署命令**：
```bash
cd ml/inference

# 构建并推送到GCR
gcloud builds submit --tag gcr.io/windy10v10ai/hero-recommendation

# 部署到Cloud Run
gcloud run deploy hero-recommendation \
  --image gcr.io/windy10v10ai/hero-recommendation \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1
```

### NestJS BigQuery集成

```typescript
// api/src/bigquery/bigquery.service.ts
import { BigQuery } from '@google-cloud/bigquery';

@Injectable()
export class BigQueryService {
  private bigquery = new BigQuery();
  private dataset = this.bigquery.dataset('dota2');
  private table = this.dataset.table('matches');

  async saveMatch(gameEnd: GameEndMatchDto) {
    const radiantHeroes = gameEnd.players
      .filter(p => p.teamId === 2)
      .map(p => GetHeroId(p.heroName));

    const direHeroes = gameEnd.players
      .filter(p => p.teamId === 3)
      .map(p => GetHeroId(p.heroName));

    const row = {
      match_id: gameEnd.matchId,
      timestamp: new Date().toISOString(),
      winner: gameEnd.winnerTeamId,
      radiant_heroes: radiantHeroes,
      dire_heroes: direHeroes,
      duration_msec: gameEnd.gameTimeMsec,
      game_version: gameEnd.version,
      difficulty: gameEnd.difficulty,
      server_type: 'production',
      radiant_player_count: radiantHeroes.length,
      dire_player_count: direHeroes.length,
    };

    await this.table.insert([row]);
  }
}
```

---

## 成本估算

### 训练成本
- **本地/Colab**：$0（使用免费GPU）
- **Cloud Functions触发训练**：$0-5/月

### 推理成本（Cloud Run）
```
月请求数：100,000次
每次耗时：50ms
计算时间：100,000 × 0.05s = 5,000秒

Cloud Run免费额度：180,000 vCPU秒/月
结论：完全免费
```

### 存储成本（BigQuery）
```
月数据量：100,000场 × 500字节 ≈ 50MB
存储：50MB × $0.02/GB ≈ $0.001
查询：10GB免费额度内

结论：几乎免费
```

### 总成本：$0-5/月

---

## 实施概览

详细的分步实施计划请参考 [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md)

**快速摘要**：

1. **准备阶段**（2-3小时）：创建BigQuery表并导入历史数据
2. **Week 1**（7小时）：搭建Python训练环境
3. **Week 2**（12小时）：模型训练与评估
4. **Week 3**（16小时）：推理服务部署
5. **Week 4**（4小时）：灰度测试与上线
6. **持续迭代**：模型优化和自动重训练

**总工时**：约41-42小时（Phase 1核心功能）

---

## 技术栈总结

| 组件 | 技术 | 位置 |
|------|------|------|
| 游戏Bot | Lua/TypeScript | 游戏客户端 |
| 业务后端 | NestJS | `api/` |
| 数据存储 | BigQuery | Cloud |
| 模型训练 | Python + XGBoost | `ml/training/` |
| 推理服务 | Python + FastAPI | `ml/inference/` |
| 部署平台 | Cloud Run | GCP |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 数据量不足 | 模型效果差 | 先收集1个月数据再训练 |
| 推理延迟过高 | 影响游戏体验 | 优化模型大小、使用缓存 |
| 模型过拟合 | 泛化能力差 | 交叉验证、正则化 |
| 游戏版本变化 | 模型失效 | 每周重训练、版本号追踪 |
| Cloud Run冷启动 | 首次请求慢 | 配置最小实例数=1 |

---

## 后续优化方向

### 短期（3个月内）
- 📊 添加更多特征：游戏时长、玩家水平
- 🎯 优化推荐多样性（避免总是推荐相同英雄）
- 📈 A/B测试不同模型架构

### 长期（6个月以上）
- 🧠 Hero Embedding：学习英雄隐向量
- 🔄 序列建模：考虑选人顺序
- 🤝 多任务学习：同时预测胜率和推荐
- 🎮 强化学习：通过自我对弈优化

---

## 参考资料

- [XGBoost文档](https://xgboost.readthedocs.io/)
- [BigQuery Python客户端](https://cloud.google.com/python/docs/reference/bigquery/latest)
- [Cloud Run文档](https://cloud.google.com/run/docs)
- [FastAPI文档](https://fastapi.tiangolo.com/)

---

## 变更日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-01-14 | v1.0 | 游戏规则已确认，统一为专有表数据方案 |
