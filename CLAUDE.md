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
