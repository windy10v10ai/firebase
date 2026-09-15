---
name: account-migration
description: 把玩家数据从一个 Steam ID 整体迁到另一个 Steam ID——积分、会员、属性加点、英雄觉醒、活动领取记录，旧号清空。用于「换号了把数据搬过去」「旧号不要了」这类请求。需要用户提供旧、新两个 Steam ID。
---

# 玩家账号迁移

把一个 Steam ID 名下的数据整体搬到另一个 Steam ID，旧号清空。**只动 Firestore 生产库，不改代码、不发版、不经过 API。**

开工前必须从用户那里拿到两个数字：**旧 ID**（数据在哪）和**新 ID**（搬到哪）。不要从对话上下文、日志、截图里推断——搬错号要靠备份才能回滚。

本机 `gcloud` 已认证，默认项目 `windy10v10ai`，直接用 Firestore REST API 读写。

## Firestore 没有「改文档 ID」这个操作

REST API 里没有 rename、没有 move。玩家数据的文档 ID 就是 Steam ID 字符串，所以「把旧号的 ID 改成新号」只能拆成两步：**在新 ID 下写一份完全相同的 → 删掉旧 ID 那份**。

用户很可能会问「直接改 ID 不就行了」——答案是那正是在做的事，只是 Firestore 层面必须拆成两个动作，中间隔着一次用户确认。

## 搬哪些集合

文档 ID 一律是 Steam ID 字符串。集合名是 entity 类名的复数形式（fireorm `@Collection()` 不传参时的默认行为，见 `api/src/**/entities/*.entity.ts`）。

**要搬的 8 个**：

| 集合 | 装什么 | 不搬的后果 |
|---|---|---|
| `Players` | 勇士积分、会员积分、已用积分、`usedLevel`、对局数、行为分 | 核心数据丢失 |
| `Members` | 会员等级、到期日、签到日期 | 会员权益丢失 |
| `PlayerProperties` | 属性加点明细 | 积分已扣但属性没了 |
| `PlayerHeroAwakenings` | 已解锁的英雄觉醒 | 积分已扣但觉醒没了 |
| `EventRewards` | 各活动已领标记 | **新号会把进行中的活动再领一次**，见下 |
| `PlayerSettings` | 快捷键、快捷施法、游戏预设 | 新号要重配键位 |
| `PlayerStatsLifetimes` | 生涯 KDA、补刀、伤害 | 生涯统计归零 |
| `PlayerDailyTasks` | 每日任务进度 | 当天进度重来 |

**不搬的**：

| 集合 | 为什么不搬 |
|---|---|
| `LocalRateLimits` | 按自然日滚动重置的限额与 IP 防盗用记录。新号从零限额开始才是正常状态，搬过去等于把旧号今天用掉的额度也带走。旧号那份留着，不用删 |
| 订单类（Afdian / Kofi / Alipay 的订单与用户） | 充值流水，属于付款账号而不属于游戏账号。订单激活时给的会员天数已经落在 `Members` 上，搬走会员即可，流水留在原处 |
| `PlayerConducts` | 文档 ID 是 `{fromSteamId}_{toSteamId}` 组合，要搬得扫全集合改两头。点赞举报记录价值低，不值得 |
| `PlayerRankings` | 每天按日期重算的排行榜快照，旧号自然淘汰 |

## 三条硬约束

**一、积分和消耗是绑死的，要搬就整套搬。**`Players.usedSeasonPoint` 对应 `PlayerHeroAwakenings` 里每个觉醒的花费，`Players.usedLevel` 对应 `PlayerProperties` 里各项等级之和。只搬 `Players` 不搬后两个，新号就是「花掉几万积分但什么都没拿到」；要避免就得重算字段，比整套搬更麻烦也更容易错。**不要提议「只搬积分」这种简化方案。**

**二、`EventRewards` 必须搬。**活动奖励的发放逻辑是「查不到已领标记就发」（`api/src/event-rewards/event-rewards.service.ts`）。新号没有这份记录，登录后会把**当前还在窗口期的活动**重新领一次——补偿类活动动辄几千积分。搬之前先看一眼 `setReward` 里 `FIXME 活动每次需要更新` 下面写的是哪个活动，据此告诉用户会重复领到什么。

**三、新号已经有数据时，只有 `Players` 和 `Members` 要停下来。**这两个集合装的是积分和会员权益，两边都有就必须合并，**怎么合并要问用户，不要自己定规则**——是相加、取大、还是以某一边为准，取决于这两个号各自是怎么来的。其余 6 个集合直接用旧号整份覆盖即可，里面是设置、统计、任务进度和活动标记，覆盖掉不造成权益损失。

## 步骤

1. **读两边**：跑 `dump`，打印旧号有哪些数据、新号是否干净。新号的 `Players` 或 `Members` 已有数据就停下问用户怎么合并，其余集合照搬
2. **给用户看前后对比，等许可**。列出每个集合搬什么、旧号会被删掉什么，包括具体数值（积分、属性等级和、觉醒英雄数、会员到期日）。**这一步不能省**，删除不可逆
3. **写新号**：跑 `copy`，它写完会逐字段核对并打印结果，出现「不一致」就停下排查，不要往下走
4. **删旧号**：拿到许可后跑 `delete`
5. **复验**：跑 `verify`，确认旧号全删、新号全在

## 脚本

存到 scratchpad 跑，四个阶段分开，中间留出确认的位置：

```bash
#!/bin/bash
# 用法: bash migrate-account.sh <dump|copy|delete|verify> <旧ID> <新ID>
set -euo pipefail
ACTION=$1; SRC=$2; DST=$3
PROJECT=windy10v10ai
DIR="$(cd "$(dirname "$0")" && pwd)/migrate-$SRC-to-$DST"
mkdir -p "$DIR"
TOKEN=$(gcloud auth print-access-token)
BASE="https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents"
COLLECTIONS="Players Members PlayerProperties PlayerHeroAwakenings EventRewards PlayerSettings PlayerStatsLifetimes PlayerDailyTasks"

has() { # 集合 ID -> 打印 HTTP 状态码
  curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE/$1/$2"
}

case "$ACTION" in
dump)
  for c in $COLLECTIONS; do
    code=$(curl -s -o "$DIR/src-$c.json" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE/$c/$SRC")
    [ "$code" = 200 ] || rm -f "$DIR/src-$c.json"
    if [ "$(has "$c" "$DST")" = 200 ]; then
      case "$c" in
        Players|Members) dst='有 !!! 涉及权益，停下问用户怎么合并';;
        *) dst='有（将被旧号整份覆盖）';;
      esac
    else
      dst=无
    fi
    printf '%-22s 旧号:%s  新号:%s\n' "$c" "$([ "$code" = 200 ] && echo 有 || echo 无)" "$dst"
  done
  echo "备份已存到 $DIR"
  ;;
copy)
  for c in $COLLECTIONS; do
    [ -f "$DIR/src-$c.json" ] || continue
    node -e '
      const fs=require("fs"),[src,dst,id]=process.argv.slice(1);
      const j=JSON.parse(fs.readFileSync(src,"utf8"));
      delete j.name; delete j.createTime; delete j.updateTime;
      if (j.fields.id) j.fields.id.stringValue=id;
      if (j.fields.steamId) j.fields.steamId.integerValue=id;
      fs.writeFileSync(dst,JSON.stringify(j));
    ' "$DIR/src-$c.json" "$DIR/dst-$c.json" "$DST"
    curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d @"$DIR/dst-$c.json" "$BASE/$c/$DST" -o /dev/null
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE/$c/$DST" -o "$DIR/new-$c.json"
    node -e '
      const fs=require("fs"),[a,b,c]=process.argv.slice(1);
      const f=p=>JSON.parse(fs.readFileSync(p,"utf8")).fields;
      const n=o=>{const x=JSON.parse(JSON.stringify(o));
        if(x.id)x.id.stringValue="X"; if(x.steamId)x.steamId.integerValue="X";
        return JSON.stringify(x,Object.keys(x).sort())};
      console.log(c.padEnd(22), n(f(a))===n(f(b))?"一致":"!!! 不一致，停下排查");
    ' "$DIR/src-$c.json" "$DIR/new-$c.json" "$c"
  done
  ;;
delete)
  for c in $COLLECTIONS; do
    [ -f "$DIR/src-$c.json" ] || continue
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/$c/$SRC" -o /dev/null
    echo "deleted $c/$SRC"
  done
  ;;
verify)
  for c in $COLLECTIONS; do
    printf '%-22s 旧号:%s  新号:%s\n' "$c" \
      "$([ "$(has "$c" "$SRC")" = 200 ] && echo '!!! 仍存在' || echo 已删除)" \
      "$([ "$(has "$c" "$DST")" = 200 ] && echo 存在 || echo '!!! 缺失')"
  done
  ;;
esac
```

## 最后给玩家一段通知文本

迁移做完后，生成一段可以直接转发给玩家的话，**用玩家视角写**，三两句，不寒暄：

- **写明从哪个 ID 转到哪个 ID**，两个数字都写出来，玩家要靠它确认没搬错号
- **写转移的积分**：勇士积分和会员积分，给累计值和可用值
- **会员只在仍然有效时提，并写出到期日**。不存在会员或已经过期就一个字都不提——玩家看到「已过期」会以为是迁移弄丢的
- **属性加点和英雄觉醒不列数值**，让玩家自己进游戏看
- 不出现集合名、字段名，也不讲是怎么做到的

模板：

> 你的数据已经从 <旧 ID> 转到 <新 ID> 了。勇士积分 <累计>（可用 <可用>）、会员积分 <累计>（可用 <可用>）。进游戏看一下积分、属性加点和英雄觉醒对不对，有问题随时找我。

会员仍然有效时，在积分那句后面接一句：

> 会员有效期到 <到期日>。
