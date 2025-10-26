# 物品出装统计API

## 概述

新增的物品出装统计API用于收集和分析玩家在游戏结束时的物品装备情况。

## API端点

```
POST /analytics/game-end/item-builds
```

## 请求格式

### Headers

- `x-api-key`: 服务器API密钥

### Body (ItemListDto)

```json
{
  "matchId": "12345",
  "version": "v4.00",
  "difficulty": 1,
  "isWin": true,
  "items": [
    {
      "steamId": 123456789,
      "slot1": "item_power_treads",
      "slot2": "item_black_king_bar",
      "slot3": "item_daedalus",
      "slot4": "item_assault",
      "slot5": "item_heart",
      "slot6": "item_butterfly",
      "neutralActiveSlot": "item_neutral_active_example",
      "neutralPassiveSlot": "item_neutral_passive_example"
    },
    {
      "steamId": 123456789,
      "slot1": "item_boots",
      "slot2": "item_magic_wand",
      "slot3": "item_blink",
      "slot4": "item_force_staff",
      "slot5": "item_pipe",
      "neutralActiveSlot": "item_neutral_active_2"
    }
  ]
}
```

## 字段说明

### ItemListDto

- `matchId`: 比赛ID (必填)
- `version`: 游戏版本 (必填，默认: "v4.00")
- `difficulty`: 难度等级 (必填，默认: 0)
- `isWin`: 是否获胜 (可选)
- `items`: 玩家物品数据数组 (必填)

### ItemBuildDto

- `steamId`: 玩家Steam ID (必填)
- `slot1`: 物品槽位1的物品名称 (可选)
- `slot2`: 物品槽位2的物品名称 (可选)
- `slot3`: 物品槽位3的物品名称 (可选)
- `slot4`: 物品槽位4的物品名称 (可选)
- `slot5`: 物品槽位5的物品名称 (可选)
- `slot6`: 物品槽位6的物品名称 (可选)
- `neutralActiveSlot`: 中立物品主动槽位的物品名称 (可选)
- `neutralPassiveSlot`: 中立物品被动槽位的物品名称 (可选)

## 物品类型映射

发送到Google Analytics时，物品类型会根据槽位自动映射：

- `slot1-slot6` → `type: "normal"`
- `neutralActiveSlot` → `type: "NEUTRAL_ACTIVE"`
- `neutralPassiveSlot` → `type: "NEUTRAL_PASSIVE"`

## 数据处理

1. API接收包含多个物品槽位的请求
2. 系统会遍历所有非空的物品槽位
3. 每个物品会单独发送一个事件到Google Analytics
4. 事件名称: `game_end_pick_item`

## 响应

成功时返回HTTP 200状态码，无响应体。

## 示例用法

```typescript
// 发送物品统计数据
const itemData = {
  matchId: '12345',
  version: 'v4.00',
  difficulty: 1,
  isWin: true,
  items: [
    {
      steamId: 76561198000000001,
      slot1: 'item_power_treads',
      slot2: 'item_black_king_bar',
      neutralActiveSlot: 'item_neutral_active',
    },
    {
      steamId: 76561198000000002,
      slot1: 'item_boots',
      slot3: 'item_blink',
    },
  ],
};

fetch('/analytics/game-end/item-builds', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key',
  },
  body: JSON.stringify(itemData),
});
```
