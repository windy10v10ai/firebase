# 每日挑战本地测试工具

此目录提供只连接 Firestore Emulator 的每日挑战检查/编辑工具，不会连接生产 Firestore。

## 启动 GUI

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\daily-challenge-local\DailyChallenge-LocalGui.ps1
```

默认测试玩家为 `483215844`，可用 `-SteamId` 覆盖。工具要求：

- `FIRESTORE_EMULATOR_HOST` 固定为 `127.0.0.1:8080`；
- 当前仓库 `api/node_modules` 已安装；
- 需要自动创建玩家日状态时，本地鉴权代理位于 `http://127.0.0.1:5000/api`。

GUI 支持读取摘要，以及通过 JSON 执行 `save-personal`、`save-global`、`apply-points`、`grant-reward`。写操作包含 Firestore update-time 前置条件，避免覆盖已变化的数据。

## 自动化测试

```powershell
node --test .\tools\daily-challenge-local\daily-challenge-local.test.cjs
```

禁止把 `.env`、API key、Firestore export、数据库或生产项目配置放入本目录。
