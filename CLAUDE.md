# Repository conventions for Claude

## Branch naming

When implementing a GitHub issue, create a new branch off `develop` named:

```
feature/<issue-id>-<short-kebab-summary>
```

- `<issue-id>` 是 GitHub issue 编号（纯数字，不带 `#`）
- `<short-kebab-summary>` 是 3–6 个英文小写单词、`-` 连接，描述本次改动核心
- 例：issue #858 「Alipay Step 2: 模块骨架 + 创建二维码接口」 → `feature/858-alipay-module-skeleton`

非 issue 驱动的改动可使用 `fix/...`、`chore/...`、`docs/...` 前缀，命名规则同上。
