# 技能提示框

> 本文是网站展示 Dota 技能的长期规范：提示框由哪几块组成、数值怎么排、数据从 game 的哪里取。觉醒页先用，wiki 的技能与物品页照同一套做。只在规范变更时更新，不因批次完成而增删。取舍过程见 [phase-3b-2-ability-tooltip.md](../design/web/phase-3b-2-ability-tooltip.md)。

## 一句话结论

**内容和顺序照游戏内的技能提示框，外观用网站自己的中性色与字号。** 同一份技能块同时用在悬浮提示和详情弹窗里，两处只差外框和字号。数据全部由同步脚本从 game 仓库生成，网站不手写数值。

## 1. 组成

顺序固定。某一块没有内容时整块省略，连同它上方的分隔线。

| 块 | 内容 | 例 |
|------|------|------|
| 标题 | 技能图标、技能名、英雄名 | 肉钩 觉醒 / 帕吉 |
| 属性 | 技能、影响、伤害类型、无视减益免疫、能否驱散，有哪项显示哪项 | 技能：自动施放 |
| 描述 | game 本地化的描述，富文本颜色原样保留 | — |
| 数值 | 「标签：各级数值」，一项一行，充能次数与充能时间也在这里 | 伤害：150 / 220 / 290 / 360 / 430 |
| 消耗 | 冷却时间、魔法消耗，各带图标，一行放不下就折行 | — |
| 背景故事 | 放在最底下，次要色 | 利刃所向，皆为收割。 |

悬浮提示带标题块。详情弹窗的标题由弹窗自己的头部承担，技能块从「属性」开始。

## 2. 数值怎么排

- 各级数值用「 / 」连起来，分隔符用 `faint`；各级相同就只写一个值
- 数值 600 字重、标题色；标签次要色。标签以全角冒号结尾时直接接数值，半角冒号后空一格
- 受范围加成影响的数值后面跟圆圈图标，受技能增强影响的跟星形图标
- 颜色是游戏语义，照游戏显示，与网站「每种颜色只管一件事」的分工不冲突——同 `GameText` 保留本地化里的 `<font color>` 是一个口径

| 取值 | 颜色 |
|------|------|
| 伤害类型「物理」 | `dota-physical` `#ae2f28` |
| 伤害类型「魔法」 | `dota-magical` `#5b93d1` |
| 伤害类型「纯粹」 | `dota-pure` `#d8ae53` |
| 受技能增强影响的数值 | 按本技能的伤害类型取上面三色之一 |
| 无视减益免疫「是」 | `success` |
| 能否驱散「仅强驱散」「无法驱散」 | `danger` |

三种伤害类型色取自 Dota 本地化 `DOTA_ToolTip_Damage_*` 里的 `<font color>`。「是」与驱散两项游戏里是 `#70EA72`、`#cc0000`，网站换成语义相同的状态色。

## 3. 外观

| 项 | 悬浮提示 | 详情弹窗里的技能块 |
|------|------|------|
| 宽度 | 340px | 跟随弹窗 |
| 底与描边 | 底 `panel-soft`、描边 `line-strong`、圆角 8px、下方阴影 | 弹窗本身 |
| 标题块 | 底 `panel-raised`，图标 44px，技能名 16px / 700，英雄名 12px | 弹窗头部 |
| 块间距 | 12px，块之间 1px `line` 分隔线 | 18px，同样的分隔线 |
| 属性、数值、消耗 | 13px，行高 20px | 同左 |
| 描述 | 13px，行高 1.65 | 15px，行高 1.65 |
| 背景故事 | 12px，行高 18px | 13px，行高 20px |

冷却、魔法消耗、范围、技能增强四个图标是网站自绘的 SVG（14px / 12px），不取游戏素材。魔法消耗图标用 `dota-mana` `#2f7fd6`。

## 4. 交互

- **悬浮提示只在电脑档出现**：鼠标停在卡片上或键盘聚焦卡片时显示，判断条件是 `(min-width: 1024px) and (hover: hover)`。平板和手机按触控设备对待，点卡片进详情弹窗，数值一样看得到
- **挂在卡片右侧，箭头对着卡片上部**；右边放不下就翻到左边。提示框属于整张卡，不去对准卡里的某个元素
- **底边出屏时整体上移**，箭头反向补偿，仍对着卡片原来的位置；上移不越过视口顶端
- 提示框本身不可点、不可滚动，内容就是全部；对读屏隐藏，读屏用户点开详情弹窗拿到同一份内容

## 5. 数据从哪来

技能与物品都是 Valve KeyValues，下面的规则两者通用。

| 块 | 来源 |
|------|------|
| 技能名、描述、背景故事 | 本地化 `DOTA_Tooltip_ability_<技能名>`、`_Description`、`_Lore` |
| 属性 | KV 的 `AbilityBehavior`、`AbilityUnitTargetTeam`、`AbilityUnitTargetType`、`AbilityUnitDamageType`、`SpellImmunityType`、`SpellDispellableType` |
| 属性的标签与取值文案 | 网站 i18n 的 `ability` 命名空间，措辞照抄 Dota 本地化 `dota_*.txt` 里的 `DOTA_ToolTip_Ability_*`、`_Targeting_*`、`_Damage_*`、`_PiercesSpellImmunity_*`、`_Dispellable_*` |
| 数值 | `AbilityValues` 各项，加上写在顶层的 `AbilityCharges`、`AbilityChargeRestoreTime`；标签是本地化 `DOTA_Tooltip_ability_<技能名>_<key>` |
| 消耗 | `AbilityCooldown`、`AbilityManaCost`，可能写在技能顶层，也可能写在 `AbilityValues` 里，两处都要找；各级全为 0 不显示 |

一个技能在多个 KV 文件里出现时（自定义文件覆盖原版），低优先级先铺、高优先级逐项覆盖，行的顺序以原版写法为准。本地化查找不分大小写，game 的文件优先，原版文件兜底。

数值行的取舍：

- **没有本地化标签的 key 不展示**，那是脚本内部用的参数
- **各级取值全为 0 的不展示**：这类数值只有天赋、神杖、魔晶生效时才有值，游戏的悬停提示也不显示
- **带 `RequiresScepter` 或 `RequiresShard` 的不展示**：拥有神杖、魔晶才出现
- **`"value"` 嵌套写法只取 `value`**，同块里的 `special_bonus_*` 等天赋加成键不展示
- **标签以 `%` 开头表示数值带百分号**：显示时去掉标签里的 `%`，给每级数值加上 `%`
- **范围加成**：同块写了 `"affected_by_aoe_increase" "1"`
- **技能增强**：同块写了 `"CalculateSpellDamageTooltip" "1"`；没写这个标记时，伤害类型为魔法或纯粹、key 名含 `damage`、且不是百分比的数值算受影响，写了 `"0"` 则不算

属性的取法：

- **技能**：`AbilityBehavior` 只取一个显示，优先级为 切换 > 持续施法 > 自动施放 > 光环 > 被动 > 单位或点目标（同时有 `UNIT_TARGET` 与 `POINT`）> 单位目标 > 点目标 > 无目标
- **影响**：`AbilityUnitTargetTeam` 定敌方、友方或双方；`AbilityUnitTargetType` 只含 `HERO` 不含 `BASIC` 时写「英雄」，否则写「单位」；没写类型时只写「敌方」「友方」
- **无视减益免疫**：`SPELL_IMMUNITY_*_YES` 为是、`*_NO` 为否，`ALLIES_YES_ENEMIES_NO` 单独一种
- **能否驱散**：`SPELL_DISPELLABLE_YES_STRONG` 仅强驱散、`YES` 是、`NO` 无法驱散

描述的处理：

- **从左到右扫一遍**：遇到 `%%` 输出一个 `%`，遇到 `%名字%` 换成数值。`%%` 是转义，只替换占位符不还原转义，页面上就会出现「80%%」
- 占位符取不到值时同步自检报错，不生成

物品的本地化 key 同样是 `DOTA_Tooltip_ability_item_<名>` 这一套；价格、合成等物品独有的字段做 wiki 时补进本文。

## 6. 参考与没选的

字段划分与 OpenDota 的 [dotaconstants](https://github.com/odota/dotaconstants)（MIT）一致：behavior、dmg_type、bkbpierce、dispellable、attrib、mc、cd、lore。它的 [AbilityTooltip](https://github.com/odota/web/tree/master/src/components/AbilityTooltip) 组件没有直接引用：用的是 styled-components，与网站的 Tailwind 不是一套；数据只有原版技能，game 的自定义技能数值不同，必须从 game 仓库取。

没有「能否破坏」一栏：Dota 本地化里没有对应的标签，游戏提示框也不显示。
