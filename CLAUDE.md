# Repository conventions for Claude

本仓库为 Firebase + Cloud Functions（NestJS API） + Next.js Web 的 monorepo，DOTA2 自定义游戏后端。完整启动命令见 `README.md`。

## 项目结构

| 目录 | 说明 |
|---|---|
| `api/` | NestJS 后端 API，同时是 Firebase Functions 的源代码 |
| `web/` | Next.js 前端 |
| `extensions/` | Firebase BigQuery export 配置 |

## 本地开发

1. **Firestore emulator**（必须先启动）：`firebase emulators:start --only firestore --project windy10v10ai`
2. **API**（依赖 `FIRESTORE_EMULATOR_HOST=localhost:8080`）：`cd api && npm run start` 或 `npm run start:debug`
3. **Web**：`cd web && npm run dev`
4. 三个一起启：根目录 `npm run start`（emulator 没有 `firestore-backup/` 数据目录时仍会以空 DB 启动）

### 端口

- Firestore emulator: 8080，Emulator UI: 4000
- NestJS API: 3001，Swagger: 3001/api-doc
- Next.js web: 3000

## 测试

- **Unit**：`cd api && npm run test`（无需 emulator）
- **E2E**：`cd api && npm run test:e2e`（自带 `firebase emulators:exec`，跑前要确认 8080 没被占用）
- **Lint**：`cd api && npm run lint`、`cd web && npm run lint`

## 常见坑

- `firestore-backup/` 不在仓库里，是从 GCP `gsutil` 拉的；没有它时不要带 `--import` 启动 emulator
- API 通过 `FIRESTORE_EMULATOR_HOST` 连本地 emulator；忘记设这个变量会去连生产 Firestore 然后失败（无凭证）
- Firestore emulator 需要 Java JRE
- E2E 自管 emulator 生命周期；跑之前先杀掉占用 8080 的进程

## 分支命名

实现 GitHub issue 时，从 `develop` 切新分支：

```
feature/<issue-id>-<short-kebab-summary>
```

- `<issue-id>`：GitHub issue 编号（纯数字，不带 `#`）
- `<short-kebab-summary>`：3–6 个英文小写单词，`-` 连接，描述本次改动核心
- 例：issue #858「Alipay Step 2: 模块骨架 + 创建二维码接口」→ `feature/858-alipay-module-skeleton`

非 issue 驱动的改动可使用 `fix/...`、`chore/...`、`docs/...` 前缀，命名规则同上。

**不要在 `develop` 分支上直接修改/commit 任何文件**——包括 brainstorming/writing-plans 等 skill 产出的设计文档、实施计划。一旦确定要写文件（即使只是 `docs/superpowers/` 下的草稿），先按上述规则切好 feature/fix/chore 分支，再开始改动。

## 推送到 develop 的流程

不直接在本地把 feature 分支合并进 `develop`，统一走 PR：

1. 实现完成后先跑完整校验（unit + lint + e2e，见上方「测试」一节），全部通过才能推送
2. `git push -u origin <branch-name>`
3. `gh pr create`，base 为 `develop`；PR body 用 `## Summary` + `## Test plan`（勾选已跑过的校验项），不需要审批的小改动也走这个流程；标题用英文
4. 不要在未明确要求时执行本地 `merge`/`push --force` 到 `develop`
5. 不再依赖 `.github/workflows/create_develop_pr.yml` 自动建 PR（已废弃删除）——push 后必须显式执行第 3 步

## 命名规范

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

### 变量与函数

- 局部变量、函数、方法、字段：`camelCase`
- 类、接口、类型、enum：`PascalCase`
- enum 成员：业务上下文决定，多数项目用 `PascalCase` 或 `SCREAMING_SNAKE_CASE`，本仓库以 `PascalCase` 为主（参考 `MemberLevel.NORMAL` 这种已有 `SCREAMING_SNAKE` 的特例除外）
- DTO 类后缀 `Dto`，entity 类无后缀（参考 `Player`、`Member`）

### 文件名

- TypeScript 文件：`kebab-case`，按职责加后缀：`*.controller.ts` / `*.service.ts` / `*.module.ts` / `*.entity.ts` / `*.dto.ts`
- 测试：`*.spec.ts`（unit）、`*.e2e-spec.ts`（e2e）

## Firestore 操作规范

### 删除字段

`undefined` 赋值**不会**删除 Firestore 字段，字段会保留旧值。需要删除字段时必须用 `FieldValue.delete()`：

```ts
import { FieldValue } from 'firebase-admin/firestore';

// ✅ 正确：真正删除字段
preset[dto.map] = FieldValue.delete() as any;

// ❌ 错误：字段不会被删除
preset[dto.map] = undefined;
```

### E2E 测试规范

- **有 Firestore 持久化副作用的 bug 必须先写 e2e 复现（验证 bug 确实发生），再修复，再验证测试通过**
- E2E 用 `test/` 目录下的 `*.e2e-spec.ts`，通过 HTTP 请求验证完整行为（包括持久化后重新读取）
- 各测试用例使用独立 steamId（不同用例间不共享），避免状态污染
- 工具函数放 `test/util/` 下复用

## 模块化模式（player 子模块为例）

新增独立子功能时遵循以下模式：

1. `entities/foo.entity.ts` — Firestore `@Collection()` + 字段定义
2. `dto/update-foo.dto.ts` — 请求体 DTO（class-validator 校验）
3. `foo.service.ts` — 业务逻辑，`getOrGenerateDefault` 负责首次创建
4. `player.module.ts` — `FireormModule.forFeature` 注册 entity，`providers`/`exports` 注册 service
5. `player.controller.ts` — 添加路由，鉴权与现有接口一致
