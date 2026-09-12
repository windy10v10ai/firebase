# Repository conventions for Claude

本仓库为 Firebase + Cloud Functions（NestJS API） + Next.js Web 的 monorepo，DOTA2 自定义游戏后端。完整启动命令见 `README.md`。

本文只写全仓库通用的约定，分四组：输出规范、仓库结构、代码规范、交付流程。各子目录的启动方式、校验命令、专属规约写在自己的 `CLAUDE.md` 里，改哪个目录看哪一份。

---

## 输出规范

### 语言

**默认用中文（简体）**，除非用户明确要求英文。按场景：

| 场景 | 语言 |
|---|---|
| 对话回复、review 报告、说明文档 | 中文 |
| 代码注释 | 中文，写法见「注释规约」 |
| PR 正文 | 中文，写法见「回复风格」 |
| 提交信息、PR 标题 | 英文 |
| 代码标识符（类名、函数名、变量名） | 英文 |
| 技术术语、API 名称、类名等的引用 | 原样，不翻译 |

讨论代码时中英混用：解释用中文，代码引用用英文。

### 回复风格

读者每天处理大量事务、精力有限。回复必须做到：

- **先说结论，再展开**。重点放第一句，细节往后放
- **短**。短词、短句、短段落，段落之间用标题或列表分层
- **说人话**。不用生僻词和行话，常见技术词（缓存、接口、轮询）可以用
- **少提代码名字**。函数名、变量名先用中文说清它是干什么的，代码名只作为补充。路径和命令除外
- **给出行动**。告诉用户下一步该做什么，不要只罗列现象
- **砍掉不重要的细节**，不写客套和铺垫
- **短不等于省略背景**。下结论前先交代清楚这是什么、发生在什么情况下。宁可多写一段背景，也不要让读者看不懂结论从哪来
- **解释改动按固定顺序展开**：原来是什么 → 改成什么 → 代码要做的事 → 问题在哪 → 用户要做什么。跳过第一步读者就接不上

约束的是**写给用户看的内容**：对话回复、review 报告、总结与说明文档、PR 正文。

**例外**：CLAUDE.md / AGENTS.md 这类规则文档的首要读者是模型，**准确优先于通俗**，该写全的字段名、API 名、路径要写全，不为了好懂而模糊化。

### 注释规约

只写**为什么这样做**，不写**这行代码做了什么**——读者能从代码本身读懂的，不要再用注释复述一遍。一条注释如果只是对代码的复述，宁可不写：字段名、数值、分支行为都会随代码演进，注释里的副本不会跟着更新，两者一旦不一致，读者反而无法判断谁是真相源。

不写：

- 单行字段含义的复述（`// 上限 500` 跟在 `MAX_POINTS = 500` 后面就是冗余）
- 分支、循环等代码本身已经表达清楚的控制流说明
- 「移植自 xxx」「参考 yyy 实现」之类来源说明（git 历史会保留）
- **禁止**把讨论中出现的具体场景 / 边界 case / 取舍过程 / 例子（具体数值、变量名、实测数据等）搬进注释。哪怕讨论时反复提到，注释里也只留一句概括性的设计意图，一个具体例子都不写
- **「A 原来是 X，现在改成 Y」这类对比句式一律整句删除**，不管内容是否属实、措辞是否已经改得足够技术化。只要结构上是在拿过去和现在做对比，就是在叙述变更过程而非陈述设计事实
- 「为什么某方案没有采用」这类逐项列举，属于 PR 描述或设计文档的职责

写完自查是否出现这些词：**原来 / 之前 / 沿用 / 本次 / 此次 / 这里 / 改为 / 额外**——出现即说明在叙述过程，删掉重写或整句删除。

写：

- 选择某个数值或方案的**原因**
- 与默认约定不一致的**特殊处理**
- 公开方法（模块对外接口）用一句话说明**功能**，不点名具体文件、函数、接口路径；不明显的边界情况写成对应代码行上方的行内注释，不要堆进顶部方法说明

一处注释一两行即可，不分段、不用 bullet 列表。

---

## 仓库结构

### 目录

| 目录 | 说明 | 专属规约 |
|---|---|---|
| `api/` | NestJS 后端 API，同时是 Firebase Functions 的源代码 | [api/CLAUDE.md](api/CLAUDE.md) |
| `web/` | Next.js 前端 | [web/CLAUDE.md](web/CLAUDE.md) |
| `extensions/` | Firebase BigQuery export 配置 | — |

### 设计文档与实施计划

两类文档分开存放，覆盖 brainstorming / writing-plans 等 skill 自带的默认路径。

| 类型 | 路径 | 进 git |
|---|---|---|
| 设计文档（brainstorming 产出的 spec） | `docs/design/<主题>/<阶段>.md` | 是 |
| 实施计划（writing-plans 产出的 plan） | `docs/superpowers/plans/YYYY-MM-DD-<名字>.md` | 否，`.gitignore` 已覆盖 `docs/superpowers/` |

- `<主题>`：kebab-case，一个长期方向一个目录，如 `local-host`、`web`
- `<阶段>`：该主题下的阶段或子步骤，如 `phase-1-backend.md`

实施计划不进 git：它随代码合入即失效，留在仓库里会与现行设计混淆，且体量大、不适合放进 PR 供人 review。

### 本地开发

三个服务一起启：根目录 `npm run start`（emulator 没有 `firestore-backup/` 数据目录时仍会以空 DB 启动）。

| 服务 | 端口 | 单独启动 |
|---|---|---|
| Firestore emulator | 8080（UI 4000） | [api/CLAUDE.md](api/CLAUDE.md) |
| NestJS API | 3001（Swagger `/api-doc`） | [api/CLAUDE.md](api/CLAUDE.md) |
| Next.js web | 3000 | [web/CLAUDE.md](web/CLAUDE.md) |

---

## 代码规范

### 设计原则

- 遵循 KISS、DRY、YAGNI：优先选择直接、易读且满足当前需求的实现，避免为低概率场景引入不必要的抽象、复杂性或基础设施。
- 仅在确有复用价值时提取公共逻辑；不要为了假设的未来需求提前设计。
- **改动范围保持最小**：用最简单的机制满足当前需求，不顺手重构、不扩大 diff。
- 「最小」指的是复杂度，不是字符数。为省几个字段而让多处代码必须遵守同一条隐式约定，是把复杂度从数据挪到了逻辑里，不算简化。

### 命名规范

- 局部变量、函数、方法、字段：`camelCase`
- 类、接口、类型、enum：`PascalCase`
- enum 成员：业务上下文决定，多数项目用 `PascalCase` 或 `SCREAMING_SNAKE_CASE`，本仓库以 `PascalCase` 为主（参考 `MemberLevel.NORMAL` 这种已有 `SCREAMING_SNAKE` 的特例除外）
- 文件名：`kebab-case`

NestJS 专属的后缀与目录约定（`*.controller.ts`、DTO、entity 等）见 [api/CLAUDE.md](api/CLAUDE.md)。

### 常量（无状态、编译期确定的字面量）

**首选**：模块级 `const`，`SCREAMING_SNAKE_CASE`。

```ts
// ✅ 推荐：模块级常量
const ALIPAY_TRADE_SUCCESS = 'TRADE_SUCCESS';
const RESET_PROPERTY_MEMBER_POINT_COST = 1000;

@Injectable()
export class FooService { ... }
```

**避免**：把无状态常量作为 `private readonly` 实例字段。它们与实例无关，不应进入构造函数闭包。

```ts
// ❌ 避免
@Injectable()
export class FooService {
  private readonly resetPlayerPropertyMemberPoint = 1000; // 应改为模块级 const
}
```

**例外**：仅当常量需要从 DI/config 注入、或与类紧耦合（如 `static PROPERTY_NAME_LIST` 这种"类的元数据"）时，可以是 `static readonly` / `private static readonly`。

---

## 交付流程

### 分支命名

实现 GitHub issue 时，从 `develop` 切新分支：

```
feature/<issue-id>-<short-kebab-summary>
```

- `<issue-id>`：GitHub issue 编号（纯数字，不带 `#`）
- `<short-kebab-summary>`：3–6 个英文小写单词，`-` 连接，描述本次改动核心
- 例：issue #858「Alipay Step 2: 模块骨架 + 创建二维码接口」→ `feature/858-alipay-module-skeleton`

非 issue 驱动的改动可使用 `fix/...`、`chore/...`、`docs/...` 前缀，命名规则同上。

**不要在 `develop` 分支上直接修改/commit 任何文件**——包括 brainstorming/writing-plans 等 skill 产出的设计文档、实施计划。一旦确定要写文件（即使只是 `docs/design/` 下的草稿），先按上述规则切好 feature/fix/chore 分支，再开始改动。

### 推送到 develop

不直接在本地把 feature 分支合并进 `develop`，统一走 PR：

1. 实现完成后先跑完整校验，全部通过才能推送。改了哪个目录跑哪一套，命令见 [api/CLAUDE.md](api/CLAUDE.md) 与 [web/CLAUDE.md](web/CLAUDE.md) 的「校验」一节
2. `git push -u origin <branch-name>`
3. `gh pr create`，base 为 `develop`，不需要审批的小改动也走这个流程。正文写法见下一节
4. 不要在未明确要求时执行本地 `merge`/`push --force` 到 `develop`
5. 没有自动建 PR 的 workflow，push 之后必须显式执行第 3 步

### PR 正文

标题用英文，正文用中文，写法遵循「回复风格」。

按下列顺序分段，每段一个 `##` 标题。概要、改动说明、测试清单三段必需，界面变化与后续事项按需添加。每段的内部结构自行判断，小改动每段一两句即可。

| 段落 | 必需 | 内容 |
|---|---|---|
| 概要 | 是 | 这个 PR 做什么、对应哪个 issue。堆叠在其他 PR 上时说明依赖关系 |
| 改动说明 | 是 | 先写要解决的问题，再写怎么改。按模块或主题分段，写改动意图，不逐文件复述 diff。涉及行为或性能差异时给实测数字 |
| 界面变化 | 改动碰到网站页面时 | 前后对比截图。是否有外观变化以前后构建的实测对照为准，不以改动意图为准；实测无差异也要写这一节并给出对照数据。做法见 [web/CLAUDE.md](web/CLAUDE.md) 的「PR 截图」 |
| 测试清单 | 是 | 勾选已执行的校验命令，并写明浏览器 / e2e 实测的操作与观察结果 |
| 后续事项 | 有遗留动作时 | 发布后需要复验的项、依赖的配置变更、计划中的后续 PR |

测试清单两条要求：

- 只勾实际执行过的项。未执行的标注「不适用」并说明原因
- 注明验证覆盖的范围与未覆盖的部分。HTTP 状态码不代表业务结果，业务结果单独说明

### 合并方式

合并由用户执行，未明确要求不要代劳。要执行时按 PR 的去向选方式，不要用 `gh pr merge` 的交互式选择：

| PR | 方式 | 命令 |
|---|---|---|
| `feature` / `fix` / `chore` / `docs` → `develop` | squash | `gh pr merge <编号> --squash` |
| `develop` → `main`（Release PR） | merge commit | `gh pr merge <编号> --merge` |

feature 分支的中间提交对 `develop` 的历史没有价值，压成一条。`develop` → `main` 是两条长期分支对齐，保留每条提交，`main` 的历史才与 `develop` 一一对应。

仓库设置里 rebase 已关闭，不是可选项。
